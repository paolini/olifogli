const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { act } = React;
const { JSDOM } = require('jsdom');

// Mounts the real OlimanagerAddressBook in jsdom. GraphQL hooks, router, profile
// and the two views are replaced; the breadcrumbs provider is the real one.
function transpile(relative, dependencies, globals = {}) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(path.join(__dirname, '..', relative), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(source, { exports, Intl, ...globals, require: name => dependencies[name] ?? require(name) });
  return exports;
}

const choices = [{ id: 'olimat', name: 'Olimpiadi della Matematica', editions: [
  { id: 'olimat26', name: 'Olimpiadi della Matematica 2026', year: 2026, contests: [] },
  { id: 'olimat27', name: 'Olimpiadi della Matematica 2027', year: 2027, contests: [] },
] }];
const district = (id, name) => ({ id, name, coordinators: [], admins: [], schools: [], sheets: [], warnings: [] });

async function mount(t, { url, saved = null, districts = [district(3, 'Pisa'), district(4, 'Roma')] }) {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://rubrica.invalid' + url });
  const saved_ = new Map();
  for (const [key, value] of Object.entries({
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    saved_.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const { createRoot } = require('react-dom/client');
  const base = { react: React, 'react/jsx-runtime': require('react/jsx-runtime') };
  const calls = { replace: [], push: [], load: [], breadcrumbs: [] };
  let params = new URL(dom.window.location.href).searchParams;
  let rerender = () => {};
  const router = {
    replace: href => { calls.replace.push(href); params = new URL(href, 'https://rubrica.invalid').searchParams; rerender(); },
    push: href => { calls.push.push(href); params = new URL(href, 'https://rubrica.invalid').searchParams; rerender(); },
  };
  const loadState = { called: false, loading: false, data: undefined, error: undefined };
  const load = ({ variables }) => {
    calls.load.push(variables);
    loadState.data = { olimanagerAddressBook: { districts, warnings: [] } };
    rerender();
    return Promise.resolve();
  };
  const crumbs = transpile('app/components/BreadcrumbsProvider.tsx', base);
  const stubView = name => ({ __esModule: true, default: props => React.createElement('div', { 'data-view': name }, props.district?.name ?? props.districts?.map(d => d.name).join(',')) });
  const { default: AddressBook } = transpile('app/components/OlimanagerAddressBook.tsx', {
    ...base,
    '@apollo/client': { gql: () => null },
    'next/link': { __esModule: true, default: ({ href, children, ...rest }) => React.createElement('a', { href, ...rest }, children) },
    'next/navigation': { useRouter: () => router, useSearchParams: () => params },
    '../graphql/generated': {
      useOlimanagerVenueSheetChoicesQuery: () => ({ loading: false, data: { olimanagerVenueSheetChoices: choices } }),
      useOlimanagerAddressBookSelectionQuery: () => ({ loading: false, data: { olimanagerAddressBookSelection: saved } }),
      useOlimanagerAddressBookLazyQuery: () => [load, loadState],
    },
    '../lib/addressBookEntries': transpile('app/lib/addressBookEntries.ts', {}),
    '../lib/useProfile': { __esModule: true, default: () => ({ isAdmin: true, isSupervisor: false }) },
    './Button': { __esModule: true, default: ({ children, variant, ...rest }) => React.createElement('button', rest, children) }, // eslint-disable-line no-unused-vars
    './Error': { __esModule: true, default: ({ error }) => error ? React.createElement('p', { role: 'alert' }, String(error)) : null },
    './Loading': { __esModule: true, default: () => React.createElement('p', null, 'loading') },
    './AddressBookDistrict': stubView('district'),
    './AddressBookDistricts': stubView('districts'),
    './AddressBookParts': { Warnings: () => null },
    './BreadcrumbsProvider': crumbs,
  });
  // Records every breadcrumbs change, as the NavBar would show it.
  function Probe() {
    const { breadcrumbs } = crumbs.useBreadcrumbs();
    calls.breadcrumbs.push(breadcrumbs);
    return null;
  }
  const root = createRoot(dom.window.document.getElementById('root'));
  const tree = () => React.createElement(crumbs.BreadcrumbsProvider, null, React.createElement(Probe), React.createElement(AddressBook));
  rerender = () => root.render(tree());
  await act(async () => { root.render(tree()); });
  t.after(async () => {
    await act(async () => { root.unmount(); });
    for (const [key, descriptor] of saved_) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  const document = dom.window.document;
  return {
    calls, document,
    view: () => document.querySelector('[data-view]'),
    lastCrumbs: () => JSON.parse(JSON.stringify(calls.breadcrumbs.at(-1))),
  };
}

test('without an edition in the URL the page goes to the saved one and loads it', async t => {
  const page = await mount(t, { url: '/rubrica', saved: { olympiadId: 'olimat', editionId: 'olimat26' } });
  assert.deepEqual(page.calls.replace, ['/rubrica?edizione=olimat26']);
  assert.deepEqual(JSON.parse(JSON.stringify(page.calls.load)), [{ olympiadId: 'olimat', editionId: 'olimat26' }]);
  assert.equal(page.view().dataset.view, 'districts');
  assert.deepEqual(page.lastCrumbs(), [{ label: 'Rubrica', href: '/rubrica?scegli', title: 'Cambia edizione' }, { label: '2026' }]);
  // The breadcrumbs settle: no update loop.
  assert.ok(page.calls.breadcrumbs.length < 10, `breadcrumbs updated ${page.calls.breadcrumbs.length} times`);
});

test('without edition in the URL nor saved selection the selects are shown', async t => {
  const page = await mount(t, { url: '/rubrica' });
  assert.deepEqual(page.calls.replace, []);
  assert.deepEqual(page.calls.load, []);
  assert.equal(page.view(), null);
  assert.equal(page.document.querySelectorAll('select').length, 2);
  assert.deepEqual([...page.document.querySelectorAll('select')[1].options].map(o => o.textContent), ['Seleziona edizione']);
  assert.deepEqual(page.lastCrumbs(), [{ label: 'Rubrica' }]);
});

test('the edition of the URL wins over the saved one; the district goes in the breadcrumbs', async t => {
  const page = await mount(t, { url: '/rubrica?edizione=olimat27&distretto=4', saved: { olympiadId: 'olimat', editionId: 'olimat26' } });
  assert.deepEqual(page.calls.replace, []);
  assert.deepEqual(JSON.parse(JSON.stringify(page.calls.load)), [{ olympiadId: 'olimat', editionId: 'olimat27' }]);
  assert.equal(page.view().dataset.view, 'district');
  assert.equal(page.view().textContent, 'Roma');
  assert.deepEqual(page.lastCrumbs(), [{ label: 'Rubrica', href: '/rubrica?scegli', title: 'Cambia edizione' }, { label: '2027', href: '/rubrica?edizione=olimat27' }, { label: 'Roma' }]);
  assert.ok(page.calls.breadcrumbs.length < 10, `breadcrumbs updated ${page.calls.breadcrumbs.length} times`);
});

test('a user with one district enters it directly, without the district in the breadcrumbs', async t => {
  const page = await mount(t, { url: '/rubrica?edizione=olimat26', districts: [district(3, 'Pisa')] });
  assert.equal(page.view().dataset.view, 'district');
  assert.deepEqual(page.lastCrumbs(), [{ label: 'Rubrica', href: '/rubrica?scegli', title: 'Cambia edizione' }, { label: '2026' }]);
});

test('an unknown edition in the URL shows an error and the selects', async t => {
  const page = await mount(t, { url: '/rubrica?edizione=nope' });
  assert.deepEqual(page.calls.load, []);
  assert.match(page.document.querySelector('[role="alert"]').textContent, /Edizione non trovata/);
  assert.equal(page.document.querySelectorAll('select').length, 2);
});

test('«Rubrica» in the breadcrumbs opens the choice of the edition, starting from the saved one', async t => {
  const page = await mount(t, { url: '/rubrica?scegli', saved: { olympiadId: 'olimat', editionId: 'olimat26' } });
  assert.deepEqual(page.calls.replace, []);
  assert.deepEqual(page.calls.load, []);
  assert.equal(page.view(), null);
  const [olympiad, edition] = page.document.querySelectorAll('select');
  assert.equal(olympiad.value, 'olimat');
  assert.equal(edition.value, 'olimat26');
  assert.deepEqual([...edition.options].map(o => o.textContent), ['Seleziona edizione', '2026', '2027']);
  const cancel = [...page.document.querySelectorAll('a')].find(a => a.textContent === 'Annulla');
  assert.equal(cancel.getAttribute('href'), '/rubrica?edizione=olimat26');
  assert.deepEqual(page.lastCrumbs(), [{ label: 'Rubrica' }]);
  await act(async () => { [...page.document.querySelectorAll('button')].find(b => b.textContent === 'Carica rubrica').click(); });
  assert.deepEqual(page.calls.push, ['/rubrica?edizione=olimat26']);
  assert.deepEqual(JSON.parse(JSON.stringify(page.calls.load)), [{ olympiadId: 'olimat', editionId: 'olimat26' }]);
});
