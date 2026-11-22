const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(relative, dependencies) {
  const exports = {};
  const filename = path.join(__dirname, '..', relative);
  const source = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(source, { exports, Intl, require(name) {
    if (name in dependencies) return dependencies[name];
    throw new Error(`Unexpected dependency: ${name}`);
  } }, { filename });
  return exports;
}
const plain = value => JSON.parse(JSON.stringify(value));
const venueNames = load('app/lib/olimanagerVenueNames.ts', {});
const choices = [{ id: 'oli', name: 'Olimpiadi', editions: [{ id: 'ed', name: '2026', year: 2026, contests: [] }] }];
function library(queryOlimanager = () => { throw new Error('Unexpected request'); }) {
  return load('app/lib/olimanagerAddressBook.ts', {
    './olimanager': { queryOlimanager },
    './olimanagerVenueSheets': { venueSheetChoices: async () => choices },
    './olimanagerVenueNames': venueNames,
  });
}
const user = (name, surname, email) => ({ name, surname, email });
const zones = [
  { id: 2, name: 'Distretto di Pisa', provinces: [{ id: 'PI' }], extraSchools: [{ pk: 3 }], admins: [
    { isPrimary: false, user: user('Bruno', 'Verdi', 'B.Verdi@example.org ') },
    { isPrimary: true, user: user('Anna', 'Rossi', 'anna@example.org') },
    { isPrimary: false, user: user('Carla', 'Bianchi', 'carla@example.org') },
  ] },
  { id: 1, name: 'Distretto di Lucca', provinces: [{ id: 'LU' }], extraSchools: [], admins: [] },
];
const subscription = (pk, code, province, contact = { name: 'Rita', surname: 'Neri', user: { email: 'rita@example.org' } }, isValid = true) => ({
  isValid, contact,
  school: { pk, externalId: code, name: `Scuola ${pk}`, location: { city: { name: `Città ${pk}`, province: { id: province } } } },
});

test('groups CD, RD and RI by district, with territorial exceptions and warnings', () => {
  const book = plain(library().buildAddressBook(zones, [
    subscription(1, 'PIPS01', 'PI'),
    subscription(2, 'LUPS02', 'LU', { name: 'Ugo', surname: 'Gialli', user: null }),
    subscription(3, 'LUPS03', 'LU'), // extra school of Pisa
    subscription(4, 'GEPS04', 'GE'),
    subscription(5, 'PIPS05', 'PI', undefined, false),
  ]));
  assert.deepEqual(book.districts.map(d => d.name), ['Lucca', 'Pisa', 'Senza distretto']);
  const [lucca, pisa, none] = book.districts;
  assert.deepEqual(pisa.coordinators, [{ name: 'Anna', surname: 'Rossi', email: 'anna@example.org' }]);
  assert.deepEqual(pisa.admins.map(a => a.email), ['carla@example.org', 'b.verdi@example.org']);
  assert.deepEqual(pisa.schools.map(s => s.code), ['PIPS01', 'LUPS03']);
  assert.deepEqual(lucca.schools, [{ code: 'LUPS02', name: 'Scuola 2', city: 'Città 2', province: 'LU', contact: { name: 'Ugo', surname: 'Gialli', email: null } }]);
  assert.equal(none.id, null);
  assert.deepEqual(none.schools.map(s => s.code), ['GEPS04']);
  assert.deepEqual(book.warnings, [
    'Distretto Distretto di Lucca: nessun coordinatore (CD).',
    'LUPS02: referente senza account/email.',
    'GEPS04: scuola (provincia GE) non riconducibile ad alcun distretto.',
  ]);
});

test('reads every page of the edition and rejects editions of other olympiads', async () => {
  const requests = [];
  const lib = library(async (req, query, variables) => {
    requests.push(variables);
    if (query.includes('zones {')) return { zones: { zones } };
    const second = variables.after === 'p2';
    return { olympiads: { edition: { subscriptions: {
      edges: [{ node: subscription(second ? 2 : 1, second ? 'LUPS02' : 'PIPS01', second ? 'LU' : 'PI') }],
      pageInfo: { hasNextPage: !second, endCursor: second ? null : 'p2' },
    } } } };
  });
  const book = await lib.loadAddressBook({}, 'oli', 'ed');
  assert.deepEqual(plain(requests), [{ olympiad: 'oli' }, { edition: 'ed', after: null }, { edition: 'ed', after: 'p2' }]);
  assert.equal(book.districts.reduce((n, d) => n + d.schools.length, 0), 2);
  await assert.rejects(lib.loadAddressBook({}, 'oli', 'other'), /appartenere all’olimpiade/);
});

test('entries are filtered by role and accent-insensitive words; emails deduplicated; CSV columns', () => {
  const { addressBookEntries, filterEntries, entryEmails, entryCsvRows } = load('app/lib/addressBookEntries.ts', {});
  const districts = [{ name: 'Forlì', coordinators: [{ name: 'Anna', surname: 'Rossi', email: 'anna@example.org' }], admins: [],
    schools: [
      { code: 'FOPS01', name: 'Liceo Righi', city: 'Cesena', province: 'FC', contact: { name: 'Anna', surname: 'Rossi', email: 'anna@example.org' } },
      { code: 'FOPS02', name: 'Liceo Morgagni', city: 'Forlì', province: 'FC', contact: null },
    ] }];
  const entries = addressBookEntries(districts);
  assert.deepEqual(plain(entries.map(e => e.role)), ['CD', 'RI', 'RI']);
  assert.equal(filterEntries(entries, new Set(['CD', 'RD', 'RI']), 'forli').length, 3);
  assert.deepEqual(plain(filterEntries(entries, new Set(['RI']), 'liceo cesena').map(e => e.code)), ['FOPS01']);
  assert.deepEqual(plain(filterEntries(entries, new Set(['RD']), '')), []);
  assert.deepEqual(plain(entryEmails(entries)), ['anna@example.org']);
  assert.deepEqual(Object.keys(entryCsvRows(entries)[0]), ['distretto', 'ruolo', 'cognome', 'nome', 'email', 'codice_meccanografico', 'scuola', 'città', 'provincia']);
});

test('the resolver is reserved to administrators', () => {
  const source = readFileSync(path.join(__dirname, '../app/graphql/resolvers/olimanagerAddressBook.ts'), 'utf8');
  assert.match(source, /check_admin\(user\)[\s\S]*loadAddressBook/);
});
