const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const { ObjectId } = require('mongodb');

// Run the real resolvers and authorization helpers against in-memory collections.
const root = path.resolve(__dirname, '..');
function fixture({ role = 'view', isAdmin = false, sheet: sheetFields = {} } = {}) {
  const userId = new ObjectId();
  const sheetId = new ObjectId();
  const state = {
    user: { _id: userId, email: 'teacher@example.org', isAdmin },
    sheet: {
      _id: sheetId, workbookId: new ObjectId(), ownerId: new ObjectId(), schema: 'known', name: 'Foglio',
      permissions: role ? [{ email: 'teacher@example.org', role }] : [], ...sheetFields,
    },
    job: { _id: new ObjectId(), sheetId, ownerId: userId },
    redis: [], published: [], sheetUpdates: [], deleted: [],
  };
  const sheets = {
    async findOne(query) { return query._id?.equals(sheetId) ? state.sheet : null; },
    async updateOne(query, update) { state.sheetUpdates.push(update); return { acknowledged: true, matchedCount: 1 }; },
    aggregate: () => ({ toArray: async () => [] }),
  };
  const database = {
    async getUsersCollection() { return { async findOne() { return state.user; } }; },
    async getSheetsCollection() { return sheets; },
    async getRowsCollection() { return { aggregate: () => ({ toArray: async () => [{ nRows: 2, nValidRows: 1, nSyncedRows: 0, anomalies: 3 }] }) }; },
    async getScanJobsCollection() { return {
      async findOne() { return state.job; },
      async deleteOne() { state.deleted.push('job'); },
    }; },
    async getScanResultsCollection() { return {
      find: () => ({ toArray: async () => [{ synthetic: true }] }),
      async deleteMany() { state.deleted.push('results'); },
    }; },
    async withTransaction(run) { return run({}); },
  };
  const redis = {
    async hgetall() { return { a: JSON.stringify({ email: 'other@example.org', tabId: 't' }) }; },
    async hset(...args) { state.redis.push(['hset', ...args]); },
    async hdel(...args) { state.redis.push(['hdel', ...args]); },
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
    vm.runInNewContext(source, {
      exports, console,
      require(id) {
        if (id.endsWith('/mongodb')) return database;
        if (id.endsWith('/redis')) return { redis, CURSOR_KEY: id => `SHEET_CURSORS.${id}`, CURSOR_FIELD: (u, t) => `${u}:${t}` };
        if (id.endsWith('/pubsub')) return {
          TOPICS: new Proxy({}, { get: (_, name) => id => `${String(name)}.${id}` }),
          workbookUpdatedPayload: () => ({ workbookUpdated: true }),
        };
        if (id.endsWith('/schema')) return { schemas: { known: {} } };
        if (id.endsWith('/appLog')) return { appLog() {} };
        if (id === './utils') return load('app/graphql/resolvers/utils.ts');
        if (id === '../types' || id.endsWith('/models')) return {};
        if (['mongodb', 'bson', 'apollo-server-errors'].includes(id)) return require(id);
        throw new Error(`Unexpected dependency: ${id}`);
      },
    }, { filename });
    return exports;
  }
  const context = { user_id: userId, pubsub: { publish(topic, payload) { state.published.push({ topic, payload }); } } };
  const call = (name, args) => load(`app/graphql/resolvers/${name}.ts`).default(null, args, context);
  return { state, sheetId, call, context };
}

const code = expected => error => error.extensions?.code === expected;

test('cursors and moveCursor require authentication and read access to the sheet', async () => {
  const f = fixture({ role: null });
  for (const name of ['cursors', 'moveCursor']) {
    await assert.rejects(f.call(name, { sheetId: f.sheetId, tabId: 't', lineKey: 'r' }), code('FORBIDDEN'));
    f.context.user_id = undefined;
    await assert.rejects(f.call(name, { sheetId: f.sheetId, tabId: 't' }), code('UNAUTHENTICATED'));
    f.context.user_id = f.state.user._id;
  }
  assert.deepEqual(f.state.redis, []);
  assert.deepEqual(f.state.published, []);
});

test('moveCursor stores the cursor under the user and tab; viewers may read cursors', async () => {
  const f = fixture({ role: 'view' });
  assert.equal((await f.call('cursors', { sheetId: f.sheetId })).length, 1);
  await f.call('moveCursor', { sheetId: f.sheetId, tabId: 'tab', lineKey: 'r', fieldName: 'f' });
  await f.call('moveCursor', { sheetId: f.sheetId, tabId: 'tab' });
  const field = `${f.state.user._id}:tab`;
  assert.deepEqual(f.state.redis.map(([op, , key]) => [op, key]), [['hset', field], ['hdel', field]]);
});

test('updateSheet no longer accepts counters', async () => {
  const f = fixture({ role: 'admin' });
  await f.call('updateSheet', { _id: f.sheetId, nValidRows: 100, anomalies: 0 });
  assert.deepEqual(f.state.sheetUpdates, []);
});

test('updateSheet rejects unknown schemas and roles, and owner grants by sheet admins', async () => {
  const f = fixture({ role: 'admin' });
  await assert.rejects(f.call('updateSheet', { _id: f.sheetId, schema: 'missing' }), code('BAD_USER_INPUT'));
  await assert.rejects(f.call('updateSheet', { _id: f.sheetId, schema: '__proto__' }), code('BAD_USER_INPUT'));
  await assert.rejects(f.call('updateSheet', { _id: f.sheetId, permissions: [{ email: 'x@example.org', role: 'Editor' }] }), code('BAD_USER_INPUT'));
  await assert.rejects(f.call('updateSheet', { _id: f.sheetId, permissions: [{ email: 'x@example.org', role: 'owner' }] }), code('FORBIDDEN'));
  assert.deepEqual(f.state.sheetUpdates, []);
  await f.call('updateSheet', { _id: f.sheetId, schema: 'known', permissions: [{ email: 'teacher@example.org', role: 'admin' }, { email: 'x@example.org', role: 'view' }] });
  assert.equal(f.state.sheetUpdates.length, 1);
});

test('existing owner entries can be kept by sheet admins; system admins may grant owner', async () => {
  const kept = fixture({ role: 'admin' });
  kept.state.sheet.permissions.push({ email: 'boss@example.org', role: 'owner' });
  await kept.call('updateSheet', { _id: kept.sheetId, permissions: kept.state.sheet.permissions });
  const admin = fixture({ role: null, isAdmin: true });
  await admin.call('updateSheet', { _id: admin.sheetId, permissions: [{ email: 'boss@example.org', role: 'owner' }] });
  assert.equal(kept.state.sheetUpdates.length + admin.state.sheetUpdates.length, 2);
});

for (const status of ['locked', 'closed']) {
  test(`name and schema of a ${status} sheet can be changed only by system admins`, async () => {
    const f = fixture({ role: 'admin', sheet: { [status]: true } });
    await assert.rejects(f.call('updateSheet', { _id: f.sheetId, name: 'Altro' }), code('FORBIDDEN'));
    await assert.rejects(f.call('updateSheet', { _id: f.sheetId, schema: 'known' }), code('FORBIDDEN'));
    const admin = fixture({ role: null, isAdmin: true, sheet: { [status]: true } });
    await admin.call('updateSheet', { _id: admin.sheetId, name: 'Altro' });
    assert.equal(admin.state.sheetUpdates.length, 1);
  });
}

test('recountSheet is admin only and stores the counters computed from the rows', async () => {
  const f = fixture({ role: 'admin' });
  await assert.rejects(f.call('recountSheet', { _id: f.sheetId }), code('FORBIDDEN'));
  const admin = fixture({ role: null, isAdmin: true });
  await admin.call('recountSheet', { _id: admin.sheetId });
  const { $set } = admin.state.sheetUpdates[0];
  assert.deepEqual([$set.nRows, $set.nValidRows, $set.nSyncedRows, $set.anomalies], [2, 1, 0, 3]);
});

test('scan results require current access to the sheet, even for the job owner', async () => {
  const f = fixture({ role: null });
  await assert.rejects(f.call('scanResults', { jobId: f.state.job._id }), code('FORBIDDEN'));
  f.state.sheet.permissions = [{ email: 'teacher@example.org', role: 'view' }];
  assert.equal((await f.call('scanResults', { jobId: f.state.job._id })).length, 1);
});

for (const status of ['locked', 'closed', 'view-only']) {
  test(`the job owner cannot delete a scan on a ${status} sheet`, async () => {
    const f = status === 'view-only' ? fixture({ role: 'view' }) : fixture({ role: 'editor', sheet: { [status]: true } });
    await assert.rejects(f.call('deleteScan', { jobId: f.state.job._id }), code('FORBIDDEN'));
    assert.deepEqual(f.state.deleted, []);
  });
}

test('the job owner with edit rights can delete a scan', async () => {
  const f = fixture({ role: 'editor' });
  assert.equal(await f.call('deleteScan', { jobId: f.state.job._id }), true);
  assert.deepEqual(f.state.deleted, ['results', 'job']);
});
