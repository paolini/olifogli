const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const { NextRequest } = require('next/server');

function load(relative, stubs = {}) {
  const filename = path.resolve(__dirname, '..', relative);
  const exports = {};
  const source = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(source, {
    exports, URL,
    process: { env: { NODE_ENV: 'production', OLIMANAGER_PUBLIC_KEY: 'synthetic-key' } },
    require(id) {
      if (Object.hasOwn(stubs, id)) return stubs[id];
      if (['next/server', 'cookie'].includes(id)) return require(id);
      throw new Error(`Unexpected dependency: ${id}`);
    },
  }, { filename });
  return exports;
}
const util = load('app/api/auth/util.ts');
const unsafe = [null, '', 'https://evil.invalid', 'https://app.invalid/sheet', 'javascript:alert(1)',
  '//evil.invalid', '///evil.invalid', '/\\evil.invalid', '\\evil.invalid',
  '/\n/evil.invalid', '/\t/evil.invalid', ' /sheet', 'sheet/123',
  '/%2fevil.invalid', '/%5cevil.invalid', '/%252fevil.invalid', '/%255cevil.invalid',
  '/%0d%0aLocation:https://evil.invalid', '/%00', '/bad%zz',
  '/a/..//evil.invalid', '/%2e%2e//evil.invalid'];
const safe = ['/', '/sheet/123?tab=edit', '/workbook/123#results',
  '/search?q=citt%C3%A0', '/search?q=due%20parole', '/search?next=https%3A%2F%2Fexample.invalid'];

for (const destination of unsafe) {
  test(`unsafe redirect falls back: ${JSON.stringify(destination)}`, () => {
    const req = new NextRequest('https://app.invalid/api/auth/logout', { headers: { host: 'evil.invalid' } });
    assert.equal(util.safeRedirectUrl(req, destination).href, 'https://app.invalid/');
  });
}
for (const destination of safe) {
  test(`internal redirect preserved: ${destination}`, () => {
    assert.equal(util.safeRedirectUrl(new NextRequest('https://app.invalid/'), destination).href,
      new URL(destination, 'https://app.invalid').href);
  });
}

for (const route of ['logout', 'callback']) {
  test(`${route}: actual handler validates redirects and preserves cookies`, async () => {
    let verified = 0;
    const { GET } = load(`app/api/auth/${route}/route.ts`, {
      '../util': util,
      jsonwebtoken: {
        verify(token, key, options) {
          assert.equal(token, 'synthetic-token');
          assert.equal(key, 'synthetic-key');
          assert.equal(options.algorithms.join(','), 'RS256');
          verified++;
        },
        decode: () => ({ uid: 'synthetic-user' }),
      },
      '@/app/lib/mongodb': { getDb: async () => ({ collection: () => ({ findOne: async () => ({ _id: 'synthetic-id' }) }) }) },
    });
    for (const destination of [...unsafe, ...safe]) {
      const url = new URL(`https://app.invalid/api/auth/${route}`);
      url.searchParams.set('token', 'synthetic-token');
      if (destination !== null) url.searchParams.set('next', destination);
      const response = await GET(new NextRequest(url));
      assert.equal(response.status, 307);
      assert.equal(response.headers.get('location'), new URL(safe.includes(destination) ? destination : '/', url.origin).href);
      const cookie = response.headers.get('set-cookie');
      assert.match(cookie, /^session=/);
      assert.match(cookie, /HttpOnly/);
      assert.match(cookie, /Secure/);
      assert.match(cookie, route === 'logout' ? /Max-Age=-1/ : /Max-Age=3600/);
    }
    if (route === 'callback') {
      assert.equal(verified, unsafe.length + safe.length);
      assert.equal((await GET(new NextRequest('https://app.invalid/api/auth/callback'))).status, 400);
    }
  });
}
