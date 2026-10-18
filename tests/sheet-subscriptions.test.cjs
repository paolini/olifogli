const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const { ObjectId } = require('mongodb');

const topics = {
  sheetUpdated: 'SHEET_UPDATED', rowChanged: 'ROW_CHANGED', rowsDeleted: 'ROWS_DELETED',
  cursorChanged: 'CURSOR_CHANGED', scanJobUpdated: 'SCAN_JOB_UPDATED', scanSheetJobUpdated: 'SCAN_SHEET_JOB_UPDATED',
};
const compiled = new Map();
function fixture() {
  const userId = new ObjectId();
  const sheetId = new ObjectId();
  const otherId = new ObjectId();
  const state = {
    user: { _id: userId, email: 'reader@example.org' },
    sheet: { _id: sheetId, ownerId: new ObjectId(), permissions: [{ email: 'reader@example.org', role: 'view' }] },
    sources: [], userReads: 0, sheetReads: 0, failRead: false,
  };
  const pubsub = {
    asyncIterator(topic) {
      let pending;
      const queue = [];
      const source = {
        topic, closed: false,
        emit(value) {
          if (source.closed) return;
          const result = { value, done: false };
          if (pending) { const resolve = pending; pending = undefined; resolve(result); }
          else queue.push(result);
        },
        next() {
          if (source.closed) return Promise.resolve({ done: true });
          return queue.length ? Promise.resolve(queue.shift()) : new Promise(resolve => { pending = resolve; });
        },
        async return() {
          source.closed = true;
          if (pending) pending({ done: true });
          return { done: true };
        },
        [Symbol.asyncIterator]() { return this; },
      };
      state.sources.push(source);
      return source;
    },
  };
  const database = {
    async getUsersCollection() {
      return { async findOne() { state.userReads++; if (state.failRead) throw new Error('database unavailable'); return state.user; } };
    },
    async getSheetsCollection() {
      return { async findOne(query) { state.sheetReads++; return query._id.equals(sheetId) ? state.sheet : null; } };
    },
  };
  const cache = new Map();
  function load(relative) {
    if (cache.has(relative)) return cache.get(relative);
    const filename = path.resolve(__dirname, '..', relative);
    if (!compiled.has(relative)) compiled.set(relative, ts.transpileModule(readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    }).outputText);
    const exports = {};
    cache.set(relative, exports);
    vm.runInNewContext(compiled.get(relative), {
      exports, console,
      require(id) {
        if (id.endsWith('/mongodb')) return database;
        if (id.endsWith('/pubsub')) return {
          pubsub, TOPICS: Object.fromEntries(Object.values(topics).map(prefix => [prefix, id => `${prefix}.${id}`])),
        };
        if (id === './resolvers/sheetSubscription') return load('app/graphql/resolvers/sheetSubscription.ts');
        if (id === './utils' || id === './resolvers/utils') return load('app/graphql/resolvers/utils.ts');
        if (id === './resolvers/settings') return { default: { Query: {}, Mutation: {} }, __esModule: true };
        if (id.startsWith('./resolvers/')) return { default() {}, __esModule: true };
        if (id === './types' || id.endsWith('/redis')) return {};
        if (['mongodb', 'bson', 'graphql-type-json', 'graphql-subscriptions', 'apollo-server-errors'].includes(id)) return require(id);
        throw new Error(`Unexpected dependency: ${id}`);
      },
    }, { filename });
    return exports;
  }
  const subscriptions = load('app/graphql/resolvers.ts').resolvers.Subscription;
  return {
    state, userId, sheetId, otherId,
    subscribe: (name, context = { user_id: userId }, id = sheetId) => subscriptions[name].subscribe(null, { sheetId: id }, context),
    publish(name, id, value) {
      for (const source of state.sources) if (source.topic === `${topics[name]}.${id}`) source.emit(value);
    },
  };
}

for (const name of Object.keys(topics)) {
  test(`${name}: denies anonymous and unauthorized users before subscribing to Redis`, async () => {
    const f = fixture();
    await assert.rejects(f.subscribe(name, {}), e => e.extensions.code === 'UNAUTHENTICATED');
    assert.equal(f.state.userReads, 0);
    f.state.sheet.permissions = [];
    await assert.rejects(f.subscribe(name, { user_id: f.userId, isAdmin: true, isSupervisor: true }), e => e.extensions.code === 'FORBIDDEN');
    assert.equal(f.state.sources.length, 0);
  });

  test(`${name}: delivers only events for the authorized sheet and stops after revocation`, async () => {
    const f = fixture();
    const iterator = await f.subscribe(name);
    const secret = { [name]: 'other sheet private data' };
    const allowed = { [name]: 'authorized event' };
    f.publish(name, f.otherId, secret);
    f.publish(name, f.sheetId, allowed);
    assert.equal((await iterator.next()).value, allowed);
    // Even an event already queued must not pass after access is removed.
    f.publish(name, f.sheetId, { [name]: 'revoked private data' });
    f.state.sheet.permissions = [];
    await assert.rejects(iterator.next(), e => e.extensions.code === 'FORBIDDEN');
    assert.equal(f.state.sources[0].closed, true);
    assert.equal((await iterator.next()).done, true);
  });
}

for (const role of ['view', 'editor', 'admin', 'owner', 'global-admin', 'supervisor']) {
  test(`sheet subscription respects existing read permissions for ${role}`, async () => {
    const f = fixture();
    if (role === 'owner') {
      f.state.sheet.permissions = [];
      f.state.sheet.ownerId = f.userId;
    } else if (role === 'global-admin' || role === 'supervisor') {
      f.state.sheet.permissions = [];
      f.state.user.isAdmin = role === 'global-admin';
      f.state.user.isSupervisor = role === 'supervisor';
    } else f.state.sheet.permissions[0].role = role;
    const iterator = await f.subscribe('rowChanged');
    f.publish('rowChanged', f.sheetId, { rowChanged: 'permitted' });
    assert.equal((await iterator.next()).value.rowChanged, 'permitted');
    await iterator.return();
    assert.equal(f.state.sources[0].closed, true);
  });
}

test('nonexistent sheets and deleted users cannot subscribe', async () => {
  const f = fixture();
  await assert.rejects(f.subscribe('rowChanged', undefined, f.otherId), e => e.extensions.code === 'BAD_USER_INPUT');
  f.state.user = null;
  await assert.rejects(f.subscribe('rowChanged'), /utente non trovato/);
  assert.equal(f.state.sources.length, 0);
});

for (const change of ['remove-user', 'remove-sheet', 'revoke-admin', 'revoke-supervisor', 'database-error']) {
  test(`active subscriptions fail closed on ${change}`, async () => {
    const f = fixture();
    if (change === 'revoke-admin' || change === 'revoke-supervisor') {
      f.state.sheet.permissions = [];
      f.state.user.isAdmin = change === 'revoke-admin';
      f.state.user.isSupervisor = change === 'revoke-supervisor';
    }
    const iterator = await f.subscribe('rowChanged');
    if (change === 'remove-user') f.state.user = null;
    if (change === 'remove-sheet') f.state.sheet = null;
    if (change === 'revoke-admin') f.state.user.isAdmin = false;
    if (change === 'revoke-supervisor') f.state.user.isSupervisor = false;
    if (change === 'database-error') f.state.failRead = true;
    f.publish('rowChanged', f.sheetId, { rowChanged: 'must not be delivered' });
    await assert.rejects(iterator.next());
    assert.equal(f.state.sources[0].closed, true);
  });
}

test('cancelling while waiting for an event closes the Redis iterator', async () => {
  const f = fixture();
  const iterator = await f.subscribe('rowChanged');
  const pending = iterator.next();
  await iterator.return();
  assert.equal((await pending).done, true);
  assert.equal(f.state.sources[0].closed, true);
});
