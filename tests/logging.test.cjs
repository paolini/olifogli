const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const { buildSchema, parse } = require('graphql');
const { cleanupLogs, retentionDays } = require('../scripts/cleanup-logs.cjs');

function loadLogging(env = {}) {
  const lines = [];
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const exports = {};
    const source = ts.transpileModule(readFileSync(path.resolve(__dirname, '..', file), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    }).outputText;
    vm.runInNewContext(source, {
      exports, URL, process: { env }, console: Object.fromEntries(['log', 'error', 'warn'].map(level => [level, line => lines.push(String(line))])),
      require(id) {
        if (id === '../lib/logging' || id === './logging') return load('app/lib/logging.ts');
        if (id === '../lib/appLog') return load('app/lib/appLog.ts');
        if (['node:fs', 'node:path', 'node:crypto'].includes(id)) return require(id);
        throw new Error(`Unexpected logging dependency: ${id}`);
      },
    });
    cache.set(file, exports);
    return exports;
  }
  return { lines, helper: load('app/lib/logging.ts'), plugin: load('app/graphql/logger-plugin.ts').graphqlLoggerPlugin,
    appLog: load('app/lib/appLog.ts') };
}

test('GraphQL requests go to the daily application log with operational metadata only', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'olifogli-log-'));
  try {
    const { plugin, lines } = loadLogging({ LOG_DIR: directory });
    const secret = 'SENSITIVE_PERSON_TOKEN';
    const document = parse(`query ${secret} { ${secret}: sheet ...Fragment } fragment Fragment on Query { sheet }`);
    const context = {
      schema: buildSchema('type Query { sheet: String }'), document, operation: document.definitions[0],
      request: { operationName: secret, variables: { nested: { password: secret, name: secret } }, query: secret },
      contextValue: { email: secret, user_id: secret },
      errors: [{ message: secret, stack: secret, extensions: { code: 'FORBIDDEN', private: secret } }, { message: secret, extensions: { code: secret } }],
      response: { body: { singleResult: { data: { sheet: secret } } } },
    };
    const listener = await plugin.requestDidStart(context);
    await listener.willSendResponse(context);
    const files = await fs.readdir(directory);
    assert.equal(files.length, 1);
    assert.match(files[0], /^app-\d{4}-\d{2}-\d{2}\.log$/);
    const content = await fs.readFile(path.join(directory, files[0]), 'utf8');
    assert.equal(content.includes(secret), false);
    const entry = JSON.parse(content);
    assert.deepEqual(Object.keys(entry).sort(), ['timestamp','level','source','event','requestId','type','fields','durationMs','status','errorCount','errorCodes'].sort());
    assert.equal(entry.event, 'graphql.request');
    assert.equal(entry.level, 'warn');
    assert.equal(entry.source, 'app');
    assert.deepEqual(entry.fields, ['sheet']);
    assert.equal(entry.status, 'error');
    assert.equal(entry.errorCount, 2);
    assert.deepEqual(entry.errorCodes, ['FORBIDDEN', 'INTERNAL_SERVER_ERROR']);
    assert.ok(entry.durationMs >= 0);
    assert.match(entry.requestId, /^[a-f0-9-]{36}$/);
    // Only the unexpected failure reaches the server log, without request details.
    assert.equal(lines.length, 1);
    const serverEntry = JSON.parse(lines[0]);
    assert.deepEqual(Object.keys(serverEntry).sort(), ['timestamp','level','source','event','requestId','fields'].sort());
    assert.equal(serverEntry.event, 'graphql.internal_error');
    assert.equal(serverEntry.requestId, entry.requestId);
    assert.equal(lines[0].includes(secret), false);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('invalid GraphQL input and unknown codes cannot inject log values', async () => {
  const { plugin, lines } = loadLogging();
  const listener = await plugin.requestDidStart({});
  await listener.willSendResponse({ request: { operationName: 'PRIVATE' }, errors: [{ message: 'PRIVATE', extensions: { code: 'PRIVATE' } }] });
  assert.equal(lines.join('').includes('PRIVATE'), false);
  assert.deepEqual(JSON.parse(lines[0]).fields, []);
});

test('diagnostic and WebSocket logs discard error bodies, stacks and identifiers', () => {
  const { helper, lines } = loadLogging();
  const error = { code: 'ECONNREFUSED', message: 'PRIVATE', cause: { password: 'PRIVATE' }, stack: 'PRIVATE' };
  helper.logDiagnostic('redis.connection_failed', error);
  helper.logWebSocketEvent('error', [error, { extensions: { code: 'PRIVATE' } }]);
  helper.logWebSocketEvent('next');
  assert.equal(lines.join('').includes('PRIVATE'), false);
  assert.equal(JSON.parse(lines[0]).code, 'ECONNREFUSED');
  assert.deepEqual(JSON.parse(lines[1]).errorCodes, ['ECONNREFUSED', 'INTERNAL_SERVER_ERROR']);
  assert.deepEqual(Object.keys(JSON.parse(lines[2])).sort(), ['timestamp','level','source','event','errorCount','errorCodes'].sort());
  assert.equal(JSON.parse(lines[0]).level, 'error');
  assert.equal(JSON.parse(lines[2]).level, 'info');
});

test('subscription diagnostics recognize Apollo wrappers without logging raw errors', () => {
  const { ApolloError } = require('@apollo/client');
  const { helper, lines } = loadLogging();
  const socketError = Object.assign(new Error('PRIVATE'), { code: 'WEBSOCKET_CONNECTION_ERROR' });
  for (const error of [socketError, new ApolloError({ protocolErrors: [socketError] }), new ApolloError({ networkError: socketError })]) {
    helper.logDiagnostic('subscription.failed', error);
    const entry = JSON.parse(lines.at(-1));
    assert.equal(entry.code, 'WEBSOCKET_CONNECTION_ERROR');
    assert.match(entry.message, /npm run ws-server:watch/);
  }
  helper.logDiagnostic('subscription.failed', new ApolloError({ graphQLErrors: [{ message: 'PRIVATE', extensions: { code: 'FORBIDDEN' } }] }));
  assert.equal(JSON.parse(lines.at(-1)).code, 'FORBIDDEN');
  helper.logDiagnostic('subscription.failed', new ApolloError({ graphQLErrors: [{ message: 'PRIVATE', extensions: { code: 'INTERNAL_SERVER_ERROR' } }] }));
  assert.equal(JSON.parse(lines.at(-1)).code, 'INTERNAL_SERVER_ERROR');
  const cyclic = {};
  cyclic.networkError = cyclic;
  assert.equal(helper.safeErrorCode(cyclic), 'INTERNAL_SERVER_ERROR');
  assert.equal(lines.join('').includes('PRIVATE'), false);
});

test('cleanup removes only expired regular daily logs, including legacy files', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'olifogli-cleanup-'));
  try {
    const expired = ['graphql-2026-09-16.log', 'graphql-errors-2026-08-01.log', 'app-2026-09-01.log'];
    const retained = ['graphql-2026-09-17.log', 'graphql-2026-10-16.log', 'graphql-2027-01-01.log', 'graphql-2026-02-30.log', 'other.log', 'graphql-2026-01-01.log.bak'];
    for (const file of [...expired, ...retained]) await fs.writeFile(path.join(directory,file), 'legacy personal payload');
    await fs.mkdir(path.join(directory,'graphql-2026-01-02.log'));
    await fs.symlink(path.join(directory,'other.log'), path.join(directory,'graphql-2026-01-03.log'));
    const options = { directory, now: new Date('2026-10-16T15:00:00Z') };
    assert.deepEqual(await cleanupLogs({ ...options, dryRun: true }), expired.sort());
    for (const file of expired) assert.equal(await fs.readFile(path.join(directory,file),'utf8'), 'legacy personal payload');
    assert.deepEqual(await cleanupLogs(options), expired);
    assert.deepEqual(await cleanupLogs(options), []);
    for (const file of retained) await fs.access(path.join(directory,file));
    assert.ok((await fs.lstat(path.join(directory,'graphql-2026-01-03.log'))).isSymbolicLink());
    assert.ok((await fs.lstat(path.join(directory,'graphql-2026-01-02.log'))).isDirectory());
    // Explicitly configurable, using UTC whole days at the boundary.
    assert.deepEqual(await cleanupLogs({ ...options, days: 1, dryRun: true }), ['graphql-2026-09-17.log']);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
test('cleanup fails closed for invalid settings', async () => {
  assert.equal(retentionDays(), 30);
  for (const value of ['', '0', '-1', '1.5', 'NaN', '30x']) assert.throws(() => retentionDays(value));
  await assert.rejects(cleanupLogs({ directory: '' }), /LOG_DIR/);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'olifogli-symlink-'));
  try {
    await fs.symlink(directory, path.join(directory,'link'));
    await assert.rejects(cleanupLogs({ directory: path.join(directory,'link') }), /real directory/);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('OAuth serializer allowlists metadata and strips secrets from origins and unexpected fields', () => {
  const { helper, lines } = loadLogging();
  helper.logOlimanagerEvent('graphql_auth', {
    hasSession: true, hasAccessToken: true, hasApiScope: true, expiresInSeconds: 3600,
    graphqlOrigin: 'https://user:PRIVATE@example.invalid/graphql/?token=PRIVATE',
    providerOrigin: 'javascript:PRIVATE', sameOrigin: 'PRIVATE', accessTokenExpired: false,
    accessToken: 'PRIVATE', password: 'PRIVATE',
  });
  helper.logOlimanagerEvent('graphql_response', { status: 401, redirected: false, responseBody: 'PRIVATE' });
  helper.logOlimanagerEvent('oauth_login', { hasApiScope: 'PRIVATE', expiresInSeconds: Infinity, secret: 'PRIVATE' });
  helper.logOlimanagerEvent('PRIVATE', { secret: 'PRIVATE' });
  assert.equal(lines.length, 3);
  assert.ok(!lines.join('\n').includes('PRIVATE'));
  const auth = JSON.parse(lines[0]);
  assert.equal(auth.graphqlOrigin, 'https://example.invalid');
  assert.equal(auth.providerOrigin, null);
  assert.equal(auth.sameOrigin, null);
  assert.equal(auth.hasAccessToken, true);
  assert.equal(JSON.parse(lines[1]).status, 401);
  assert.equal(JSON.parse(lines[2]).expiresInSeconds, null);
});

test('application log calls cannot bypass the centralized serializers', () => {
  const { readdirSync } = require('node:fs');
  const root = path.resolve(__dirname, '..');
  // The serializers themselves forward events received as parameters.
  const allowed = new Set(['app/lib/logging.ts', 'app/lib/appLog.ts', 'app/graphql/logger-plugin.ts']);
  function inspect(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) { inspect(file); continue; }
      if (!/\.tsx?$/.test(file)) continue;
      const relative = path.relative(root, file);
      if (allowed.has(relative)) continue;
      const ast = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
      function walk(node) {
        if (ts.isCallExpression(node)) {
          const callee = node.expression.getText(ast);
          assert.equal(/^(console\.(log|error|warn|info|debug)|process\.(stdout|stderr)\.write)$/.test(callee), false, `Raw logging in ${relative}`);
          if (['logDiagnostic', 'serverLog', 'appLog'].includes(callee)) {
            const event = node.arguments[callee === 'serverLog' ? 1 : 0];
            assert.ok(event && ts.isStringLiteral(event), `Non-static ${callee} event in ${relative}`);
          }
        }
        ts.forEachChild(node, walk);
      }
      walk(ast);
    }
  }
  inspect(path.join(root, 'app'));
});

test('application events carry the user id, keep reserved fields and are published', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'olifogli-log-'));
  try {
    const { appLog, helper, lines } = loadLogging({ LOG_DIR: directory, APP_INSTANCE: 'app2' });
    const published = [];
    appLog.setAppLogPublisher(async entry => { published.push(entry); });
    const entry = appLog.appLog('sheet.deleted', { sheetId: 'abc', event: 'forged', level: 'forged', userId: 'forged' },
      { userId: { toString: () => 'user-1' }, level: 'warn' });
    assert.deepEqual(JSON.parse(JSON.stringify({ ...entry, timestamp: 'T' })), { timestamp: 'T', level: 'warn', source: 'app2', event: 'sheet.deleted', userId: 'user-1', sheetId: 'abc' });
    assert.equal(published.length, 1);
    assert.equal(published[0], entry);
    const [file] = await fs.readdir(directory);
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(directory, file), 'utf8')), JSON.parse(JSON.stringify(entry)));
    assert.equal(lines.length, 0);

    helper.setLogSource('worker');
    assert.equal(appLog.appLog('worker.event').source, 'worker');
    appLog.setAppLogPublisher(null);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('without LOG_DIR application events go to stdout; publish failures are reported once per minute', async () => {
  const { appLog, lines } = loadLogging();
  appLog.setAppLogPublisher(async () => { throw Object.assign(new Error('PRIVATE'), { code: 'ECONNREFUSED' }); });
  appLog.appLog('scan.deleted', { jobId: 'j1' });
  appLog.appLog('scan.deleted', { jobId: 'j2' });
  await new Promise(resolve => setImmediate(resolve));
  appLog.setAppLogPublisher(null);
  const entries = lines.map(line => JSON.parse(line));
  assert.deepEqual(entries.filter(entry => entry.event === 'scan.deleted').map(entry => entry.jobId), ['j1', 'j2']);
  const failures = entries.filter(entry => entry.event === 'app_log.publish_failed');
  assert.equal(failures.length, 1);
  assert.equal(failures[0].code, 'ECONNREFUSED');
  assert.equal(lines.join('').includes('PRIVATE'), false);
});
