const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { act } = React;
const { JSDOM } = require('jsdom');

// Mounts the real UserMenu in jsdom; only next/link, next-auth and the icon are replaced.
async function mount(t, props) {
  const dom = new JSDOM('<!doctype html><button id="outside">fuori</button><div id="root"></div>', { url: 'https://menu.invalid' });
  const saved = new Map();
  for (const [key, value] of Object.entries({
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const { createRoot } = require('react-dom/client');
  const signOuts = [];
  const exports = {};
  const source = ts.transpileModule(readFileSync(path.join(__dirname, '../app/components/UserMenu.tsx'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const dependencies = {
    react: React, 'react/jsx-runtime': require('react/jsx-runtime'),
    'next/link': { __esModule: true, default: ({ href, children, ...rest }) => React.createElement('a', { href, ...rest }, children) },
    'next-auth/react': { signOut: options => { signOuts.push(options); return Promise.resolve(); } },
    'lucide-react': { ChevronDown: () => null },
  };
  vm.runInNewContext(source, { exports, document: dom.window.document, require: name => dependencies[name] ?? require(name) });
  const root = createRoot(dom.window.document.getElementById('root'));
  await act(async () => { root.render(React.createElement(exports.default, { email: 'docente@example.org', isAdmin: false, isSupervisor: false, ...props })); });
  t.after(async () => {
    await act(async () => { root.unmount(); });
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  const document = dom.window.document;
  const button = () => document.querySelector('button[aria-controls="user-menu"]');
  return {
    dom, document, button, signOuts,
    items: () => [...document.querySelectorAll('#user-menu a, #user-menu button')].map(item => item.textContent),
    toggle: () => act(async () => { button().click(); }),
    key: name => act(async () => { document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: name, bubbles: true })); }),
    pointerDown: target => act(async () => { target.dispatchEvent(new dom.window.Event('pointerdown', { bubbles: true })); }),
  };
}

test('the menu is closed until the email is pressed', async t => {
  const menu = await mount(t, { isAdmin: true });
  assert.equal(menu.button().textContent, 'docente@example.org');
  assert.equal(menu.button().getAttribute('aria-expanded'), 'false');
  assert.equal(menu.document.getElementById('user-menu'), null);
  await menu.toggle();
  assert.equal(menu.button().getAttribute('aria-expanded'), 'true');
  assert.deepEqual(menu.items(), ['utenti', 'file', 'logs', 'logout']);
  await menu.toggle();
  assert.equal(menu.document.getElementById('user-menu'), null);
});

test('supervisors see users and logout; other users only logout', async t => {
  const supervisor = await mount(t, { isSupervisor: true });
  await supervisor.toggle();
  assert.deepEqual(supervisor.items(), ['utenti', 'logout']);
});

test('a user without global roles sees only logout, which signs out to the home page', async t => {
  const menu = await mount(t, {});
  await menu.toggle();
  assert.deepEqual(menu.items(), ['logout']);
  await act(async () => { menu.document.querySelector('#user-menu button').click(); });
  // Back to the home page: the current page may need a login.
  assert.deepEqual(JSON.parse(JSON.stringify(menu.signOuts)), [{ callbackUrl: '/' }]);
  assert.equal(menu.document.getElementById('user-menu'), null);
});

test('Escape, an outside click and choosing a link close the menu', async t => {
  const menu = await mount(t, { isAdmin: true });
  await menu.toggle();
  await menu.key('Escape');
  assert.equal(menu.document.getElementById('user-menu'), null);
  assert.equal(menu.document.activeElement, menu.button());

  await menu.toggle();
  await menu.pointerDown(menu.document.querySelector('#user-menu a'));
  assert.ok(menu.document.getElementById('user-menu'), 'a click inside keeps the menu open');
  await menu.pointerDown(menu.document.getElementById('outside'));
  assert.equal(menu.document.getElementById('user-menu'), null);

  await menu.toggle();
  const logs = [...menu.document.querySelectorAll('#user-menu a')].find(link => link.textContent === 'logs');
  assert.equal(logs.getAttribute('href'), '/logs');
  // jsdom cannot navigate; Next.js handles the real navigation.
  menu.document.addEventListener('click', event => event.preventDefault());
  await act(async () => { logs.dispatchEvent(new menu.dom.window.MouseEvent('click', { bubbles: true, cancelable: true })); });
  assert.equal(menu.document.getElementById('user-menu'), null);
});
