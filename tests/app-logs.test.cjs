const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { ObjectId } = require('mongodb');

function load(file, dependencies = {}) {
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(source, {
    exports, process, Buffer, Symbol,
    require: name => name in dependencies ? dependencies[name] : require(name),
  });
  return exports;
}
const plain = value => JSON.parse(JSON.stringify(value));
const reader = () => load('app/lib/appLogReader.ts');

function logDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'olifogli-app-logs-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

const line = (n, extra = {}) => JSON.stringify({ timestamp: `2026-11-15T10:00:${String(n % 60).padStart(2, '0')}Z`, level: 'info', source: 'app1', event: 'graphql.request', n, ...extra });

test('days are listed newest first, ignoring other files', async t => {
  const dir = logDir(t);
  for (const name of ['app-2026-11-14.log', 'app-2026-11-15.log', 'graphql-2026-11-16.log', 'app-latest.log', 'notes.txt']) {
    fs.writeFileSync(path.join(dir, name), '');
  }
  fs.mkdirSync(path.join(dir, 'app-2026-11-17.log'));
  assert.deepEqual(plain(await reader().listAppLogDays(dir)), ['2026-11-15', '2026-11-14']);
  assert.deepEqual(plain(await reader().listAppLogDays(path.join(dir, 'missing'))), []);
});

test('entries are read backwards across chunks, newest first, skipping invalid lines', async t => {
  const dir = logDir(t);
  // Long lines make the file span several 64 KB chunks.
  const padding = 'x'.repeat(300);
  const lines = [];
  for (let n = 0; n < 1000; n++) lines.push(n === 500 ? '{"truncated": ' : line(n, { padding }));
  fs.writeFileSync(path.join(dir, 'app-2026-11-15.log'), lines.join('\n') + '\n');
  const { readAppLog } = reader();

  const latest = await readAppLog(dir, '2026-11-15', 3);
  assert.deepEqual(plain(latest.entries.map(entry => entry.n)), [999, 998, 997]);
  assert.equal(latest.truncated, true);

  const all = await readAppLog(dir, '2026-11-15', 5000);
  assert.equal(all.entries.length, 999);
  assert.equal(all.entries.at(-1).n, 0);
  assert.equal(all.entries.some(entry => entry.n === 500), false);
  assert.equal(all.truncated, false);
});

test('a file without the final newline is read completely', async t => {
  const dir = logDir(t);
  fs.writeFileSync(path.join(dir, 'app-2026-11-15.log'), [line(1), line(2)].join('\n'));
  const { entries, truncated } = await reader().readAppLog(dir, '2026-11-15', 10);
  assert.deepEqual(plain(entries.map(entry => entry.n)), [2, 1]);
  assert.equal(truncated, false);
});

test('invalid days, missing files and symlinks return nothing', async t => {
  const dir = logDir(t);
  fs.writeFileSync(path.join(dir, 'secret.log'), line(1) + '\n');
  fs.symlinkSync(path.join(dir, 'secret.log'), path.join(dir, 'app-2026-11-15.log'));
  const { readAppLog } = reader();
  for (const day of ['2026-11-15', '2026-11-16', '../secret', '2026-11-15.log', '']) {
    assert.deepEqual(plain(await readAppLog(dir, day, 10)), { entries: [], truncated: false }, day);
  }
});

function resolvers(t, { user, users = [], env = {}, events = [] }) {
  const saved = { LOG_DIR: process.env.LOG_DIR };
  if ('LOG_DIR' in env) process.env.LOG_DIR = env.LOG_DIR; else delete process.env.LOG_DIR;
  t.after(() => { if (saved.LOG_DIR === undefined) delete process.env.LOG_DIR; else process.env.LOG_DIR = saved.LOG_DIR; });
  let returned = false;
  const queue = [...events];
  const module = load('app/graphql/resolvers/appLogs.ts', {
    '@/app/lib/mongodb': { getUsersCollection: async () => ({
      find: query => ({ toArray: async () => users.filter(u => query._id.$in.some(id => id.equals(u._id))) }),
    }) },
    '@/app/lib/pubsub': { TOPICS: { APP_LOG: 'APP_LOG' }, pubsub: { asyncIterator: topic => {
      assert.equal(topic, 'APP_LOG');
      return {
        next: async () => queue.length ? { done: false, value: { appLogAdded: queue.shift() } } : { done: true, value: undefined },
        return: async () => { returned = true; return { done: true, value: undefined }; },
      };
    } } },
    '@/app/lib/appLogReader': reader(),
    './utils': {
      get_authenticated_user: async () => user,
      check_admin: u => { if (!u?.isAdmin) throw new Error('non autorizzato'); },
    },
  });
  return { ...module, returned: () => returned };
}

test('the history is reserved to admins and shows the email of the acting user', async t => {
  const dir = logDir(t);
  const admin = { _id: new ObjectId(), email: 'admin@example.org', isAdmin: true };
  const removed = new ObjectId().toString();
  fs.writeFileSync(path.join(dir, 'app-2026-11-14.log'), line(1) + '\n');
  fs.writeFileSync(path.join(dir, 'app-2026-11-15.log'), [
    line(2, { event: 'sheet.deleted', userId: admin._id.toString(), sheetId: 's1' }),
    line(3, { event: 'sheet.deleted', userId: removed }),
  ].join('\n') + '\n');

  await assert.rejects(resolvers(t, { user: { isAdmin: false }, env: { LOG_DIR: dir } }).appLogs(null, {}, {}), /non autorizzato/);

  const { appLogs } = resolvers(t, { user: admin, users: [admin], env: { LOG_DIR: dir } });
  const result = plain(await appLogs(null, {}, {}));
  assert.equal(result.available, true);
  assert.deepEqual(result.days, ['2026-11-15', '2026-11-14']);
  assert.equal(result.day, '2026-11-15');
  assert.deepEqual(result.entries.map(entry => [entry.data.n, entry.userEmail, entry.userId]),
    [[3, null, removed], [2, 'admin@example.org', admin._id.toString()]]);
  assert.deepEqual(result.entries[1].data, { n: 2, sheetId: 's1' });
  assert.equal(result.entries[1].event, 'sheet.deleted');

  const older = plain(await appLogs(null, { day: '2026-11-14' }, {}));
  assert.deepEqual(older.entries.map(entry => entry.data.n), [1]);
});

test('without LOG_DIR the history is unavailable', async t => {
  const { appLogs } = resolvers(t, { user: { isAdmin: true } });
  assert.deepEqual(plain(await appLogs(null, {}, {})), { available: false, days: [], day: null, entries: [], truncated: false });
});

test('live events are reserved to admins and carry the user email', async t => {
  const admin = { _id: new ObjectId(), email: 'admin@example.org', isAdmin: true };
  await assert.rejects(resolvers(t, { user: { isAdmin: false } }).appLogAddedSubscription(null, {}, {}), /non autorizzato/);

  const event = JSON.parse(line(7, { event: 'scan.uploaded', userId: admin._id.toString(), jobId: 'j1' }));
  const fixture = resolvers(t, { user: admin, users: [admin], events: [event] });
  const iterator = await fixture.appLogAddedSubscription(null, {}, {});
  const { value } = await iterator.next();
  assert.deepEqual(plain(value.appLogAdded), {
    timestamp: event.timestamp, level: 'info', source: 'app1', event: 'scan.uploaded',
    userId: admin._id.toString(), userEmail: 'admin@example.org', data: { n: 7, jobId: 'j1' },
  });
  await iterator.return();
  assert.equal(fixture.returned(), true);
});

function renderPage(appLogs) {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const subscriptions = [];
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../app/components/AppLogs.tsx'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const dependencies = {
    react: React, 'react/jsx-runtime': require('react/jsx-runtime'),
    '@apollo/client': {
      gql: strings => strings.join(''),
      useQuery: () => ({ data: { appLogs }, loading: false, refetch() {} }),
      useSubscription: (_, options) => { subscriptions.push(options); return {}; },
    },
    './Button': { __esModule: true, default: ({ children }) => React.createElement('button', {}, children) },
    './Error': { __esModule: true, default: () => null },
    './Loading': { __esModule: true, default: () => 'loading' },
    '../lib/logging': { logDiagnostic() {} },
    '../lib/useProfile': { __esModule: true, default: () => ({ isAdmin: true }) },
  };
  vm.runInNewContext(source, { exports, require: name => dependencies[name] ?? require(name) });
  const html = renderToStaticMarkup(React.createElement(exports.default));
  return { html, subscription: subscriptions.at(-1) };
}

test('the page follows live events on the latest day, also without LOG_DIR', () => {
  const withoutLogDir = renderPage({ available: false, days: [], day: null, truncated: false, entries: [] });
  assert.equal(withoutLogDir.subscription.skip, false);
  assert.match(withoutLogDir.html, /In tempo reale/);

  const latest = renderPage({ available: true, days: ['2026-11-15', '2026-11-14'], day: '2026-11-15', truncated: false, entries: [] });
  assert.equal(latest.subscription.skip, false);

  const past = renderPage({ available: true, days: ['2026-11-15', '2026-11-14'], day: '2026-11-14', truncated: false, entries: [] });
  assert.equal(past.subscription.skip, true);
  assert.match(past.html, /Giorno passato/);
});
