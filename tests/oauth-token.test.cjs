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
const diagnostics = [];
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
    exports, URL, process: { env },
    console: Object.fromEntries(['log', 'warn', 'error'].map(level => [level, line => diagnostics.push(JSON.parse(line))])), ...globals,
    require(id) {
      if (id === './logging') return load('app/lib/logging.ts');
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
    account: { access_token: ACCESS_TOKEN, scope: 'openid email profile api' },
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
    await assert.rejects(queryOlimanager(req, '{ users { me { id } } }'), /Sessione OAuth/);
  }
});

test('OAuth diagnostics identify expired tokens before any remote request without leaking secrets', async () => {
  const token = await authOptions.callbacks.jwt({
    token: {},
    account: {
      access_token: ACCESS_TOKEN,
      refresh_token: 'synthetic-refresh-secret',
      expires_at: Math.floor(Date.now() / 1000) - 120,
      scope: 'openid email profile',
    },
  });
  const cookie = await encode({ secret: SECRET, token });
  const { queryOlimanager } = load('app/lib/olimanager.ts', {
    'next-auth/jwt': {
      getToken: (params) => require('next-auth/jwt').getToken({ ...params, secureCookie: false }),
    },
  }, { fetch: () => assert.fail('Expired token must not reach Olimanager') });
  await assert.rejects(queryOlimanager(new NextRequest('http://app.example.invalid/api/test', {
    headers: { cookie: `next-auth.session-token=${cookie}` },
  }), '{ users { me { id } } }'), (err) => err.status === 401);
  const auth = diagnostics.findLast((entry) => entry.event === 'olimanager.graphql_auth');
  assert.equal(auth.hasAccessToken, true);
  assert.equal(auth.hasApiScope, false);
  assert.equal(auth.accessTokenExpired, true);
  assert.ok(auth.expiresInSeconds <= -120);
  assert.equal(auth.sameOrigin, true);
  assert.equal(diagnostics.at(-1).event, 'olimanager.graphql_auth');
  const output = JSON.stringify(diagnostics);
  for (const secret of [ACCESS_TOKEN, 'synthetic-refresh-secret', SECRET, cookie]) {
    assert.equal(output.includes(secret), false);
  }
});

test('OAuth session exposes only the scope flag while credentials and expiry remain private', async () => {
  const token = await authOptions.callbacks.jwt({
    token: {},
    account: { access_token: ACCESS_TOKEN, scope: 'openid api email', expires_at: 2000000000 },
  });
  assert.equal(token.accessTokenHasApiScope, true);
  assert.equal(token.accessTokenExpiresAt, 2000000000);
  const session = await authOptions.callbacks.session({ session: { user: {}, expires: 'synthetic-expiry' }, token });
  assert.equal(session.olimanagerApiScope, true);
  assert.equal(Object.hasOwn(session, 'accessTokenHasApiScope'), false);
  assert.equal(Object.hasOwn(session, 'accessTokenExpiresAt'), false);
});

test('transfer adapter uses each encrypted OAuth session without password login or cookie forwarding', async () => {
  const calls = [];
  const { queryOlimanager } = load('app/lib/olimanager.ts', {
    'next-auth/jwt': {
      getToken: (params) => require('next-auth/jwt').getToken({ ...params, secureCookie: false }),
    },
  }, { fetch: async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ data: { participants: { ok: true } } }));
  } });
  const { OlimanagerApi } = load('app/graphql/resolvers/olimanagerApi.ts', {
    '@/app/lib/olimanager': { queryOlimanager },
  });
  for (const accessToken of [ACCESS_TOKEN, 'synthetic-other-administrator-token']) {
    const cookie = await encode({ secret: SECRET, token: { accessToken, accessTokenHasApiScope: true } });
    const req = new NextRequest('http://app.example.invalid/api/graphql', {
      headers: { cookie: `next-auth.session-token=${cookie}` },
    });
    const result = await new OlimanagerApi(req).query('mutation Transfer { participants { ok } }', { contestId: 10 });
    assert.equal(result.data.participants.ok, true);
    const { url, options } = calls.at(-1);
    assert.equal(url, env.OLIMANAGER_GRAPHQL_ENDPOINT);
    assert.equal(options.headers.Authorization, `Bearer ${accessToken}`);
    assert.equal(Object.hasOwn(options.headers, 'Cookie'), false);
    assert.equal(Object.hasOwn(options.headers, 'X-CsrfToken'), false);
    assert.deepEqual(JSON.parse(options.body).variables, { contestId: 10 });
  }
  assert.equal(calls.length, 2);
  await assert.rejects(new OlimanagerApi(new NextRequest('http://app.example.invalid/api/graphql')).query('mutation { transfer }'), /Sessione OAuth/);
  assert.equal(calls.length, 2);
});

test('provider defaults do not request api scope when login has no explicit scope override', () => {
  const provider = authOptions.providers.find(provider => provider.id === 'olimanager');
  assert.equal(provider.authorization.params.scope, 'openid email profile');
});

for (const [scope, message] of [[false, 'non ha lo scope api'], [null, 'non è verificabile'], [undefined, 'non è verificabile']]) {
  test(`scope=${scope} fails locally with re-login instructions before any GraphQL request`, async () => {
    const token = { accessToken: ACCESS_TOKEN, accessTokenExpiresAt: Date.now() / 1000 + 3600,
      ...(scope === undefined ? {} : { accessTokenHasApiScope: scope }) };
    const cookie = await encode({ secret: SECRET, token });
    const { queryOlimanager, requireOlimanagerApiSession } = load('app/lib/olimanager.ts', {
      'next-auth/jwt': { getToken: params => require('next-auth/jwt').getToken({ ...params, secureCookie: false }) },
    }, { fetch() { assert.fail('Scope failure must not send a remote request'); } });
    const req = new NextRequest('http://app.example.invalid/api/graphql', {
      headers: { cookie: `next-auth.session-token=${cookie}` },
    });
    for (const action of [() => queryOlimanager(req, 'mutation { transfer }'), () => requireOlimanagerApiSession(req)]) {
      await assert.rejects(action(), error => error.status === 403 && error.message.includes(message) && error.message.includes('Esci e accedi'));
    }
  });
}

test('public session reports granted or unknown scope without trusting requested scope', async () => {
  for (const scope of ['openid email profile', undefined]) {
    const token = await authOptions.callbacks.jwt({ token: {}, account: { access_token: ACCESS_TOKEN, scope } });
    const session = await authOptions.callbacks.session({ session: { user: {}, expires: 'synthetic' }, token });
    assert.equal(session.olimanagerApiScope, scope === undefined ? null : false);
    assert.ok(!JSON.stringify(session).includes(ACCESS_TOKEN));
  }
});
