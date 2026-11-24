const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { act } = React;
const { JSDOM } = require('jsdom');

// Mounts the real Page and LoginForm in jsdom with a fake session; NavBar,
// Apollo and the breadcrumbs are replaced.
function transpile(relative, dependencies) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(path.join(__dirname, '..', relative), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(source, { exports, window: globalThis.window, require: name => dependencies[name] ?? require(name) });
  return exports;
}

const URL_OF_PAGE = 'https://olifogli.invalid/olimanager/olimat/olimat26/74';

async function mount(t, { status, session = null, requireApiScope = false }) {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: URL_OF_PAGE });
  const saved = new Map();
  for (const [key, value] of Object.entries({
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const { createRoot } = require('react-dom/client');
  const calls = [];
  const base = { react: React, 'react/jsx-runtime': require('react/jsx-runtime') };
  const nextAuth = {
    useSession: () => ({ data: session, status }),
    signIn: async (...args) => { calls.push(['signIn', ...args]); },
    signOut: async (...args) => { calls.push(['signOut', ...args]); },
  };
  const passThrough = ({ children }) => React.createElement(React.Fragment, null, children);
  const button = { __esModule: true, default: ({ children, variant, ...rest }) => React.createElement('button', rest, children) }; // eslint-disable-line no-unused-vars
  const loginForm = transpile('app/components/LoginForm.tsx', { ...base, 'next-auth/react': nextAuth, './Button': button });
  const { default: Page } = transpile('app/components/Page.tsx', {
    ...base, 'next-auth/react': nextAuth,
    '@/app/ApolloProviderClient': { __esModule: true, default: passThrough },
    '@/app/components/NavBar': { __esModule: true, default: () => React.createElement('nav') },
    '@/app/components/Loading': { __esModule: true, default: () => React.createElement('p', null, 'loading') },
    '@/app/components/BreadcrumbsProvider': { BreadcrumbsProvider: passThrough },
    '@/app/components/LoginForm': loginForm,
  });
  const root = createRoot(dom.window.document.getElementById('root'));
  await act(async () => {
    root.render(React.createElement(Page, { requireApiScope }, React.createElement('main', { id: 'content' }, 'contenuto')));
  });
  t.after(async () => {
    await act(async () => { root.unmount(); });
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  const document = dom.window.document;
  return {
    calls, document,
    content: () => document.getElementById('content'),
    text: () => document.querySelector('.page-content').textContent,
    click: label => act(async () => { [...document.querySelectorAll('button')].find(b => b.textContent === label).click(); }),
  };
}

const plain = value => JSON.parse(JSON.stringify(value));

test('with a session the page is shown', async t => {
  const page = await mount(t, { status: 'authenticated', session: { user: {}, olimanagerApiScope: false } });
  assert.ok(page.content());
});

test('while the session loads the page is not mounted yet', async t => {
  const page = await mount(t, { status: 'loading' });
  assert.equal(page.content(), null);
  assert.equal(page.text(), 'loading');
});

test('without a session the page is not mounted and the login brings back to it', async t => {
  const page = await mount(t, { status: 'unauthenticated' });
  assert.equal(page.content(), null);
  assert.match(page.text(), /Per vedere questa pagina devi fare login/);
  await page.click('LOGIN');
  assert.deepEqual(plain(page.calls), [['signIn', 'olimanager', { callbackUrl: URL_OF_PAGE }, { scope: 'openid email profile' }]]);
});

test('the login of a page can request the api scope too', async t => {
  const page = await mount(t, { status: 'unauthenticated', requireApiScope: true });
  await page.click('LOGIN CON INTERFACCIA OLI-SCI');
  assert.deepEqual(plain(page.calls), [['signIn', 'olimanager', { callbackUrl: URL_OF_PAGE }, { scope: 'openid email profile api' }]]);
});

for (const [olimanagerApiScope, message] of [[false, /login con interfaccia oli-sci/], [null, /login con interfaccia oli-sci/], [true, /sessione delle olimpiadi scientifiche è scaduta/]]) {
  test(`an Olimanager page that cannot read Olimanager (scope ${olimanagerApiScope}) asks to log in again, back to the page`, async t => {
    const page = await mount(t, { status: 'authenticated', session: { user: {}, olimanagerApiScope, olimanagerApiReady: false }, requireApiScope: true });
    assert.equal(page.content(), null);
    assert.match(page.text(), message);
    await page.click('Rientra con interfaccia oli-sci');
    assert.deepEqual(plain(page.calls), [
      ['signOut', { redirect: false }],
      ['signIn', 'olimanager', { callbackUrl: URL_OF_PAGE }, { scope: 'openid email profile api' }],
    ]);
  });
}

test('an Olimanager page with a valid api token is shown', async t => {
  const page = await mount(t, { status: 'authenticated', session: { user: {}, olimanagerApiScope: true, olimanagerApiReady: true }, requireApiScope: true });
  assert.ok(page.content());
});
