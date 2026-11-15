const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const React = require('react');
const { act } = React;
const { renderToString } = require('react-dom/server');
const { JSDOM } = require('jsdom');

async function fixture(t, initial, { profile = null, sheet: sheetFields = {} } = {}) {
  const dom = new JSDOM('<div id="root"></div>');
  const previous = new Map();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const { createRoot } = require('react-dom/client');
  const root = createRoot(document.getElementById('root'));
  t.after(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  let cursorData = initial, tableProps, cursorSubscription;
  const diagnostics = [], subscriptions = [];
  const sheet = { _id: 'sheet', name: 'Test', schema: 'test', workbook: { _id: 'workbook' }, ...sheetFields };
  const sheetData = { sheet };
  const rowsData = { rows: [] };
  const breadcrumbs = { setBreadcrumbs() {} };
  const params = new URLSearchParams('tab=table');
  const subscribeToMore = options => { subscriptions.push(options); return () => {}; };
  const exports = {};
  const source = ts.transpileModule(readFileSync(path.resolve(__dirname, '../app/components/Sheet.tsx'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(source, { exports, require(name) {
    if (name === 'react' || name === 'react/jsx-runtime') return require(name);
    if (name === '@apollo/client') return {
      gql: strings => strings.join(''),
      useQuery(query, options) {
        if (!query.includes('GetActiveCursors')) return { data: rowsData, subscribeToMore };
        // Model completion arriving during render, as in the reported stack.
        const notified = React.useRef();
        if (cursorData && notified.current !== cursorData) {
          notified.current = cursorData;
          options.onCompleted?.(cursorData);
        }
        return { data: cursorData };
      },
      useSubscription(query, options) {
        subscriptions.push(options);
        if (query.includes('OnCursorChanged')) cursorSubscription = options;
      },
    };
    if (name === 'next/navigation') return { useRouter: () => ({}), useSearchParams: () => params };
    if (name.endsWith('/generated')) return { useGetSheetQuery: () => ({ data: sheetData }) };
    if (name.endsWith('/useProfile')) return { default: () => profile };
    if (name.endsWith('/BreadcrumbsProvider')) return { useBreadcrumbs: () => breadcrumbs };
    if (name.endsWith('/schema')) return { schemas: { test: { has_scan_functionality: () => false } } };
    if (name.endsWith('/tabId')) return { getTabId: () => 'self' };
    if (name.endsWith('/logging')) return { logDiagnostic: (event, error) => diagnostics.push({ event, error }) };
    if (name === './Table') return { default: props => { tableProps = props; return null; } };
    return { default: () => null };
  } });
  const element = React.createElement(exports.default, { sheetId: 'sheet' });
  async function render() { await act(async () => root.render(element)); }
  return {
    diagnostics, subscriptions,
    table: () => tableProps,
    serverRender() { renderToString(element); },
    render,
    async load(data) {
      cursorData = data;
      await act(async () => root.render(React.createElement(exports.default, { sheetId: 'sheet' })));
    },
    async cursor(cursor) { await act(async () => cursorSubscription.onData({ data: { data: { cursorChanged: cursor } } })); },
  };
}

const cursor = (tabId, lineKey, fieldName = 'name') => ({ tabId, email: `${tabId}@example.org`, lineKey, fieldName });
const value = ({ tabId, ...rest }) => rest;

test('all sheet subscriptions handle failures explicitly', async t => {
  const f = await fixture(t);
  await f.render();
  const error = new Error('socket unavailable');
  for (const subscription of f.subscriptions) {
    assert.equal(typeof subscription.onError, 'function');
    subscription.onError(error);
  }
  assert.deepEqual(new Set(f.diagnostics.map(entry => entry.event)), new Set([
    'app/components/Sheet.cursorchanged_subscription_error',
    'app/components/Sheet.rowchanged_subscription_error',
    'app/components/Sheet.rowsdeleted_subscription_error',
    'app/components/Sheet.sheetupdated_subscription_error',
  ]));
  assert.ok(f.diagnostics.every(entry => entry.error === error));
});

test('cached cursors are initialized after mount and exclude this tab and inactive cursors', async t => {
  const other = cursor('other', 'row1');
  const f = await fixture(t, { cursors: [cursor('self', 'row1'), other, cursor('inactive', null, null)] });
  f.serverRender();
  assert.deepEqual(Object.keys(f.table().otherCursors), []);
  await f.render();
  assert.deepEqual(JSON.parse(JSON.stringify(f.table().otherCursors)), { other: value(other) });
});

test('delayed initial cursors preserve newer subscription updates and subsequent removals', async t => {
  const f = await fixture(t);
  await f.render();
  const latest = cursor('other', 'row2');
  await f.cursor(latest);
  await f.load({ cursors: [cursor('other', 'row1'), cursor('another', 'row3')] });
  assert.deepEqual(JSON.parse(JSON.stringify(f.table().otherCursors)), { other: value(latest), another: value(cursor('another', 'row3')) });
  await f.cursor(cursor('self', 'row4'));
  assert.equal(f.table().otherCursors.self, undefined);
  await f.cursor(cursor('other', null, null));
  assert.deepEqual(Object.keys(f.table().otherCursors), ['another']);
});

for (const [state, editable] of [['open', true], ['closed', false], ['locked', false]]) {
  test(`regression #59: an editor's data table is ${editable ? 'editable' : 'read-only'} on a ${state} sheet`, async t => {
    const f = await fixture(t, undefined, {
      profile: { email: 'editor@example.org' },
      sheet: { permissions: [{ email: 'editor@example.org', role: 'editor' }], ...(state === 'open' ? {} : { [state]: true }) },
    });
    await f.render();
    assert.equal(f.table().edit, editable);
  });
}
