const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const React = require('react');
const { act } = React;
const { JSDOM } = require('jsdom');

test('login requests api scope only when the user selects the checkbox', async (t) => {
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
  const calls = [], exports = {};
  const source = ts.transpileModule(readFileSync(path.resolve(__dirname, '../app/components/Splash.tsx'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(source, { exports, require(id) {
    if (['react', 'react/jsx-runtime'].includes(id)) return require(id);
    if (id === 'next-auth/react') return { useSession: () => ({ data: null }), signIn: (...args) => calls.push(args) };
    if (id === '../lib/useProfile') return { default: () => null };
    if (id === './ConfigProvider') return { useConfig: () => ({ olimanagerUrl: 'https://staging.example.invalid' }) };
    if (id === './Button') return { default: props => React.createElement('button', props) };
    if (id === './GlobalMessage' || id === './Workbooks') return { default: () => null };
    throw new Error('Unexpected dependency: ' + id);
  } });
  await act(async () => root.render(React.createElement(exports.default)));
  const checkbox = container.querySelector('input[type="checkbox"]'), login = container.querySelector('button');
  assert.equal(checkbox.checked, false);
  await act(async () => login.click());
  assert.equal(calls.at(-1)[0], 'olimanager');
  assert.equal(calls.at(-1)[2].scope, 'openid email profile');
  await act(async () => checkbox.click());
  await act(async () => login.click());
  assert.equal(calls.at(-1)[2].scope, 'openid email profile api');
  await act(async () => checkbox.click());
  await act(async () => login.click());
  assert.equal(calls.at(-1)[2].scope, 'openid email profile');
});
