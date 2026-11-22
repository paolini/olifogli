const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const React = require('react');
const { act } = React;
const { JSDOM } = require('jsdom');

// Mounts the real Splash with the given session; its children are replaced.
async function mountSplash(t, session) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost:3000/' });
  const previous = new Map();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document,
    navigator: dom.window.navigator, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const { createRoot } = require('react-dom/client');
  const container = document.getElementById('root'), root = createRoot(container);
  t.after(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  const calls = [];
  const transpile = (file, dependency) => {
    const exports = {};
    const source = ts.transpileModule(readFileSync(path.resolve(__dirname, '../app/components', file), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    vm.runInNewContext(source, { exports, require(id) {
      if (['react', 'react/jsx-runtime'].includes(id)) return require(id);
      const found = dependency(id);
      if (found) return found;
      throw new Error('Unexpected dependency: ' + id);
    } });
    return exports;
  };
  const nextAuth = { useSession: () => ({ data: session }), signIn: (...args) => calls.push(args) };
  const button = { default: props => React.createElement('button', props) };
  // The real login form, used by the home page.
  const loginForm = transpile('LoginForm.tsx', id => ({ 'next-auth/react': nextAuth, './Button': button })[id]);
  const exports = transpile('Splash.tsx', id => ({
    'next-auth/react': nextAuth,
    '../lib/useProfile': { default: () => null },
    './ConfigProvider': { useConfig: () => ({ olimanagerUrl: 'https://staging.example.invalid' }) },
    './Button': button,
    './GlobalMessage': { default: () => null },
    './Workbooks': { default: () => null },
    './LoginForm': loginForm,
    './OlimanagerOlympiads': { OlimanagerOlympiads: ({ ready, expired }) => React.createElement('section', { id: 'olimanager', 'data-ready': ready, 'data-expired': expired }) },
  })[id]);
  await act(async () => root.render(React.createElement(exports.default)));
  return { container, calls };
}

test('LOGIN asks only for the identity, LOGIN + OLIMANAGER for the api scope too', async (t) => {
  const { container, calls } = await mountSplash(t, null);
  assert.equal(container.querySelector('input[type="checkbox"]'), null);
  const button = label => [...container.querySelectorAll('button')].find(b => b.textContent === label);
  await act(async () => button('LOGIN').click());
  assert.equal(calls.at(-1)[0], 'olimanager');
  assert.equal(calls.at(-1)[1], undefined); // the home page needs no way back
  assert.equal(calls.at(-1)[2].scope, 'openid email profile');
  await act(async () => button('LOGIN + OLIMANAGER').click());
  assert.equal(calls.at(-1)[1], undefined);
  assert.equal(calls.at(-1)[2].scope, 'openid email profile api');
  assert.match(container.textContent, /garantisce l’accesso alle funzionalità Olimanager/);
});

// The section is always there for logged in users: the olympiads when
// Olimanager can be read, otherwise how to log in (see OlimanagerOlympiads).
for (const [olimanagerApiScope, olimanagerApiReady, ready, expired] of [
  [true, true, 'true', 'true'], [true, false, 'false', 'true'], [false, false, 'false', 'false'], [null, undefined, 'false', 'false'],
]) {
  test(`the home page passes the Olimanager state to its section (scope ${olimanagerApiScope}, ready ${olimanagerApiReady})`, async (t) => {
    const { container } = await mountSplash(t, { user: { name: 'Docente', email: 'docente@example.org' }, olimanagerApiScope, olimanagerApiReady });
    const section = container.querySelector('#olimanager');
    assert.equal(section.dataset.ready, ready);
    assert.equal(section.dataset.expired, expired);
  });
}
