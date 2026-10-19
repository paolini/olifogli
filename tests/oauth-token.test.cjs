const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const { NextRequest } = require('next/server');
const { encode } = require('next-auth/jwt');
const { AuthHandler } = require(path.join(path.dirname(require.resolve('next-auth')), 'core/index.js'));

const SECRET = 'synthetic-oauth-test-secret';
const ACCESS_TOKEN = 'synthetic-private-provider-token';
const env = {
  NEXTAUTH_SECRET: SECRET,
  OLIMANAGER_OAUTH_CLIENT_ID: 'synthetic-client',
  OLIMANAGER_OAUTH_CLIENT_SECRET: 'synthetic-client-secret',
  OLIMANAGER_URL: 'https://provider.example.invalid',
  OLIMANAGER_GRAPHQL_ENDPOINT: 'https://provider.example.invalid/graphql/',
};

function load(relative, stubs = {}, globals = {}) {
  const filename = path.resolve(__dirname, '..', relative);
  const exports = {};
  const source = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(source, {
    exports, process: { env }, ...globals,
    require(id) {
      if (Object.hasOwn(stubs, id)) return stubs[id];
      if (id === 'next-auth/jwt') return require(id);
      throw new Error(`Unexpected dependency: ${id}`);
    },
  }, { filename });
  return exports;
}

const { authOptions } = load('app/lib/auth.ts', {
  './logging': { logDiagnostic() {} },
  '@/app/lib/mongodb': {
    getUsersCollection() { throw new Error('Unexpected database access'); },
    getAccountsCollection() { throw new Error('Unexpected database access'); },
  },
});

async function sessionCookie(extra = {}) {
  // Exercise the actual login JWT callback, including preservation on later requests.
  const token = await authOptions.callbacks.jwt({
    token: { user_id: 'synthetic-user', ...extra },
    account: { access_token: ACCESS_TOKEN },
  });
  return encode({ secret: SECRET, token: await authOptions.callbacks.jwt({ token }) });
}

test('the actual NextAuth session response never exposes OAuth credentials', async () => {
  const cookie = await sessionCookie();
  const response = await AuthHandler({
    options: { ...authOptions, useSecureCookies: true },
    req: {
      action: 'session', method: 'GET', query: {},
      headers: { host: 'app.example.invalid', 'x-forwarded-proto': 'https' },
      cookies: { '__Secure-next-auth.session-token': cookie },
    },
  });
  assert.equal(response.status ?? 200, 200);
  assert.equal(response.body.user._id, 'synthetic-user');
  assert.ok(response.body.expires);
  assert.equal(Object.hasOwn(response.body, 'accessToken'), false);
  assert.equal(JSON.stringify(response.body).includes(ACCESS_TOKEN), false);
});

for (const secure of [false, true]) {
  test(`server GraphQL uses the encrypted ${secure ? 'HTTPS chunked' : 'HTTP'} session cookie`, async () => {
    const cookie = await sessionCookie();
    const cookieName = secure ? '__Secure-next-auth.session-token' : 'next-auth.session-token';
    const cookieHeader = secure
      ? `${cookieName}.0=${cookie.slice(0, 80)}; ${cookieName}.1=${cookie.slice(80)}`
      : `${cookieName}=${cookie}`;
    let calls = 0;
    // Override secureCookie detection only; decoding and validation remain real.
    const { queryOlimanager } = load('app/lib/olimanager.ts', {
      'next-auth/jwt': {
        getToken: (params) => require('next-auth/jwt').getToken({ ...params, secureCookie: secure }),
      },
    }, {
      fetch: async (url, options) => {
        calls++;
        assert.equal(url, env.OLIMANAGER_GRAPHQL_ENDPOINT);
        assert.equal(options.headers.Authorization, `Bearer ${ACCESS_TOKEN}`);
        assert.equal(options.cache, 'no-store');
        assert.deepEqual(JSON.parse(options.body), { query: 'query Me { users { me { id } } }', variables: {} });
        return new Response(JSON.stringify({ data: { users: { me: { id: 'provider-user' } } } }));
      },
    });
    const req = new NextRequest(`${secure ? 'https' : 'http'}://app.example.invalid/api/test`, {
      headers: { cookie: cookieHeader },
    });
    const data = await queryOlimanager(req, 'query Me { users { me { id } } }', {});
    assert.equal(data.users.me.id, 'provider-user');
    assert.equal(calls, 1);
  });
}

test('missing, tampered, expired or tokenless sessions cannot call Olimanager', async () => {
  const valid = await sessionCookie();
  const cookies = [
    '',
    `${valid.slice(0, -8)}tampered`,
    await encode({ secret: SECRET, token: { accessToken: ACCESS_TOKEN }, maxAge: -60 }),
    await encode({ secret: SECRET, token: { user_id: 'synthetic-user' } }),
  ];
  const { queryOlimanager } = load('app/lib/olimanager.ts', {
    'next-auth/jwt': {
      getToken: (params) => require('next-auth/jwt').getToken({ ...params, secureCookie: false }),
    },
  }, { fetch() { assert.fail('An unauthenticated request must not reach Olimanager'); } });
  for (const cookie of cookies) {
    const req = new NextRequest('http://app.example.invalid/api/test', {
      headers: { cookie: `next-auth.session-token=${cookie}` },
    });
    await assert.rejects(queryOlimanager(req, '{ users { me { id } } }'), /Non autenticato/);
  }
});
