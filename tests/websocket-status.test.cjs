const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = ts.transpileModule(readFileSync(path.join(__dirname, '../app/lib/webSocketConnection.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

function fixture(hostname = 'localhost') {
  const exports = {};
  const clients = [];
  const timers = new Map();
  let clock = 0, id = 0;
  vm.runInNewContext(source, {
    exports,
    window: { location: { hostname, host: hostname, protocol: hostname === 'localhost' ? 'http:' : 'https:' } },
    setTimeout(run, delay) { const key = ++id; timers.set(key, { run, at: clock + delay }); return key; },
    clearTimeout(key) { timers.delete(key); },
    require(name) {
      if (name === './tabId') return { getTabId: () => 'synthetic-tab' };
      if (name === 'graphql-ws') return { createClient(options) {
        const client = {
          options, disposed: false, terminated: false,
          dispose() { this.disposed = true; options.on.closed(); },
          terminate() { this.terminated = true; options.on.closed(); },
        };
        clients.push(client);
        options.on.connecting();
        return client;
      } };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  function tick(ms) {
    clock += ms;
    for (const [key, timer] of [...timers]) {
      if (timer.at <= clock && timers.delete(key)) timer.run();
    }
  }
  return { ...exports, clients, timers, tick };
}

test('login check and subscriptions share a connection; failures stay visible until acknowledged', () => {
  const f = fixture();
  const updates = [];
  const unsubscribe = f.subscribeWebSocketState(() => updates.push(f.getWebSocketState()));
  assert.equal(f.getWebSocketState(), 'idle');
  const client = f.getWebSocketClient();
  assert.ok(client === f.getWebSocketClient());
  assert.equal(f.clients.length, 1);
  client.options.on.error();
  assert.equal(f.getWebSocketState(), 'unavailable');
  client.options.on.connecting();
  assert.equal(f.getWebSocketState(), 'unavailable');
  client.options.on.connected();
  assert.equal(f.getWebSocketState(), 'connected');
  f.tick(5000);
  assert.equal(f.getWebSocketState(), 'connected');
  assert.deepEqual(updates, ['connecting', 'unavailable', 'connected']);
  unsubscribe();
  client.options.on.closed();
  assert.equal(updates.length, 3);
});

test('an unresponsive initial connection produces a warning after five seconds', () => {
  const f = fixture();
  const client = f.getWebSocketClient();
  f.tick(4999);
  assert.equal(f.getWebSocketState(), 'connecting');
  f.tick(1);
  assert.equal(f.getWebSocketState(), 'unavailable');
  client.options.on.connected();
  assert.equal(f.getWebSocketState(), 'connected');
});

test('missing pong terminates a stale connection; received pongs cancel the timeout', () => {
  const f = fixture();
  const client = f.getWebSocketClient();
  client.options.on.connected();
  client.options.on.ping(true); // A server ping is answered by graphql-ws.
  f.tick(5000);
  assert.equal(f.getWebSocketState(), 'connected');
  client.options.on.ping(false);
  f.tick(4000);
  client.options.on.pong(true);
  f.tick(1000);
  assert.equal(client.terminated, false);
  client.options.on.ping(false);
  f.tick(5000);
  assert.equal(client.terminated, true);
  assert.equal(f.getWebSocketState(), 'unavailable');
  client.options.on.connected();
  assert.equal(f.getWebSocketState(), 'connected');
});

test('logout disposes the connection and ignores stale callbacks after a new login', () => {
  const f = fixture();
  const old = f.getWebSocketClient();
  old.options.on.connected();
  old.options.on.ping(false);
  f.stopWebSocketClient();
  assert.equal(old.disposed, true);
  assert.equal(f.timers.size, 0);
  assert.equal(f.getWebSocketState(), 'idle');
  const next = f.getWebSocketClient();
  next.options.on.connected();
  old.options.on.closed();
  old.options.onNonLazyError(new Error('old failure'));
  old.options.on.connecting();
  f.tick(5000);
  assert.equal(f.getWebSocketState(), 'connected');
  next.options.onNonLazyError(new Error('authentication failure'));
  assert.equal(f.getWebSocketState(), 'unavailable');
});

test('reconnect listeners run only when a lost connection comes back', () => {
  const f = fixture();
  let reconnects = 0;
  const unsubscribe = f.subscribeWebSocketReconnect(() => { reconnects++; });
  const client = f.getWebSocketClient();
  client.options.on.connected(); // First connection: data were just loaded.
  assert.equal(reconnects, 0);
  client.options.on.closed();
  client.options.on.connecting();
  client.options.on.connected();
  assert.equal(reconnects, 1);
  client.options.on.connected(); // Already connected: nothing to reload.
  assert.equal(reconnects, 1);
  unsubscribe();
  client.options.on.closed();
  client.options.on.connected();
  assert.equal(reconnects, 1);
});

test('remote connections use the existing secure same-origin WebSocket route', () => {
  const f = fixture('example.invalid');
  assert.equal(f.getWebSocketClient().options.url, 'wss://example.invalid/ws/graphql');
});

test('the warning is limited to authenticated failures, with startup instructions only on localhost', () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const component = ts.transpileModule(readFileSync(path.join(__dirname, '../app/components/WebSocketStatus.tsx'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  function render(status, connection, hostname = 'localhost') {
    const exports = {};
    vm.runInNewContext(component, {
      exports, window: { location: { hostname } },
      require(name) {
        if (name === 'react') return { ...React, useEffect() {}, useSyncExternalStore: () => connection };
        if (name === 'react/jsx-runtime') return require(name);
        if (name === 'next-auth/react') return { useSession: () => ({ status }) };
        if (name === '../lib/webSocketConnection') return {};
        throw new Error(`Unexpected import: ${name}`);
      },
    });
    return renderToStaticMarkup(React.createElement(exports.default));
  }
  for (const status of ['loading', 'unauthenticated']) assert.equal(render(status, 'unavailable'), '');
  for (const state of ['idle', 'connecting', 'connected']) assert.equal(render('authenticated', state), '');
  const local = render('authenticated', 'unavailable');
  assert.match(local, /role="alert"/);
  assert.match(local, /npm run ws-server:watch/);
  const remote = render('authenticated', 'unavailable', 'example.invalid');
  assert.match(remote, /role="alert"/);
  assert.doesNotMatch(remote, /npm run/);
});

test('a socket error event (e.g. after sleep) is retried instead of stopping the client', async () => {
  const { createClient } = require('graphql-ws');
  const f = fixture('example.invalid');
  const { options } = f.getWebSocketClient();
  const sockets = [];
  class FakeWebSocket {
    static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
    constructor() {
      this.readyState = 0;
      this.sent = [];
      sockets.push(this);
      const failing = sockets.length === 1;
      setImmediate(() => {
        if (failing) {
          // Browsers fire `error` (a plain Event, no close code) before `close`.
          this.readyState = 3;
          this.onerror?.({ type: 'error' });
          this.onclose?.({ code: 1006, reason: '', wasClean: false });
        } else {
          this.readyState = 1;
          this.onopen?.();
        }
      });
    }
    send(data) {
      this.sent.push(data);
      if (JSON.parse(data).type === 'connection_init') {
        setImmediate(() => this.onmessage?.({ data: JSON.stringify({ type: 'connection_ack' }) }));
      }
    }
    close() { this.readyState = 3; }
  }
  const fatal = [];
  let connected;
  const done = new Promise(resolve => { connected = resolve; });
  const client = createClient({
    ...options,
    webSocketImpl: FakeWebSocket,
    retryWait: async () => {},
    keepAlive: 0,
    connectionAckWaitTimeout: 0,
    onNonLazyError: error => { fatal.push(error); connected(); },
    on: { connected: () => connected() },
  });
  await done;
  await client.dispose();
  assert.deepEqual(fatal, []);
  assert.equal(sockets.length, 2);
});
