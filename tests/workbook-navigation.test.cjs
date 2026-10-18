const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { act } = React;
const { JSDOM } = require('jsdom');

async function fixture(t, query = '') {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/workbook/test' });
  const previous = new Map();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const { createRoot } = require('react-dom/client');
  const pathname = '/workbook/test';
  let params = new URLSearchParams(query), pending, controls;
  const replacements = [];
  const router = { replace(url) { replacements.push(url); pending = url; } };
  const breadcrumbs = { setBreadcrumbs() {} };
  const data = { workbook: { name: 'Test' }, me: { isAdmin: true }, sheets: [] };
  const modules = new Map();
  function load(file) {
    if (modules.has(file)) return modules.get(file);
    const exports = {};
    modules.set(file, exports);
    const source = ts.transpileModule(readFileSync(path.join(__dirname, '..', file), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    vm.runInNewContext(source, { exports, URLSearchParams, require(name) {
      if (name === 'react' || name === 'react/jsx-runtime') return require(name);
      if (name === 'next/navigation') return { useRouter: () => router, useSearchParams: () => params, usePathname: () => pathname };
      if (name === '@apollo/client') return { gql: () => ({}) };
      if (name === '../graphql/generated') return { useGetWorkbookQuery: () => ({ data }) };
      if (name.endsWith('/BreadcrumbsProvider')) return { useBreadcrumbs: () => breadcrumbs };
      if (name.includes('Workbook')) return { default: function Tab() {
        controls = load('app/components/SheetsFilterQuery.ts').useSheetsFilterWithQuerystring();
        return React.createElement('div', { 'data-tab': name });
      } };
      if (name.endsWith('/Error') || name.endsWith('/Loading')) return { default: () => null };
      throw new Error(`Unexpected import: ${name}`);
    } });
    return exports;
  }
  const Workbook = load('app/components/Workbook.tsx').default;
  const container = document.getElementById('root');
  let root = createRoot(container);
  async function render() { await act(async () => root.render(React.createElement(Workbook, { workbookId: 'test' }))); }
  async function flush() {
    let count = 0;
    while (pending !== undefined) {
      if (++count > 10) throw new Error('URL synchronization loop');
      params = new URL(pending, dom.window.location.origin).searchParams;
      pending = undefined;
      await render();
    }
  }
  await render();
  t.after(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  return {
    replacements,
    params: () => params,
    active: () => container.querySelector('.tab-button-active')?.textContent.trim(),
    async click(label) {
      const button = [...container.querySelectorAll('button')].find(button => button.textContent.trim() === label);
      assert.ok(button, label);
      await act(async () => button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })));
      await flush();
    },
    async reload() {
      await act(async () => root.unmount());
      root = createRoot(container);
      await render();
      await flush();
    },
    async navigate(query) { params = new URLSearchParams(query); await render(); await flush(); },
    async change(run) { await act(async () => run(controls)); await flush(); },
    controls: () => controls,
  };
}

test('selecting age and class year updates the URL and survives reload without filter mount overwriting it', async t => {
  const f = await fixture(t, 'distrettoFilter=Pisa&statoFilter=locked');
  assert.equal(f.replacements.length, 0);
  await f.click('Età e anno di corso');
  assert.equal(f.params().get('tab'), 'età');
  assert.equal(f.params().get('distrettoFilter'), 'Pisa');
  assert.equal(f.params().get('statoFilter'), 'locked');
  assert.equal(f.active(), 'Età e anno di corso');
  await f.reload();
  assert.equal(f.active(), 'Età e anno di corso');
  assert.equal(f.params().get('tab'), 'età');
});

test('filters, column filters and sorting preserve the selected tab and reset correctly from URL navigation', async t => {
  const f = await fixture(t, 'tab=et%C3%A0&schemaFilter=archimede_biennio');
  assert.equal(f.replacements.length, 0);
  await f.change(({ filterState }) => filterState.setDistrettoFilter('Pisa'));
  await f.change(({ filterState }) => filterState.setStatoFilter('locked'));
  await f.change(({ setColumnFilters }) => setColumnFilters(previous => ({ ...previous, name: 'Test' })));
  await f.change(({ setSort }) => setSort(() => ({ field: 'name', direction: -1 })));
  assert.equal(f.params().get('tab'), 'età');
  assert.equal(f.params().get('schemaFilter'), 'archimede_biennio');
  assert.equal(f.params().get('columnFilter_name'), 'Test');
  assert.equal(f.params().get('sortDirection'), '-1');
  await f.change(({ filterState }) => filterState.setDistrettoFilter(''));
  assert.equal(f.params().has('distrettoFilter'), false);
  await f.navigate('tab=esercizi');
  assert.equal(f.active(), 'Distribuzione Quesiti');
  assert.equal(f.controls().filterState.statoFilter, '');
  assert.equal(f.controls().sort, null);
  assert.equal(Object.keys(f.controls().columnFilters).length, 0);
  await f.click('Fogli');
  assert.equal(f.params().has('tab'), false);
  await f.reload();
  assert.equal(f.active(), 'Fogli');
});
