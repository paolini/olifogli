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
