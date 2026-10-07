const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const { buildSchema, graphql } = require('graphql');
const { encode } = require('next-auth/jwt');
const SECRET = 'synthetic-test-secret-not-used-outside-tests';

// Only synthetic identities. Never read .env or connect to application services.
const ADMIN_ID = '000000000000000000000001';
const ADMIN_EMAIL = 'admin@example.invalid';

async function loadWebSocketOptions(env = {}) {
  let capture;
  let fail;
  const ready = new Promise((resolve, reject) => {
    capture = resolve;
    fail = reject;
  });
  const users = {
    async findOne({ _id }) {
      return _id.toString() === ADMIN_ID
        ? { _id, isAdmin: true, isSupervisor: false }
        : null;
    },
  };
  const collection = { watch: () => ({ on() {} }) };
  const pubsub = { async publish() {} };
  const httpServer = { listen() { return { close() {} }; } };
  const express = () => ({ use() {} });
  const stubs = {
    http: { createServer: () => httpServer },
    ws: { WebSocketServer: class {} },
    'graphql-ws/use/ws': {
      useServer(options) {
        capture(options);
        return { async dispose() {} };
      },
    },
    '@apollo/server': { ApolloServer: class { async start() {} } },
    '@apollo/server/express4': { expressMiddleware: () => () => {} },
    express,
    cors: () => () => {},
    'body-parser': { json: () => () => {} },
    '@graphql-tools/schema': { makeExecutableSchema: () => ({}) },
    './app/lib/pubsub.js': { pubsub, TOPICS: {} },
    './app/lib/mongodb.js': {
      getUsersCollection: async () => users,
      getScanJobsCollection: async () => collection,
      getScanSheetJobsCollection: async () => collection,
    },
    './app/lib/redis.js': { redis: {}, CURSOR_KEY: () => '' },
    './app/graphql/typedefs.js': { typeDefs: '' },
    './app/graphql/resolvers.js': { resolvers: {} },
    // With no HTTP request, get_context forwards the identity and roles.
    './app/graphql/types.js': { get_context: async (context) => context },
  };
  const filename = path.resolve(__dirname, '../ws-server.ts');
  const source = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
      esModuleInterop: true },
    fileName: filename,
  }).outputText;
  // Execute the actual server module and capture the callbacks it registers.
  // Dependencies are explicitly allowlisted: unexpected imports fail closed.
  vm.runInNewContext(source, {
    exports: {},
    require(id) {
      if (Object.hasOwn(stubs, id)) return stubs[id];
      if (['jsonwebtoken', 'mongodb', 'next-auth/jwt', 'next/server', 'graphql'].includes(id)) return require(id);
      throw new Error(`Unexpected dependency in isolated WS test: ${id}`);
    },
    process: { env: { NEXTAUTH_SECRET: SECRET, NEXTAUTH_URL: 'http://localhost:3000', ...env }, on() {}, exit(code) { fail(new Error(`Server exited: ${code}`)); } },
    console: { log() {}, error(...args) { fail(new Error(args.map(String).join(' '))); } },
  }, { filename });
  return ready;
}

const schema = buildSchema('type Query { adminOnly: String! }');
async function probe(connectionParams, cookie = '', env = {}) {
  const options = await loadWebSocketOptions(env);
  const ctx = { connectionParams, extra: { request: { headers: { cookie } } } };
  // A rejection at connection establishment is a valid way to block the attack.
  const accepted = await options.onConnect(ctx);
  if (accepted === false) return { rejected: true };
  const context = await options.context(ctx);
  const result = await graphql({
    schema,
    source: '{ adminOnly }',
    contextValue: context,
    rootValue: {
      adminOnly(_args, identity) {
        if (!identity.isAdmin) throw new Error('Forbidden');
        return 'synthetic privileged data';
      },
    },
  });
  return { context, result };
}

test('control: an anonymous connection cannot access admin data', { timeout: 5000 }, async () => {
  const outcome = await probe({});
  if (outcome.rejected) return;
  assert.notEqual(outcome.context.isAdmin, true);
  assert.equal(outcome.result.data, null);
  assert.match(outcome.result.errors[0].message, /Forbidden/);
});

test('regression #34: an unsigned token cannot impersonate an administrator', { timeout: 5000 }, async () => {
  const base64url = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const forgedToken = `${base64url({ alg: 'none', typ: 'JWT' })}.${base64url({
    user_id: ADMIN_ID, email: ADMIN_EMAIL,
  })}.`;
  const outcome = await probe({ sessionToken: forgedToken });
  if (outcome.rejected) return;
  assert.notEqual(outcome.context.isAdmin, true,
    'Unsigned token was accepted as an admin identity by the real WS context callback');
  assert.equal(outcome.result.data, null, 'Forged identity must not receive privileged data');
});

async function sessionCookie({ secret = SECRET, maxAge = 3600, user_id = ADMIN_ID, secure = false, chunks = false } = {}) {
  const token = await encode({ secret, maxAge, token: { user_id, email: ADMIN_EMAIL } });
  const name = `${secure ? '__Secure-' : ''}next-auth.session-token`;
  if (!chunks) return `${name}=${token}`;
  const midpoint = Math.floor(token.length / 2);
  // Reverse header order to ensure NextAuth reassembles chunks by index.
  return `${name}.1=${token.slice(midpoint)}; ${name}.0=${token.slice(0, midpoint)}`;
}

for (const secure of [false, true]) {
  for (const chunks of [false, true]) {
    test(`valid NextAuth session works (secure=${secure}, chunks=${chunks})`, async () => {
      const outcome = await probe({}, await sessionCookie({ secure, chunks }), {
        NEXTAUTH_URL: secure ? 'https://example.invalid' : 'http://localhost:3000',
      });
      assert.notEqual(outcome.rejected, true);
      assert.equal(outcome.context.user_id.toString(), ADMIN_ID);
      assert.equal(outcome.context.isAdmin, true);
      assert.equal(outcome.result.data.adminOnly, 'synthetic privileged data');
    });
  }
}

for (const [name, settings] of [
  ['expired', { maxAge: -60 }],
  ['wrong secret', { secret: 'different-synthetic-secret' }],
  ['invalid user id', { user_id: 'not-an-object-id' }],
]) {
  test(`rejects ${name} session`, async () => {
    assert.equal((await probe({}, await sessionCookie(settings))).rejected, true);
  });
}

test('rejects tampered encrypted session cookie', async () => {
  const cookie = await sessionCookie();
  const parts = cookie.split('.');
  const last = parts.length - 1;
  parts[last] = (parts[last][0] === 'A' ? 'B' : 'A') + parts[last].slice(1);
  assert.equal((await probe({}, parts.join('.'))).rejected, true);
});

test('fails closed when NEXTAUTH_SECRET is missing', async () => {
  assert.equal((await probe({}, await sessionCookie(), { NEXTAUTH_SECRET: '' })).rejected, true);
});

test('connection parameters cannot override the cookie identity', async () => {
  const forgedToken = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(JSON.stringify({ user_id: ADMIN_ID })).toString('base64url')}.`;
  const outcome = await probe({ sessionToken: forgedToken }, await sessionCookie({ user_id: '000000000000000000000002' }));
  assert.equal(outcome.context.user_id.toString(), '000000000000000000000002');
  assert.equal(outcome.context.isAdmin, false);
});

for (const [name, query, operationName, allowed] of [
  ['subscription', 'subscription { changed }', undefined, true],
  ['query', '{ adminOnly }', undefined, false],
  ['mutation', 'mutation { remove }', undefined, false],
  ['named query among subscriptions', 'subscription S { changed } query Q { adminOnly }', 'Q', false],
  ['named subscription', 'query Q { adminOnly } subscription S { changed }', 'S', true],
  ['ambiguous document', 'query Q { adminOnly } subscription S { changed }', undefined, false],
  ['invalid syntax', 'subscription {', undefined, false],
]) {
  test(`operation policy: ${name}`, async () => {
    const options = await loadWebSocketOptions();
    const ctx = { connectionParams: {}, extra: { request: { headers: { cookie: await sessionCookie() } } } };
    assert.notEqual(await options.onConnect(ctx), false);
    const result = await options.onSubscribe(ctx, 'test', { query, operationName });
    if (allowed) assert.equal(result, undefined);
    else {
      assert.equal(result.length, 1);
      assert.match(result[0].message, /Only subscription|Invalid GraphQL/);
    }
  });
}

test('checks authentication again when starting an operation', async () => {
  const options = await loadWebSocketOptions();
  const ctx = { connectionParams: {}, extra: { request: { headers: { cookie: await sessionCookie() } } } };
  assert.notEqual(await options.onConnect(ctx), false);
  ctx.extra.request.headers.cookie = await sessionCookie({ maxAge: -60 });
  const result = await options.onSubscribe(ctx, 'test', { query: 'subscription { changed }' });
  assert.equal(result[0].message, 'Unauthorized');
  await assert.rejects(options.context(ctx), /Unauthorized/);
});
