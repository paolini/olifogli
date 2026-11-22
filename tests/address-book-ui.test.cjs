const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { act } = React;
const { JSDOM } = require('jsdom');

// Mounts the real district list of the address book in jsdom, with its real
// helpers; only next/link, the icons, the CSV writer and Button are replaced.
function transpile(relative, dependencies, globals) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(path.join(__dirname, '..', relative), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(source, { exports, Intl, ...globals, require: name => dependencies[name] ?? require(name) });
  return exports;
}

const contact = (name, surname, email) => ({ name, surname, email });
const sheet = (id, label, nRows, nValidRows) => ({ _id: id, name: id, label, nRows, nValidRows, closed: false, locked: false });
const districts = [
  { id: 3, name: 'Pisa', coordinators: [contact('Anna', 'Rossi', 'anna@example.org')], admins: [contact('Rino', 'Romano', 'rino@example.org')], warnings: [], sheets: [],
    schools: [{ code: 'PIPS01', name: 'Liceo Dini', city: 'Pisa', province: 'PI', contact: contact('Roma', 'Neri', 'roma.neri@example.org'), sheets: [sheet('s1', 'Archimede Biennio', 10, 8)] }] },
  { id: 4, name: 'Roma', coordinators: [contact('Carlo', 'Bianchi', 'carlo@example.org')], admins: [], warnings: ['Nessun coordinatore (CD).'], sheets: [sheet('s2', 'Gara distrettuale', 5, 5)],
    schools: [{ code: 'RMPS01', name: 'Liceo Tasso', city: 'Roma', province: 'RM', contact: contact('Ugo', 'Verdi', null), sheets: [] }] },
];

async function mount(t) {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://rubrica.invalid/rubrica' });
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
  const link = { __esModule: true, default: ({ href, children, ...rest }) => React.createElement('a', { href, ...rest }, children) };
  const entries = transpile('app/lib/addressBookEntries.ts', {});
  const parts = transpile('app/components/AddressBookParts.tsx', {
    ...base, 'next/link': link, '../lib/addressBookEntries': entries,
    'lucide-react': { Archive: () => null, Lock: () => null, Unlock: () => null },
    '../lib/csv': { unparseCsv: () => '' },
    './Button': { __esModule: true, default: ({ children, variant, ...rest }) => React.createElement('button', rest, children) }, // eslint-disable-line no-unused-vars
  }, { document: dom.window.document });
  const { default: AddressBookDistricts } = transpile('app/components/AddressBookDistricts.tsx', {
    ...base, 'next/link': link, '../lib/addressBookEntries': entries, './AddressBookParts': parts,
  });
  // Holds the filters like OlimanagerAddressBook does.
  function Harness() {
    const [roles, setRoles] = React.useState(new Set(entries.ADDRESS_BOOK_ROLES));
    const [districtFilter, setDistrictFilter] = React.useState('');
    const [peopleSearch, setPeopleSearch] = React.useState('');
    return React.createElement(AddressBookDistricts, { districts, roles, setRoles, districtFilter, setDistrictFilter, peopleSearch, setPeopleSearch });
  }
  const root = createRoot(dom.window.document.getElementById('root'));
  await act(async () => { root.render(React.createElement(Harness)); });
  t.after(async () => {
    await act(async () => { root.unmount(); });
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  const document = dom.window.document;
  const input = label => document.querySelector(`input[aria-label="${label}"]`);
  return {
    document,
    type: (label, value) => act(async () => {
      const element = input(label);
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(element, value);
      element.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    }),
    toggleRole: role => act(async () => {
      [...document.querySelectorAll('label')].find(l => l.textContent.trim() === role).querySelector('input').click();
    }),
    rows: () => [...document.querySelectorAll('tbody tr')].map(tr => [...tr.children].map(td => td.textContent.replace(/\s+/g, ' ').trim())),
    links: () => [...document.querySelectorAll('tbody a')].map(a => [a.textContent, a.getAttribute('href')]),
    counts: () => [...document.querySelectorAll('span')].map(s => s.textContent).find(text => / voci, /.test(text)),
  };
}

test('the district list shows one row per district with counts and links to the district page', async t => {
  const page = await mount(t);
  assert.deepEqual(page.rows(), [
    ['Pisa', 'Rossi Anna', '1', '1', '1', '8/10', '', ''],
    ['Roma', 'Bianchi Carlo', '0', '1', '0', '5/5', '1', 'Gara distrettuale 5/5'],
  ]);
  assert.deepEqual(page.links().filter(([, href]) => href.startsWith('/rubrica')), [['Pisa', '/rubrica?distretto=3'], ['Roma', '/rubrica?distretto=4']]);
  assert.equal(page.counts(), '5 voci, 4 email');
});

test('the district filter looks only at district names; bulk actions follow districts and roles', async t => {
  const page = await mount(t);
  await page.type('Filtra distretti', 'roma');
  assert.deepEqual(page.rows().map(row => row[0]), ['Roma']);
  assert.equal(page.counts(), '2 voci, 1 email');
  await page.type('Filtra distretti', '');
  await page.toggleRole('RD');
  await page.toggleRole('RI');
  assert.equal(page.counts(), '2 voci, 2 email');
});

test('the people search ignores district names and lists people with a link to their district', async t => {
  const page = await mount(t);
  await page.type('Cerca persone o scuole', 'roma');
  assert.deepEqual(page.rows().map(row => row.slice(0, 2)), [
    ['RD', 'Romano Rino <rino@example.org>'],
    ['RI', 'Neri Roma <roma.neri@example.org>'],
    ['RI', 'Verdi Ugo senza email'], // school in the city of Roma
  ]);
  assert.deepEqual(page.links().filter(([, href]) => href.startsWith('/rubrica')).map(([, href]) => href), ['/rubrica?distretto=3', '/rubrica?distretto=3', '/rubrica?distretto=4']);
  assert.equal(page.counts(), '3 voci, 2 email');
  assert.equal(page.document.querySelector('input[aria-label="Filtra distretti"]').disabled, true);
});
