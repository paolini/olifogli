const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const { ObjectId } = require('mongodb');
const { buildSchema, parse, validate } = require('graphql');

function fixture({ admin = true, remoteFailure = false } = {}) {
  const rowId = new ObjectId(), sheetId = new ObjectId(), workbookId = new ObjectId();
  const req = { privateRequest: true };
  const calls = { remote: [], writes: [], domain: 0 };
  const row = { _id: rowId, sheetId, error: '', data: { name: 'Test', surname: 'Student', birthDate: '14/03/2011',
    classYear: '2', classSection: 'A', variant: '211', score: '5', shirt_size: 'M' } };
  const sheet = { _id: sheetId, workbookId, schema: 'test', commonData: {} };
  const rows = { async findOne() { return row; }, async updateOne(filter, update) { calls.writes.push(update); },
    async updateMany(filter, update) { calls.writes.push(update); } };
  const db = {
    async getUsersCollection() { return { async findOne() { return { _id: new ObjectId(), email: 'admin@example.invalid', isAdmin: admin }; } }; },
    async getRowsCollection() { calls.domain++; return rows; },
    async getSheetsCollection() { calls.domain++; return { async findOne() { return sheet; }, async updateOne() {} }; },
    async getWorkbooksCollection() { calls.domain++; return { async findOne() { return { _id: workbookId,
      commonData: { olimanager_contest_id: '10', olimanager_taglia_field_id: '7' } }; } }; },
  };
  const schemas = { test: {
    validationContext() { return { contest_id: 10, school_external_id: () => 'TEST0001' }; },
    extract_olimanager_results() { return [{ participantId: 12, problemIndex: 1, score: 5 }]; },
  } };
  const cache = new Map();
  function load(relative) {
    if (cache.has(relative)) return cache.get(relative);
    const filename = path.resolve(__dirname, '..', relative), exports = {};
    cache.set(relative, exports);
    const source = ts.transpileModule(readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    }).outputText;
    vm.runInNewContext(source, { exports, console, require(id) {
      if (id === 'mongodb') return require(id);
      if (id === '@/app/lib/mongodb') return db;
      if (id === '@/app/lib/schema') return { schemas };
      if (id === './utils') return load('app/graphql/resolvers/utils.ts');
      if (id === 'apollo-server-errors') return require(id);
      if (id === './olimanagerApi') return load('app/graphql/resolvers/olimanagerApi.ts');
      if (id === '../../lib/logging') return { logDiagnostic() {} };
      if (id === '@/app/lib/olimanager') return { async queryOlimanager(request, query, variables) {
        assert.equal(request, req);
        calls.remote.push({ query, variables });
        if (remoteFailure) throw new Error('OAuth access denied');
        if (query.includes('MatchOrCreateParticipant')) return { participants: { matchOrCreateParticipant: {
          __typename: 'ParticipantMatchSuccess', participant: { id: 12, competitor: { id: 20 } },
        } } };
        if (query.includes('BulkUpdateResults')) return { participants: { bulkUpdateResults: { __typename: 'BulkUpdateResultsSuccess' } } };
        if (query.includes('ParticipantsExtraFields')) return { participants: { participants: { edges: [{ node: { id: 12, extraFieldEntries: [] } }] } } };
        if (query.includes('updateExtraFieldEntry')) return { participants: { updateExtraFieldEntry: { id: 1, value: 'M' } } };
        throw new Error('Unexpected remote query');
      } };
      throw new Error('Unexpected dependency: ' + id);
    } }, { filename });
    return exports;
  }
  return { rowId, row, calls, req, load, context: { req, user_id: new ObjectId() } };
}

const resolvers = ['olimanagerCreateParticipant', 'olimanagerBulkUpdateResults', 'olimanagerUpdateExtraFields'];
for (const resolver of resolvers) {
  test(`${resolver} uses the calling administrator's OAuth request, without login credentials`, async () => {
    const f = fixture();
    if (resolver.endsWith('ExtraFields')) f.row.olimanager = { participantId: '12', contestId: '10' };
    const result = await f.load(`app/graphql/resolvers/${resolver}.ts`).default(null, { rowIds: [f.rowId] }, f.context);
    assert.ok(result === true || result[0].success);
    assert.ok(f.calls.remote.length > 0);
    for (const { query, variables } of f.calls.remote) {
      assert.doesNotMatch(query, /login\s*\(/i);
      assert.ok(!Object.keys(variables).some(key => /password|username|token/i.test(key)));
    }
  });
  for (const anonymous of [false, true]) test(`${resolver} rejects ${anonymous ? 'anonymous' : 'non-admin'} callers before domain access`, async () => {
    const f = fixture({ admin: false });
    await assert.rejects(f.load(`app/graphql/resolvers/${resolver}.ts`).default(null, { rowIds: [f.rowId] }, anonymous ? {} : f.context), /autenticazione|non autorizzato/);
    assert.equal(f.calls.remote.length, 0);
    assert.equal(f.calls.domain, 0);
  });
  test(`${resolver} cannot transfer through a context without an HTTP OAuth session`, async () => {
    const f = fixture();
    await assert.rejects(f.load(`app/graphql/resolvers/${resolver}.ts`).default(null, { rowIds: [f.rowId] }, { user_id: f.context.user_id }), /sessione OAuth HTTP/);
    assert.equal(f.calls.remote.length, 0);
    assert.equal(f.calls.writes.length, 0);
  });
}

test('provider denial does not mark results as synchronized', async () => {
  const f = fixture({ remoteFailure: true });
  await assert.rejects(f.load('app/graphql/resolvers/olimanagerBulkUpdateResults.ts').default(null, { rowIds: [f.rowId] }, f.context), /OAuth access denied/);
  assert.equal(f.calls.writes.length, 0);
});

test('transfer GraphQL API accepts IDs only and rejects the old username/password arguments', () => {
  const schema = buildSchema(readFileSync(path.resolve(__dirname, '../app/graphql/schema.gql'), 'utf8'));
  for (const resolver of resolvers) {
    const fields = resolver === 'olimanagerBulkUpdateResults' ? '' : ' { success }';
    assert.equal(validate(schema, parse(`mutation { ${resolver}(rowIds: [])${fields} }`)).length, 0);
    const errors = validate(schema, parse(`mutation { ${resolver}(rowIds: [], username: "old", password: "old")${fields} }`));
    assert.equal(errors.filter(error => error.message.includes('Unknown argument')).length, 2);
  }
});
