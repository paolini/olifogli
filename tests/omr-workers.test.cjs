const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

function load(file, dependencies = {}) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, { exports, Date, require(id) {
    if (Object.hasOwn(dependencies, id)) return dependencies[id];
    throw new Error('Unexpected dependency: ' + id);
  } });
  return exports;
}

const now = new Date('2026-11-15T10:00:00Z');
const ago = ms => new Date(now.getTime() - ms);
const { getOmrWorkerStatus, OMR_WORKER_STUCK_MS } = load('app/lib/omrWorkers.ts', {
  './workerHeartbeat': { WORKER_HEARTBEAT_TIMEOUT_MS: 35000 },
});

function db(records) {
  return { collection(name) {
    assert.equal(name, 'omr_workers');
    return { find(filter, options) {
      assert.equal(JSON.stringify(filter), JSON.stringify({ type: { $in: ['oliscan', 'olisheet'] } }));
      assert.equal(JSON.stringify(options.sort), JSON.stringify({ lastSeenAt: -1 }));
      const sorted = records.filter(r => filter.type.$in.includes(r.type)).sort((a, b) => b.lastSeenAt - a.lastSeenAt);
      return { toArray: async () => sorted.map(({ _id, ...rest }) => rest) };
    } };
  } };
}

test('OMR worker status is grouped by type and ignores stale instances', async () => {
  const status = await getOmrWorkerStatus(db([
    { _id: 'oliscan:a', type: 'oliscan', version: 'v0.6.8', startedAt: ago(60000), lastSeenAt: ago(5000), state: 'idle', jobId: null, busySince: null },
    { _id: 'oliscan:b', type: 'oliscan', version: 'v0.6.8', startedAt: ago(60000), lastSeenAt: ago(9000), state: 'busy', jobId: 'job1', busySince: ago(60000) },
    { _id: 'olisheet:a', type: 'olisheet', version: 'dev', startedAt: ago(3600000), lastSeenAt: ago(36000), state: 'busy', jobId: 'job2', busySince: ago(3600000) },
    { _id: 'other:a', type: 'other', lastSeenAt: ago(1000) },
  ]), now);
  assert.equal(status.map(s => s.type).join(), 'oliscan,olisheet');
  const [scan, sheet] = status;
  assert.equal(scan.running, true); assert.equal(scan.activeWorkers, 2);
  assert.equal(scan.lastSeenAt.getTime(), ago(5000).getTime());
  assert.equal(scan.instances[1].jobId, 'job1'); assert.equal(scan.instances[1].stuck, false);
  assert.equal(scan.instances[0].jobId, null);
  assert.equal(sheet.running, false); assert.equal(sheet.activeWorkers, 0); assert.equal(sheet.instances.length, 0);
  assert.equal(sheet.lastSeenAt.getTime(), ago(36000).getTime());
});

test('a worker busy for more than 30 minutes is flagged as possibly stuck', async () => {
  const record = busySince => ({ _id: 'olisheet:a', type: 'olisheet', version: 'v1', startedAt: ago(7200000), lastSeenAt: ago(1000), state: 'busy', jobId: 'job', busySince });
  assert.equal((await getOmrWorkerStatus(db([record(ago(OMR_WORKER_STUCK_MS - 1000))]), now))[1].instances[0].stuck, false);
  assert.equal((await getOmrWorkerStatus(db([record(ago(OMR_WORKER_STUCK_MS + 1000))]), now))[1].instances[0].stuck, true);
  const empty = await getOmrWorkerStatus(db([]), now);
  assert.equal(JSON.stringify(empty.map(s => [s.running, s.lastSeenAt])), '[[false,null],[false,null]]');
});

test('OMR worker status requires authentication', async () => {
  let user = null;
  const resolve = load('app/graphql/resolvers/omrWorkerStatus.ts', {
    './utils': { async get_authenticated_user() { if (!user) throw new Error('autenticazione richiesta'); return user; } },
    '@/app/lib/mongodb': { async getDb() { return 'db'; } },
    '@/app/lib/omrWorkers': { async getOmrWorkerStatus(db) { assert.equal(db, 'db'); return []; } },
  }).default;
  await assert.rejects(resolve(null, {}, {}), /autenticazione/);
  user = { isAdmin: false };
  assert.equal((await resolve(null, {}, {})).length, 0);
});

function render(type, state, isAdmin = true) {
  const { gql } = require('@apollo/client');
  const Component = load('app/components/OmrWorkerStatus.tsx', {
    'react/jsx-runtime': require('react/jsx-runtime'),
    '@apollo/client': { gql, useQuery(query, options) {
      assert.equal(options.pollInterval, 10000);
      return state;
    } },
    '../lib/useProfile': { __esModule: true, default: () => ({ isAdmin }) },
  }).default;
  return renderToStaticMarkup(React.createElement(Component, { type }));
}

test('indicator shows checking, offline, active, busy, stuck and unknown states', () => {
  const data = (scan, sheet) => ({ data: { omrWorkerStatus: [{ type: 'oliscan', ...scan }, { type: 'olisheet', ...sheet }] } });
  const off = { running: false, activeWorkers: 0, instances: [] };
  assert.match(render('oliscan', {}), /Lettore scansioni.*verifica in corso/);
  assert.match(render('oliscan', data({ ...off, lastSeenAt: '2026-11-15T09:00:00Z' }, off)), /Lettore scansioni.*non attivo.*resteranno in coda.*Ultimo segnale/);
  const idle = { running: true, activeWorkers: 2, instances: [{ state: 'idle', stuck: false }, { state: 'idle', stuck: false }] };
  assert.match(render('oliscan', data(idle, off)), /attivo.*2 istanze.*in attesa di lavori/);
  assert.match(render('olisheet', data(idle, off)), /Generatore fogli.*non attivo/);
  const busy = { running: true, activeWorkers: 1, instances: [{ state: 'busy', stuck: false, busySince: '2026-11-15T09:59:00Z' }] };
  const busyHtml = render('olisheet', data(off, busy));
  assert.match(busyHtml, /elaborazione in corso/); assert.doesNotMatch(busyHtml, /bloccato/);
  const stuck = { running: true, activeWorkers: 1, instances: [{ state: 'busy', stuck: true, busySince: '2026-11-15T09:00:00Z' }] };
  assert.match(render('olisheet', data(off, stuck)), /più di 30 minuti.*bloccato/);
  const unknown = render('oliscan', { error: new Error('Offline'), ...data(idle, idle) });
  assert.match(unknown, /stato non verificabile/); assert.doesNotMatch(unknown, /<b>attivo/);
});

test('indicator hides the active and checking states from non-admins', () => {
  const data = (status) => ({ data: { omrWorkerStatus: [{ type: 'oliscan', ...status }] } });
  const idle = { running: true, activeWorkers: 1, instances: [{ state: 'idle', stuck: false }] };
  assert.match(render('oliscan', data(idle)), /⚙ Lettore scansioni.*attivo/);
  assert.equal(render('oliscan', data(idle), false), '');
  assert.equal(render('oliscan', {}, false), '');
  const stuck = { running: true, activeWorkers: 1, instances: [{ state: 'busy', stuck: true }] };
  const stuckHtml = render('oliscan', data(stuck), false);
  assert.match(stuckHtml, /bloccato/); assert.doesNotMatch(stuckHtml, /<b>attivo/);
  assert.match(render('oliscan', data({ running: false, activeWorkers: 0, instances: [] }), false), /non attivo/);
});
