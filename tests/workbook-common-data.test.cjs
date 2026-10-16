const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const { graphql, GraphQLScalarType } = require('graphql');
const { makeExecutableSchema } = require('@graphql-tools/schema');
const { ObjectId } = require('mongodb');
const root = path.resolve(__dirname, '..');
const workbookId = new ObjectId('000000000000000000000001');
const commonData = Object.freeze({ contest_year: '2026', selection_workbook_id: 'source', correct_answers: '["A"]', permutations_correct_2: 'ABCD', future_secret: 'private' });
const workbook = { _id: workbookId, name: 'Test', commonData };
const sheet = { _id: workbookId, workbookId, workbook, commonData: { Distretto: 'Test' } };
const publicData = { contest_year: '2026', selection_workbook_id: 'source' };
const utils = {
  async get_authenticated_user(ctx) {
    if (!ctx.user) throw new Error('Not authenticated');
    return ctx.user;
  },
  check_user_can_view_sheet() {}, // Sheet authorization is outside this field-level test.
};
const database = {
  getWorkbooksCollection: async () => ({ findOne: async () => workbook, find: () => ({ toArray: async () => [workbook] }) }),
  getSheetsCollection: async () => ({ aggregate: pipeline => ({ toArray: async () => pipeline.some(stage => stage.$replaceRoot) ? [workbook] : [sheet] }) }),
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
      if (id.endsWith('/utils') || id === './utils') return utils;
      if (id.endsWith('/mongodb')) return database;
      if (id === './types') return {};
      if (id.endsWith('/pubsub')) return { TOPICS: {}, pubsub: {} };
      if (id.endsWith('/redis')) return {};
      if (id === 'graphql-subscriptions') return { withFilter: () => () => {} };
      if (id === './resolvers/settings') return { default: { Query: {}, Mutation: {} }, __esModule: true };
      if (/^\.\/resolvers\//.test(id) && !/^\.\/resolvers\/(workbookCommonData|workbook|workbooks|sheet|sheets)$/.test(id)) return { default() {}, __esModule: true };
      if (['mongodb', 'bson', 'graphql-type-json', 'date-fns'].includes(id)) return require(id);
      if (id.startsWith('.')) return load(path.relative(root, path.resolve(path.dirname(filename), id + '.ts')));
      throw new Error(`Unexpected dependency: ${id}`);
    },
  }, { filename });
  return exports;
}
const registry = load('app/graphql/resolvers.ts').resolvers;
const schema = makeExecutableSchema({
  typeDefs: readFileSync(path.join(root, 'app/graphql/schema.gql'), 'utf8'),
  resolvers: {
    Query: Object.fromEntries(['workbook', 'workbooks', 'sheet', 'sheets'].map(key => [key, registry.Query[key]])),
    Workbook: { commonData: registry.Workbook.commonData },
    Data: new GraphQLScalarType({ name: 'Data', serialize: value => value }),
    ObjectId: new GraphQLScalarType({ name: 'ObjectId', parseValue: value => new ObjectId(value), serialize: String }),
  },
});
const source = `query($id: ObjectId!) {
  workbook(workbookId: $id) { ...Fields }
  workbooks { ...Fields }
  sheet(sheetId: $id) { commonData workbook { ...Fields } }
  sheets(workbookId: $id) { commonData ... on Sheet { workbook { ...Fields } } }
}
fragment Fields on Workbook { exposed: commonData }`;
for (const role of ['view', 'editor', 'owner', 'admin', 'supervisor']) {
  test(`Workbook.commonData is protected on all query paths for ${role}`, async () => {
    const result = await graphql({ schema, source, variableValues: { id: workbookId.toString() }, contextValue: { user: { role, isAdmin: role === 'admin', isSupervisor: role === 'supervisor' } } });
    assert.equal(result.errors, undefined);
    const expected = ['admin', 'supervisor'].includes(role) ? commonData : publicData;
    for (const actual of [result.data.workbook, result.data.workbooks[0], result.data.sheet.workbook, result.data.sheets[0].workbook]) {
      assert.deepEqual({ ...actual.exposed }, expected);
    }
    assert.deepEqual(result.data.sheet.commonData, sheet.commonData);
    assert.deepEqual(result.data.sheets[0].commonData, sheet.commonData);
    assert.equal(commonData.future_secret, 'private');
  });
}
test('field requires authentication even when a parent is already available', async () => {
  await assert.rejects(registry.Workbook.commonData(workbook, {}, {}), /Not authenticated/);
});
test('missing workbook configuration returns an empty object', async () => {
  assert.equal(JSON.stringify(await registry.Workbook.commonData({}, {}, { user: {} })), '{}');
});
test('Archimede browser validation needs no correction keys; server validation remains strict', () => {
  const Archimede = load('app/lib/schema/ArchimedeBiennio.ts').default;
  const instance = new Archimede();
  const context = instance.displayValidationContext(publicData);
  assert.equal(context.contest_year, 2026);
  assert.equal(context.permutation_object, undefined);
  assert.equal(context.absent({ [instance.variant_field]: '000' }), true);
  assert.throws(() => instance.validationContext({}, publicData), /Permutation object is empty/);
});
