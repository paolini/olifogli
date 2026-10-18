const { existsSync, readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { act } = React;
const { JSDOM } = require('jsdom');
const { ObjectId } = require('mongodb');

const compiled = new Map();

// Mount the real table/cells. Only network hooks and unrelated toolbar/header UI
// are replaced; React state, effects, DOM focus and event bubbling are real.
async function mountTable(t, { edit = true } = {}) {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://table.invalid' });
  const saved = new Map();
  for (const [key, value] of Object.entries({
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, HTMLInputElement: dom.window.HTMLInputElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  // React DOM must see a document when it initializes its input event support.
  const { createRoot } = require('react-dom/client');
  const cache = new Map();
  const timers = [];
  const patches = [];
  const context = { contest_year: 2026, absent: () => false };
  let schema;
  const rows = [0, 1].map(index => ({
    _id: new ObjectId(), data: { name: `Name${index}`, surname: `Surname${index}`, birthDate: '12/05/2012', r01: 'A', r02: 'B', score: '10' },
    updatedOn: new Date('2026-01-01'), createdOn: new Date('2026-01-01'), error: '', anomalies: 0,
  }));
  const response = { loading: false, reset() {} };
  const mutations = {
    usePatchRowMutation: () => [async ({ variables }) => {
      patches.push(variables);
      const row = rows.find(row => row._id.equals(variables._id));
      return { data: { patchRow: { ...row, data: { ...row.data, ...variables.data } } } };
    }, response],
    useAddRowMutation: () => [async () => { throw new Error('Unexpected row creation'); }, response],
    useDeleteRowMutation: () => [async () => { throw new Error('Unexpected row deletion'); }, response],
  };
  const hidden = { __esModule: true, default: () => null };
  function load(relative) {
    if (cache.has(relative)) return cache.get(relative);
    if (!compiled.has(relative)) compiled.set(relative, ts.transpileModule(readFileSync(path.resolve(__dirname, '../..', relative), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText);
    const exports = {};
    cache.set(relative, exports);
    vm.runInNewContext(compiled.get(relative), {
      exports, console, document: dom.window.document, HTMLInputElement: dom.window.HTMLInputElement,
      // Run scheduled cursor/advance actions explicitly, after the React update.
      setTimeout(fn) { timers.push(fn); return timers.length; }, clearTimeout() {},
      // Autosave intervals are outside these interaction tests.
      setInterval() { return 0; }, clearInterval() {},
      alert() { throw new Error('Unexpected alert'); },
      require(id) {
        if (id === '@/app/graphql/generated') return mutations;
        if (id === '../lib/schema') return { schemas: { test: schema } };
        if (id === '@/app/components/Ordering') return {};
        if (id === '../lib/logging') return { logDiagnostic() {} };
        if (id === '../lib/useProfile') return { __esModule: true, default: () => ({ isAdmin: true }) };
        if (id === './Error' || id === './TableActions' || id === './TableHeader') return hidden;
        if (id === './Button') return { __esModule: true, default: props => React.createElement('button', props) };
        if (id === '../lib/util') return { pluralize: (count, one, many) => `${count} ${count === 1 ? one : many}` };
        if (id === '@apollo/client') return { gql: () => ({}), useMutation: () => [async () => ({})] };
        if (['react', 'react/jsx-runtime'].includes(id)) return require(id);
        if (id.startsWith('.')) {
          const base = path.posix.normalize(path.posix.join(path.posix.dirname(relative), id));
          const resolved = ['.ts', '.tsx'].map(extension => base + extension)
            .find(file => existsSync(path.resolve(__dirname, '../..', file)));
          if (resolved) return load(resolved);
        }
        throw new Error(`Unexpected dependency: ${id}`);
      },
    }, { filename: relative });
    return exports;
  }
  const { Field, DateField, ChoiceAnswerField } = load('app/lib/schema/fields.ts');
  schema = {
    fields: [new Field('name'), new Field('surname'), new DateField('birthDate', {}),
      new ChoiceAnswerField('r01', {}), new Field('hidden', { hidden: true }),
      new Field('score', { editable: false }), new ChoiceAnswerField('r02', {})],
    displayValidationContext: () => context,
  };
  const Table = load('app/components/Table.tsx').default;
  const container = dom.window.document.getElementById('root');
  const root = createRoot(container);
  t.after(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  await act(async () => root.render(React.createElement(Table, {
    edit, rows, sheet: { _id: new ObjectId(), schema: 'test', workbook: { commonData: {} } },
    csvDownload() {}, setCsvImport() {}, adminEditMode: false,
  })));

  function cell(field, row = 0) { return container.querySelectorAll('tbody > tr')[row].querySelector(`td.field-${field}`); }
  async function click(target) { await act(async () => target.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))); }
  async function key(key, options = {}) {
    const event = new dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options });
    await act(async () => dom.window.document.activeElement.dispatchEvent(event));
    return event;
  }
  async function change(value) {
    const target = dom.window.document.activeElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(target, value);
      target.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });
  }
  async function flushTimers() {
    let count = 0;
    while (timers.length) {
      if (++count > 20) throw new Error('Unexpected timer loop');
      const pending = timers.splice(0);
      await act(async () => { for (const run of pending) run(); });
    }
  }
  return { cell, click, key, change, flushTimers, patches,
    active: () => dom.window.document.activeElement,
    input: () => container.querySelector('td.focus input'),
    focusCell: () => container.querySelector('td.focus'),
  };
}

module.exports = { mountTable };
