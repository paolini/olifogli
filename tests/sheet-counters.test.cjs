const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const { ObjectId } = require('mongodb');

// Real resolvers with in-memory collections. Every read and write made while
// a transaction is open must use its session.
const root = path.resolve(__dirname, '..');
const SESSION = { synthetic: 'session' };

function matches(doc, filter) {
  return Object.entries(filter).every(([key, condition]) => {
    const value = doc[key];
    if (condition && typeof condition === 'object' && '$in' in condition) return condition.$in.some(c => String(c) === String(value));
    if (condition === null) return value === undefined || value === null;
    if (condition instanceof Date) return value instanceof Date && value.getTime() === condition.getTime();
    return String(value) === String(condition);
  });
}

function collection(name, store, log) {
  const docs = () => store[name];
  const check = (op, options) => { if (store.inTransaction && options?.session !== SESSION) throw new Error(`${name}.${op} without session`); log.push(`${name}.${op}`); };
  return {
    find(filter, options) { check('find', options); return { toArray: async () => docs().filter(d => matches(d, filter)).map(d => ({ ...d })) }; },
    async findOne(filter, options) { check('findOne', options); const doc = docs().find(d => matches(d, filter)); return doc ? { ...doc } : null; },
    async distinct(field, filter) { return [...new Map(docs().filter(d => matches(d, filter)).map(d => [String(d[field]), d[field]])).values()]; },
    async updateOne(filter, update, options) {
      check('updateOne', options);
      const doc = docs().find(d => matches(d, filter));
      if (!doc) return { matchedCount: 0 };
      Object.assign(doc, update.$set ?? {});
      for (const [k, v] of Object.entries(update.$inc ?? {})) doc[k] = (doc[k] ?? 0) + v;
      return { matchedCount: 1, acknowledged: true };
    },
    async bulkWrite(ops, options) {
      check('bulkWrite', options);
      for (const op of ops) {
        if (op.replaceOne) { store[name] = docs().filter(d => !matches(d, op.replaceOne.filter)); docs().push({ ...op.replaceOne.replacement }); }
        if (op.updateOne) await this.updateOne(op.updateOne.filter, op.updateOne.update, options);
      }
    },
    async deleteMany(filter, options) { check('deleteMany', options); store[name] = docs().filter(d => !matches(d, filter)); },
  };
}

function fixture() {
  const sheetId = new ObjectId();
  const workbookId = new ObjectId();
  const userId = new ObjectId();
  const row = (error, anomalies, synced) => ({ _id: new ObjectId(), sheetId, error, anomalies, data: { name: 'x' },
    updatedOn: new Date('2026-01-01'), ...(synced ? { olimanager: { resultsUpdatedOn: new Date(), error: '' } } : {}) });
  const store = {
    users: [{ _id: userId, email: 'admin@example.org', isAdmin: true }],
    sheets: [{ _id: sheetId, workbookId, schema: 'test', permissions: [], commonData: {}, nRows: 3, nValidRows: 2, nSyncedRows: 1, anomalies: 3 }],
    workbooks: [{ _id: workbookId, commonData: {} }],
    rows: [row('', 1, true), row('', 2, false), row('errore', 0, false)],
    deleted_rows: [], deleted_sheets: [],
    inTransaction: false,
  };
  const log = [];
  const published = [];
  const database = {
    getUsersCollection: async () => collection('users', store, log),
    getSheetsCollection: async () => collection('sheets', store, log),
    getRowsCollection: async () => collection('rows', store, log),
    getWorkbooksCollection: async () => collection('workbooks', store, log),
    getDb: async () => ({ collection: name => collection(name, store, log) }),
    async withTransaction(run) {
      store.inTransaction = true;
      const backup = structuredClone(Object.fromEntries(Object.entries(store).filter(([, v]) => Array.isArray(v))));
      try { return await run(SESSION); }
      catch (error) { Object.assign(store, backup); throw error; }
      finally { store.inTransaction = false; }
    },
  };
  const schema = {
    clean: data => data,
    validationContext: () => ({}),
    onCompute: () => {},
    computeDerivedData(data) { this.onCompute(); return this.derive(data); },
    derive: data => ({ data, error: data.name === 'bad' ? 'non valido' : '', anomalies: data.name === 'odd' ? 5 : 0 }),
    fields_sensitive_names: [], fields_sensitive_dates: [],
  };
  const cache = new Map();
  function load(relative) {
    const filename = path.resolve(root, relative);
    if (cache.has(filename)) return cache.get(filename);
    const exports = {};
    cache.set(filename, exports);
    const source = ts.transpileModule(readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    }).outputText;
    vm.runInNewContext(source, { exports, console, structuredClone, require(id) {
      if (id.endsWith('/mongodb') && id.startsWith('@')) return database;
      if (id === 'mongodb' || id === 'bson' || id === 'apollo-server-errors') return require(id);
      if (id.endsWith('/pubsub')) return { TOPICS: new Proxy({}, { get: (_, n) => x => `${String(n)}.${x}` }), workbookUpdatedPayload: () => ({ workbookUpdated: true }) };
      if (id.endsWith('/appLog')) return { appLog() {} };
      if (id.endsWith('/schema')) return { schemas: { test: schema } };
      if (id === '../types' || id.endsWith('/models') || id === '../generated') return {};
      if (id.startsWith('./') || id.startsWith('../../lib/')) {
        if (id === '../../lib/pubsub') return { TOPICS: new Proxy({}, { get: (_, n) => x => `${String(n)}.${x}` }), workbookUpdatedPayload: () => ({ workbookUpdated: true }) };
        return load(path.relative(root, path.resolve(path.dirname(filename), id + '.ts')));
      }
      throw new Error(`Unexpected dependency: ${id}`);
    } }, { filename });
    return exports;
  }
  const context = { user_id: userId, pubsub: { publish: (topic, payload) => published.push({ topic, payload }) } };
  const call = (name, args) => load(`app/graphql/resolvers/${name}.ts`).default(null, args, context);
  return { store, log, published, call, sheetId, schema, sheet: () => store.sheets[0] };
}

const counters = sheet => [sheet.nRows, sheet.nValidRows, sheet.nSyncedRows, sheet.anomalies];

test('deleteAllRows copies, deletes and updates every counter (including nSyncedRows) in the transaction', async () => {
  const f = fixture();
  assert.equal(await f.call('deleteAllRows', { sheetId: f.sheetId }), 3);
  assert.deepEqual(counters(f.sheet()), [0, 0, 0, 0]);
  assert.equal(f.store.rows.length, 0);
  assert.equal(f.store.deleted_rows.length, 3);
  assert.ok(f.store.deleted_rows.every(row => row.deletedBy === 'admin@example.org'));
  assert.ok(f.log.includes('rows.find'));
  assert.ok(f.published.some(event => event.topic.startsWith('ROWS_DELETED')));
});

test('deleteRows decrements the counters of the deleted rows only', async () => {
  const f = fixture();
  const [synced] = f.store.rows;
  assert.equal(await f.call('deleteRows', { ids: [synced._id] }), 1);
  assert.deepEqual(counters(f.sheet()), [2, 1, 0, 2]);
  assert.equal(f.store.deleted_rows.length, 1);
});

test('deleteRow decrements nSyncedRows too', async () => {
  const f = fixture();
  await f.call('deleteRow', { _id: f.store.rows[0]._id });
  assert.deepEqual(counters(f.sheet()), [2, 1, 0, 2]);
});

for (const name of ['deleteSheet', 'deleteSheets']) {
  test(`${name} moves the sheet and its rows to the trash in one transaction`, async () => {
    const f = fixture();
    await f.call(name, name === 'deleteSheet' ? { _id: f.sheetId } : { ids: [f.sheetId] });
    assert.equal(f.store.sheets.length, 0);
    assert.equal(f.store.rows.length, 0);
    assert.equal(f.store.deleted_sheets.length, 1);
    assert.equal(f.store.deleted_rows.length, 3);
  });
}

test('a failure while deleting sheets leaves rows and sheets unchanged', async () => {
  const f = fixture();
  const original = f.store.sheets;
  Object.defineProperty(f.store, 'deleted_sheets', { get() { throw new Error('write failed'); }, set() {}, configurable: true });
  await assert.rejects(f.call('deleteSheets', { ids: [f.sheetId] }), /write failed/);
  assert.equal(f.store.rows.length, 3);
  assert.equal(f.store.sheets.length, original.length);
});

test('patchRow: a concurrent change between the check and the update is a conflict, without counter changes', async () => {
  const f = fixture();
  const target = f.store.rows[0];
  const seen = new Date(target.updatedOn);
  // Another save commits after patchRow checked updatedOn, before its transaction.
  f.schema.onCompute = () => { target.updatedOn = new Date('2026-02-01'); };
  await assert.rejects(f.call('patchRow', { _id: target._id, updatedOn: seen, data: { name: 'bad' } }), /modificata da qualcun altro/);
  assert.deepEqual(counters(f.sheet()), [3, 2, 1, 3]);
  assert.equal(target.data.name, 'x');
});

test('patchRow updates the row and the counter deltas when nobody else changed it', async () => {
  const f = fixture();
  const target = f.store.rows[0];
  await f.call('patchRow', { _id: target._id, updatedOn: target.updatedOn, data: { name: 'bad' } });
  assert.deepEqual(counters(f.sheet()), [3, 1, 1, 2]);
});

test('validateRows is admin only and sets the counters from the rows read in the transaction', async () => {
  const f = fixture();
  f.store.sheets[0].nValidRows = 99; // drift is corrected
  f.store.rows[1].data.name = 'odd';
  f.store.rows[2].data.name = 'fine';
  assert.equal(await f.call('validateRows', { sheetId: f.sheetId }), 3);
  assert.deepEqual(counters(f.sheet()), [3, 3, 1, 5]);
  assert.ok(f.published.some(event => event.topic.startsWith('SHEET_UPDATED')));
  f.store.users[0].isAdmin = false;
  await assert.rejects(f.call('validateRows', { sheetId: f.sheetId }), error => error.extensions?.code === 'FORBIDDEN');
});
