const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

function load(file, dependencies = {}, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, { exports, Date, ...globals, require(id) {
    if (Object.hasOwn(dependencies, id)) return dependencies[id];
    throw new Error('Unexpected dependency: ' + id);
  } });
  return exports;
}

function fixture() {
  let clock = Date.parse('2026-11-02T10:00:00Z');
  const records = new Map(), timers = new Set(), failures = [], indexes = [];
  let failWrites = false, delayWrite;
  const collection = {
    async createIndex(...args) { indexes.push(args); },
    async updateOne(filter, update, options) {
      assert.equal(options.upsert, true);
      if (failWrites) throw new Error('Database unavailable');
      if (delayWrite) await delayWrite;
      records.set(filter._id, { _id: filter._id, ...update.$set });
    },
    async deleteOne(filter) { records.delete(filter._id); },
    async countDocuments(filter) { return [...records.values()].filter(record => record.lastSeenAt > filter.lastSeenAt.$gt).length; },
    async findOne() { return [...records.values()].sort((a, b) => b.lastSeenAt - a.lastSeenAt)[0] || null; },
  };
  const db = { collection(name) { assert.equal(name, 'olifogli_workers'); return collection; } };
  const heartbeat = load('app/lib/workerHeartbeat.ts', {}, {
    Date: class extends Date { constructor(value = clock) { super(value); } },
    setInterval(run, ms) { assert.equal(ms, 10000); const timer = { run, unref() {} }; timers.add(timer); return timer; },
    clearInterval(timer) { timers.delete(timer); },
  });
  return { ...heartbeat, db, records, timers, failures, indexes,
    tick(ms, beat = true) { clock += ms; if (beat) for (const timer of timers) timer.run(); },
    now: () => new Date(clock), failWrites: () => { failWrites = true; },
    delayWrites: promise => { delayWrite = promise; },
    start: id => heartbeat.startWorkerHeartbeat(db, id, error => failures.push(error)),
    status: () => heartbeat.getOlifogliWorkerStatus(db, new Date(clock)),
  };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('idle workers announce themselves immediately, renew and disappear on clean shutdown', async () => {
  const f = fixture();
  assert.equal((await f.status()).running, false);
  const stop = await f.start('worker-a');
  assert.equal((await f.status()).activeWorkers, 1);
  const initial = (await f.status()).lastSeenAt.getTime();
  f.tick(10000); await settle();
  assert.equal((await f.status()).lastSeenAt.getTime(), initial + 10000);
  assert.equal(f.indexes[0][1].expireAfterSeconds, 86400);
  await stop();
  assert.equal((await f.status()).running, false);
  assert.equal(f.timers.size, 0);
  f.tick(10000); await settle();
  assert.equal(f.records.size, 0);
});

test('stale or failed heartbeats expire and one stopped instance does not hide other live workers', async () => {
  const f = fixture();
  const stopA = await f.start('worker-a'), stopB = await f.start('worker-b');
  assert.equal((await f.status()).activeWorkers, 2);
  await stopA();
  assert.equal((await f.status()).activeWorkers, 1);
  f.tick(34999, false);
  assert.equal((await f.status()).running, true);
  f.failWrites(); f.tick(1); await settle();
  assert.equal((await f.status()).running, false);
  assert.equal((await f.status()).activeWorkers, 0);
  assert.ok((await f.status()).lastSeenAt);
  assert.equal(f.failures.length, 1);
  await stopB();
});

test('shutdown waits for an in-flight heartbeat, so a completed write cannot resurrect a stopped worker', async () => {
  const f = fixture(), stop = await f.start('worker-a');
  let release;
  f.delayWrites(new Promise(resolve => { release = resolve; }));
  f.tick(10000);
  const stopping = stop();
  await settle();
  assert.equal(f.records.size, 1);
  release(); await stopping;
  assert.equal(f.records.size, 0);
});

test('worker status is restricted to administrators and does not turn backend errors into an offline result', async () => {
  let admin = false, reads = 0, fail = false;
  const resolve = load('app/graphql/resolvers/olifogliWorkerStatus.ts', {
    './utils': { get_authenticated_user: async () => ({ isAdmin: admin }), check_admin(user) { if (!user.isAdmin) throw new Error('Forbidden'); } },
    '@/app/lib/mongodb': { async getDb() { reads++; return 'db'; } },
    '@/app/lib/workerHeartbeat': { async getOlifogliWorkerStatus(db) {
      assert.equal(db, 'db'); if (fail) throw new Error('Database unavailable');
      return { running: true, activeWorkers: 1, lastSeenAt: new Date() };
    } },
  }).default;
  await assert.rejects(resolve(null, {}, {}), /Forbidden/); assert.equal(reads, 0);
  admin = true;
  assert.equal((await resolve(null, {}, {})).running, true);
  fail = true; await assert.rejects(resolve(null, {}, {}), /Database unavailable/);
});

function renderStatus(workerState) {
  const { gql } = require('@apollo/client');
  const Component = load('app/components/OlimanagerJobStatus.tsx', {
    react: React, 'react/jsx-runtime': require('react/jsx-runtime'),
    '@apollo/client': { gql, useMutation: () => [async () => {}, {}], useQuery(query, options) {
      const name = query.definitions[0].name.value;
      if (name === 'OlifogliWorkerStatus') {
        assert.equal(options.pollInterval, 10000); assert.equal(options.fetchPolicy, 'network-only');
        return workerState;
      }
      return { data: { olimanagerJobs: [], olimanagerJobItems: [] }, loading: false, refetch: async () => {} };
    } },
    'lucide-react': { Check: () => null, Copy: () => null },
    './Button': { default: ({ children }) => React.createElement('button', null, children), __esModule: true },
    './Error': { default: () => null, __esModule: true },
  }).default;
  return renderToStaticMarkup(React.createElement(Component));
}

test('queue panel displays live, offline, checking and unknown states, with unknown overriding cached online data', () => {
  assert.match(renderStatus({ loading: true }), /Verifica in corso/);
  assert.match(renderStatus({ data: { olifogliWorkerStatus: { running: true, activeWorkers: 2 } } }), /In esecuzione.*2 istanze/);
  assert.match(renderStatus({ data: { olifogliWorkerStatus: { running: false, activeWorkers: 0, lastSeenAt: '2026-11-02T10:00:00Z' } } }), /Nessun worker attivo.*Ultimo segnale/);
  const unknown = renderStatus({ error: new Error('Offline'), data: { olifogliWorkerStatus: { running: true, activeWorkers: 1 } } });
  assert.match(unknown, /Stato non verificabile/); assert.doesNotMatch(unknown, /In esecuzione/);
});

const integrationUri = process.env.OLIMANAGER_WORKER_TEST_URI;
test('MongoDB worker presence lifecycle', { skip: !integrationUri }, async t => {
  assert.match(integrationUri, /^mongodb:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//);
  const { MongoClient, ObjectId } = require('mongodb');
  require('tsx/cjs');
  const { startWorkerHeartbeat, getOlifogliWorkerStatus, WORKER_HEARTBEAT_TIMEOUT_MS } = require('../app/lib/workerHeartbeat.ts');
  const client = new MongoClient(integrationUri, { serverSelectionTimeoutMS: 4000 });
  await client.connect();
  const db = client.db('olifogli_worker_test_' + new ObjectId()), stops = [];
  t.after(async () => { for (const stop of stops) await stop(); await db.dropDatabase(); await client.close(); });
  stops.push(await startWorkerHeartbeat(db, 'worker-a', assert.fail));
  stops.push(await startWorkerHeartbeat(db, 'worker-b', assert.fail));
  assert.equal((await getOlifogliWorkerStatus(db)).activeWorkers, 2);
  await stops.pop()(); assert.equal((await getOlifogliWorkerStatus(db)).activeWorkers, 1);
  await stops.pop()(); assert.equal((await getOlifogliWorkerStatus(db)).running, false);
  const lastSeenAt = new Date(Date.now() - WORKER_HEARTBEAT_TIMEOUT_MS - 1000);
  await db.collection('olifogli_workers').insertOne({ _id: 'crashed-worker', lastSeenAt });
  const stale = await getOlifogliWorkerStatus(db);
  assert.equal(stale.running, false); assert.equal(stale.lastSeenAt.getTime(), lastSeenAt.getTime());
  assert.ok((await db.collection('olifogli_workers').listIndexes().toArray()).some(index => index.expireAfterSeconds === 86400));
});
