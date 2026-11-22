const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { act } = React;
const { JSDOM } = require('jsdom');

// Mounts the real Olimanager pages in jsdom: home section, editions and
// address book. GraphQL hooks, profile and the two address book views are
// replaced; the breadcrumbs provider is the real one.
function transpile(relative, dependencies, globals = {}) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(path.join(__dirname, '..', relative), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(source, { exports, Intl, ...globals, require: name => dependencies[name] ?? require(name) });
  return exports;
}

const olympiads = [{ id: 'olimat', name: 'Olimpiadi della Matematica', editions: [
  { id: 'olimat26', name: 'Olimpiadi della Matematica 2026', year: 2026 },
  { id: 'olimat27', name: 'Olimpiadi della Matematica 2027', year: 2027 },
] }];
const district = (id, name) => ({ id, name, coordinators: [], admins: [], schools: [], sheets: [], warnings: [] });

async function mount(t, render, { districts = [district(3, 'Pisa'), district(4, 'Roma')], addressBookError, olympiadsError, profile = { isAdmin: true, isSupervisor: false } } = {}) {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://olifogli.invalid/' });
  const saved = new Map();
  for (const [key, value] of Object.entries({
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const { createRoot } = require('react-dom/client');
  const base = { react: React, 'react/jsx-runtime': require('react/jsx-runtime') };
  const calls = { addressBook: [], olympiads: [], breadcrumbs: [] };
  const crumbs = transpile('app/components/BreadcrumbsProvider.tsx', base);
  const shared = {
    ...base,
    '@apollo/client': { gql: () => null },
    'next/link': { __esModule: true, default: ({ href, children, ...rest }) => React.createElement('a', { href, ...rest }, children) },
    '../graphql/generated': {
      useOlimanagerOlympiadsQuery: (options = {}) => {
        calls.olympiads.push(options);
        if (options.skip) return { loading: false };
        return olympiadsError ? { loading: false, error: olympiadsError } : { loading: false, data: { olimanagerOlympiads: olympiads } };
      },
      useOlimanagerAddressBookQuery: options => {
        calls.addressBook.push(options);
        if (options.skip) return { loading: false };
        return addressBookError ? { loading: false, error: addressBookError } : { loading: false, data: { olimanagerAddressBook: { districts, warnings: [] } } };
      },
    },
    './Error': { __esModule: true, default: ({ error }) => error ? React.createElement('p', { role: 'alert' }, String(error.message || error)) : null },
    './Loading': { __esModule: true, default: () => React.createElement('p', null, 'loading') },
    './BreadcrumbsProvider': crumbs,
    './LoginForm': transpile('app/components/LoginForm.tsx', {
      ...base, './Button': { __esModule: true, default: ({ children, variant, ...rest }) => React.createElement('button', rest, children) }, // eslint-disable-line no-unused-vars
      'next-auth/react': { signIn: async () => {}, signOut: async () => {} },
    }),
    '../lib/useProfile': { __esModule: true, default: () => profile },
  };
  const olympiadsModule = transpile('app/components/OlimanagerOlympiads.tsx', shared);
  const stubView = name => ({ __esModule: true, default: props => React.createElement('div', { 'data-view': name, 'data-href': props.districtHref?.(district(9, 'X')) }, props.district?.name ?? props.districts?.map(d => d.name).join(',')) });
  const { default: AddressBook } = transpile('app/components/OlimanagerAddressBook.tsx', {
    ...shared,
    '../lib/addressBookEntries': transpile('app/lib/addressBookEntries.ts', {}),
    './AddressBookDistrict': stubView('district'),
    './AddressBookDistricts': stubView('districts'),
    './AddressBookParts': { Warnings: () => null },
    './OlimanagerOlympiads': olympiadsModule,
  });
  // Records every breadcrumbs change, as the NavBar would show it.
  function Probe() {
    const { breadcrumbs } = crumbs.useBreadcrumbs();
    calls.breadcrumbs.push(breadcrumbs);
    return null;
  }
  const root = createRoot(dom.window.document.getElementById('root'));
  await act(async () => {
    root.render(React.createElement(crumbs.BreadcrumbsProvider, null, React.createElement(Probe), render({ AddressBook, ...olympiadsModule })));
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
    view: () => document.querySelector('[data-view]'),
    links: () => [...document.querySelectorAll('a')].map(a => [a.textContent, a.getAttribute('href')]),
    lastCrumbs: () => JSON.parse(JSON.stringify(calls.breadcrumbs.at(-1))),
  };
}

const olimat = { label: 'olimat', href: '/olimanager/olimat', title: 'Olimpiadi della Matematica' };

test('the home section lists the olympiads, linked to their editions', async t => {
  const page = await mount(t, ({ OlimanagerOlympiads }) => React.createElement(OlimanagerOlympiads, { ready: true, expired: false }));
  assert.equal(page.document.querySelector('h1').textContent, 'Olimanager');
  assert.deepEqual(page.links(), [['Olimpiadi della Matematica', '/olimanager/olimat']]);
});

test('the home section shows Olimanager errors inside the section', async t => {
  const page = await mount(t, ({ OlimanagerOlympiads }) => React.createElement(OlimanagerOlympiads, { ready: true, expired: false }), { olympiadsError: new Error('non raggiungibile') });
  assert.equal(page.document.querySelector('h1').textContent, 'Olimanager');
  assert.equal(page.document.querySelector('[role="alert"]').textContent, 'non raggiungibile');
});

for (const [expired, message] of [[false, /abilitando i trasferimenti/], [true, /sessione Olimanager è scaduta/]]) {
  test(`without a usable Olimanager token the home section asks to log in (expired ${expired}), without querying`, async t => {
    const page = await mount(t, ({ OlimanagerOlympiads }) => React.createElement(OlimanagerOlympiads, { ready: false, expired }));
    assert.equal(page.document.querySelector('h1').textContent, 'Olimanager');
    assert.match(page.document.querySelector('p').textContent, message);
    assert.ok([...page.document.querySelectorAll('button')].some(b => b.textContent === 'Rientra con lo scope api'));
    assert.equal(page.document.querySelector('table'), null);
    assert.deepEqual(page.calls.olympiads, []);
  });
}

test('the editions page lists the editions by school year, latest first, with the olympiad in the breadcrumbs', async t => {
  const page = await mount(t, ({ OlimanagerEditions }) => React.createElement(OlimanagerEditions, { olympiadId: 'olimat' }));
  assert.deepEqual(page.links(), [['2026/2027', '/olimanager/olimat/olimat27'], ['2025/2026', '/olimanager/olimat/olimat26']]);
  assert.deepEqual(page.lastCrumbs(), [{ label: 'olimat', title: 'Olimpiadi della Matematica' }]);
});

test('an unknown olympiad shows an error', async t => {
  const page = await mount(t, ({ OlimanagerEditions }) => React.createElement(OlimanagerEditions, { olympiadId: 'nope' }));
  assert.match(page.document.querySelector('[role="alert"]').textContent, /Olimpiade non trovata/);
});

test('the address book of an edition lists the districts, linked under the edition path', async t => {
  const page = await mount(t, ({ AddressBook }) => React.createElement(AddressBook, { olympiadId: 'olimat', editionId: 'olimat26' }));
  assert.deepEqual(JSON.parse(JSON.stringify(page.calls.addressBook.at(-1).variables)), { olympiadId: 'olimat', editionId: 'olimat26' });
  assert.equal(page.view().dataset.view, 'districts');
  assert.equal(page.view().dataset.href, '/olimanager/olimat/olimat26/9');
  assert.deepEqual(page.lastCrumbs(), [olimat, { label: '2026' }]);
  // The breadcrumbs settle: no update loop.
  assert.ok(page.calls.breadcrumbs.length < 10, `breadcrumbs updated ${page.calls.breadcrumbs.length} times`);
});

test('a district of the URL opens its page, with edition and district in the breadcrumbs', async t => {
  const page = await mount(t, ({ AddressBook }) => React.createElement(AddressBook, { olympiadId: 'olimat', editionId: 'olimat27', district: '4' }));
  assert.equal(page.view().dataset.view, 'district');
  assert.equal(page.view().textContent, 'Roma');
  assert.deepEqual(page.lastCrumbs(), [olimat, { label: '2027', href: '/olimanager/olimat/olimat27' }, { label: 'Roma' }]);
  assert.ok(page.calls.breadcrumbs.length < 10, `breadcrumbs updated ${page.calls.breadcrumbs.length} times`);
});

test('a user with one district enters it directly, without the district in the breadcrumbs', async t => {
  const page = await mount(t, ({ AddressBook }) => React.createElement(AddressBook, { olympiadId: 'olimat', editionId: 'olimat26' }), { districts: [district(3, 'Pisa')] });
  assert.equal(page.view().dataset.view, 'district');
  assert.deepEqual(page.lastCrumbs(), [olimat, { label: '2026' }]);
});

test('an address book error is shown, with the edition still in the breadcrumbs', async t => {
  const page = await mount(t, ({ AddressBook }) => React.createElement(AddressBook, { olympiadId: 'olimat', editionId: 'nope' }), { addressBookError: new Error('L’edizione deve appartenere all’olimpiade scelta.') });
  assert.equal(page.view(), null);
  assert.match(page.document.querySelector('[role="alert"]').textContent, /edizione deve appartenere/);
  assert.deepEqual(page.lastCrumbs(), [olimat, { label: 'nope' }]);
});
