const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const { ObjectId } = require('mongodb');

// Run the real resolver and authorization helpers without a live database.
function fixture({ user, existing = false, permissions = [{ email: 'teacher@example.org', role: 'editor' }] } = {}) {
  const userId = new ObjectId();
  const sheetId = new ObjectId();
  const workbookId = new ObjectId();
  const targetId = new ObjectId();
  const calls = { users: 0, domain: 0, converted: 0, sheets: [], rows: [], updates: [] };
  const original = {
    _id: targetId, workbookId, schema: 'target', name: 'Imported', ownerId: new ObjectId(),
    permissions: [{ email: 'existing@example.org', role: 'view' }], commonData: {},
    nRows: 0, nValidRows: 0, anomalies: 0,
  };
  const database = {
    async getUsersCollection() {
      calls.users++;
      return { async findOne() { return user ? { _id: userId, email: 'admin@example.org', ...user } : null; } };
    },
    async getSheetsCollection() {
      calls.domain++;
      return {
        async findOne(query) {
          return query._id ? { _id: sheetId, workbookId, schema: 'source' } : existing ? original : null;
        },
        async insertOne(value) { calls.sheets.push(value); return { insertedId: targetId }; },
        async updateOne(query, update) { calls.updates.push({ query, update }); },
      };
    },
    async getWorkbooksCollection() {
      calls.domain++;
      return { async findOne() { return { _id: workbookId, commonData: { olimanager_contest_id: '2026' } }; } };
    },
    async getRowsCollection() {
      calls.domain++;
      return {
        async *find() { yield { _id: new ObjectId(), data: {} }; },
        async findOne() { return null; },
        async insertOne(value) { calls.rows.push(value); return { insertedId: new ObjectId() }; },
      };
    },
  };
  const schemas = {
    source: { row_to_sheet() {
      calls.converted++;
      return {
        sheet: { name: 'Imported', schema: 'target', permissions, data: { district: 'Test' } },
        row: { data: { name: 'Synthetic' }, unique_keys: ['name'], olimanager: { participantId: '123' } },
      };
    } },
    target: {
      validationContext() { return {}; },
      async computeDerivedData(data) { return { data, error: '', anomalies: 0 }; },
    },
  };
  function load(relative) {
    const filename = path.resolve(__dirname, '..', relative);
    const exports = {};
    const source = ts.transpileModule(readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    }).outputText;
    vm.runInNewContext(source, {
      exports,
      require(id) {
        if (id === '@/app/lib/mongodb') return database;
        if (id === '@/app/lib/schema') return { schemas };
        if (id === './utils') return load('app/graphql/resolvers/utils.ts');
        if (['mongodb', 'apollo-server-errors'].includes(id)) return require(id);
        throw new Error(`Unexpected dependency: ${id}`);
      },
    }, { filename });
    return exports;
  }
  const resolver = load('app/graphql/resolvers/createSheets.ts').default;
  return { calls, original, userId, run: (context = { user_id: userId }, dry = false) => resolver(null, { sheetId, dry }, context) };
}

test('createSheets rejects anonymous requests before any database access, including dry-run', async () => {
  for (const dry of [false, true]) {
    const f = fixture();
    await assert.rejects(f.run({}, dry), error => error.extensions.code === 'UNAUTHENTICATED');
    assert.equal(f.calls.users, 0);
    assert.equal(f.calls.domain, 0);
  }
});

for (const role of ['view', 'editor', 'admin', 'owner', 'supervisor']) {
  test(`createSheets rejects ${role} without global admin privileges before reading import data`, async () => {
    const f = fixture({ user: { isAdmin: false, isSupervisor: role === 'supervisor', role } });
    // A context flag cannot override the persisted global role.
    await assert.rejects(f.run({ user_id: f.userId, isAdmin: true }), error => error.extensions.code === 'FORBIDDEN');
    assert.equal(f.calls.domain, 0);
    assert.equal(f.calls.converted, 0);
    assert.equal(f.calls.sheets.length + f.calls.rows.length + f.calls.updates.length, 0);
  });
}

test('createSheets rejects a session whose user no longer exists', async () => {
  const f = fixture();
  await assert.rejects(f.run(), /utente non trovato/);
  assert.equal(f.calls.domain, 0);
});

for (const existing of [false, true]) {
  test(`global administrator can import rows and permissions into a ${existing ? 'existing' : 'new'} sheet`, async () => {
    const f = fixture({ user: { isAdmin: true }, existing });
    const result = JSON.parse(await f.run());
    assert.equal(result.rows_created, 1);
    assert.equal(result.sheets_created, existing ? 0 : 1);
    assert.equal(f.calls.rows.length, 1);
    assert.equal(f.calls.rows[0].olimanager.contestId, '2026');
    const updated = f.calls.updates[0].update.$set;
    assert.equal(updated.nRows, 1);
    assert.equal(updated.nValidRows, 1);
    const sheet = existing ? updated : f.calls.sheets[0];
    assert.ok(sheet.permissions.some(p => p.email === 'teacher@example.org' && p.role === 'editor'));
    if (existing) {
      assert.ok(sheet.permissions.some(p => p.email === 'existing@example.org' && p.role === 'view'));
    } else {
      assert.equal(String(sheet.ownerId), String(f.userId));
    }
  });
}

test('administrative dry-run reports the import without writing', async () => {
  const f = fixture({ user: { isAdmin: true } });
  const result = JSON.parse(await f.run(undefined, true));
  assert.equal(result.sheets_created, 1);
  assert.equal(result.rows_created, 1);
  assert.equal(f.calls.sheets.length + f.calls.rows.length + f.calls.updates.length, 0);
});

for (const permissions of [null, {}, [null], [{ email: '', role: 'admin' }],
  [{ email: 'not-an-email', role: 'editor' }], [{ email: 'user@example.org', role: 'isAdmin' }]]) {
  test(`invalid imported permissions are rejected before writes: ${JSON.stringify(permissions)}`, async () => {
    for (const existing of [false, true]) {
      const f = fixture({ user: { isAdmin: true }, permissions, existing });
      await assert.rejects(f.run(), error => error.extensions.code === 'BAD_USER_INPUT');
      assert.equal(f.calls.sheets.length + f.calls.rows.length + f.calls.updates.length, 0);
    }
  });
}
