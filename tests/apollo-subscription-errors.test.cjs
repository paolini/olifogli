const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { gql } = require('@apollo/client');

function fixture(error) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(path.join(__dirname, '../app/lib/apolloClient.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  let unsubscribed = false;
  vm.runInNewContext(source, {
    exports, window: { location: { origin: 'http://localhost:3000' } },
    require(name) {
      if (name === './webSocketConnection') return { getWebSocketClient: () => ({
        subscribe(_, sink) {
          queueMicrotask(() => sink.error(error));
          return () => { unsubscribed = true; };
        },
      }) };
      return require(name);
    },
  });
  return {
    client: exports.apolloClient,
    unsubscribed: () => unsubscribed,
    receiveError() {
      return new Promise((resolve, reject) => exports.apolloClient.subscribe({ query: gql`subscription { cursorChanged { tabId } }` }).subscribe({
        next: () => reject(new Error('Unexpected subscription data')),
        error: resolve,
      }));
    },
  };
}

test('socket failures receive an explicit safe code and unsubscribe', async () => {
  for (const failure of [new Error('PRIVATE'), { code: 1006, reason: 'PRIVATE' }, { target: { readyState: WebSocket.CLOSED } }]) {
    const f = fixture(failure);
    const error = await f.receiveError();
    assert.equal(error.code, 'WEBSOCKET_CONNECTION_ERROR');
    assert.equal(error.message, 'Connessione WebSocket non disponibile.');
    assert.equal(f.unsubscribed(), true);
    f.client.stop();
  }
});

test('server GraphQL errors keep their codes instead of being labeled as connection failures', async () => {
  for (const code of ['FORBIDDEN', 'INTERNAL_SERVER_ERROR']) {
    const f = fixture([{ message: 'Server error', extensions: { code } }]);
    const error = await f.receiveError();
    assert.equal(error.graphQLErrors[0].extensions.code, code);
    assert.equal(error.code, undefined);
    f.client.stop();
  }
});
