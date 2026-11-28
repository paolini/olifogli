const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

function render(props, { value = 'Testo **istruzioni**', isAdmin = false } = {}) {
  const exports = {};
  const code = ts.transpileModule(readFileSync('app/components/GlobalMessage.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const dependencies = {
    react: React,
    'react/jsx-runtime': require('react/jsx-runtime'),
    '../lib/logging': { logDiagnostic() {} },
    '@apollo/client': { gql: () => ({}), useQuery: () => ({ data: { getSetting: { value } }, loading: false }), useMutation: () => [async () => {}, {}] },
    'react-markdown': { __esModule: true, default: ({ children }) => React.createElement('p', {}, children) },
    '@uiw/react-md-editor': { __esModule: true, default: () => null },
    '@uiw/react-md-editor/markdown-editor.css': {},
    './Button': { __esModule: true, default: props => React.createElement('button', props) },
    './Error': { __esModule: true, default: () => null },
    '../lib/useProfile': { __esModule: true, default: () => ({ isAdmin }) },
  };
  vm.runInNewContext(code, { exports, require(id) {
    if (Object.hasOwn(dependencies, id)) return dependencies[id];
    throw new Error('Unexpected dependency: ' + id);
  } });
  return renderToStaticMarkup(React.createElement(exports.default, { name: 'instructions', ...props }));
}

test('collapsed block shows only a link with the title', () => {
  const html = render({ title: 'istruzioni', collapsed: true }, { isAdmin: true });
  assert.match(html, /<button[^>]*aria-expanded="false"[^>]*>.*▸.*istruzioni.*<\/button>/);
  assert.doesNotMatch(html, /Testo/);
  assert.doesNotMatch(html, /Modifica/);
});

test('expanded block shows the title, the message and, for admins, a text pencil', () => {
  const html = render({ title: 'istruzioni', collapsed: false });
  assert.match(html, /aria-expanded="true"[^>]*>.*▾.*istruzioni/);
  assert.match(html, /Testo \*\*istruzioni\*\*/);
  assert.doesNotMatch(html, /Modifica/);
  const admin = render({ title: 'istruzioni', collapsed: false }, { isAdmin: true });
  assert.match(admin, /title="Modifica messaggio"/);
  assert.match(admin, /✏︎/);
});

test('block without title has no link for users and a pencil for admins', () => {
  assert.doesNotMatch(render({}), /<button/);
  assert.match(render({}), /Testo/);
  const admin = render({}, { isAdmin: true });
  assert.match(admin, /title="Modifica messaggio"/);
  assert.doesNotMatch(admin, /aria-expanded/);
});

test('empty messages are hidden from users and shown to admins', () => {
  assert.equal(render({ title: 'istruzioni', collapsed: true }, { value: '' }), '');
  assert.match(render({ title: '⚙ not logged message', collapsed: false }, { value: '', isAdmin: true }), /title="Aggiungi messaggio"/);
});
