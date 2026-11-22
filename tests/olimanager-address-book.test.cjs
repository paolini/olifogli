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
const config = load('app/lib/olimanagerVenueSheetConfig.ts', {});
const contests = [{ id: 31, name: 'Archimede Biennio 2026', scope: 'SCHOOL' }, { id: 32, name: 'Archimede Triennio 2026', scope: 'SCHOOL' }, { id: 35, name: 'Gara distrettuale 2026', scope: 'ZONE' }];
const choices = [{ id: 'oli', name: 'Olimpiadi', editions: [{ id: 'ed', name: '2026', year: 2026, contests }] }];
function library(queryOlimanager = () => { throw new Error('Unexpected request'); }) {
  return load('app/lib/olimanagerAddressBook.ts', {
    './olimanager': { queryOlimanager },
    './olimanagerVenueSheets': { venueSheetChoices: async () => choices },
    './olimanagerVenueNames': venueNames,
    './olimanagerVenueSheetConfig': config,
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
  assert.deepEqual(lucca.schools, [{ code: 'LUPS02', name: 'Scuola 2', city: 'Città 2', province: 'LU', contact: { name: 'Ugo', surname: 'Gialli', email: null }, sheets: [] }]);
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
  const findSheets = async ids => { requests.push(ids); return []; };
  const book = await lib.loadAddressBook({}, 'oli', 'ed', findSheets);
  assert.deepEqual(plain(requests), [{ olympiad: 'oli' }, { edition: 'ed', after: null }, { edition: 'ed', after: 'p2' }, ['31', '32', '35']]);
  assert.equal(book.districts.reduce((n, d) => n + d.schools.length, 0), 2);
  await assert.rejects(lib.loadAddressBook({}, 'oli', 'other', findSheets), /appartenere all’olimpiade/);
});

test('sheets of the edition contests go to their school or district, sorted by type', () => {
  const lib = library();
  const book = lib.buildAddressBook(zones, [subscription(1, 'PIPS01', 'PI'), subscription(2, 'LUPS02', 'LU')]);
  const sheet = (id, schema, contest, commonData) => ({ _id: id, name: `foglio ${id}`, schema, commonData: { olimanager_contest_id: contest, ...commonData }, nRows: 10, nValidRows: 8, locked: id === 'b' });
  lib.attachSheets(book, contests, [
    sheet('t', 'archimede_triennio', '32', { Codice_meccanografico: 'PIPS01', Distretto: 'Pisa' }),
    sheet('b', 'archimede_biennio', '31', { Codice_meccanografico: 'PIPS01', Distretto: 'Pisa' }),
    sheet('d', 'distrettuale', '35', { Distretto: 'Pisa' }),
    sheet('x', 'custom', '35', { Distretto: 'Lucca' }),
    { _id: 'v', name: 'Lucca', schema: 'distrettuale', commonData: { olimanager_contest_id: '35', _id_distretto: '7' } }, // old flow: district in the name
    { _id: 'n', name: 'LUPS02', schema: 'archimede_biennio', commonData: { olimanager_contest_id: '31' } }, // code only in the name
    { _id: 'r', name: 'Pisa', schema: 'distretti', commonData: { olimanager_contest_id: '35', Distretto: 'Roma' } }, // key wins over name
    sheet('o', 'archimede_biennio', '99', { Codice_meccanografico: 'LUPS02' }), // contest of another edition
    sheet('g', 'archimede_biennio', '31', { Codice_meccanografico: 'GEPS04' }), // school not subscribed
  ]);
  const [lucca, pisa] = plain(book.districts);
  assert.deepEqual(pisa.schools[0].sheets, [
    { _id: 'b', name: 'foglio b', label: 'Archimede Biennio', nRows: 10, nValidRows: 8, closed: false, locked: true },
    { _id: 't', name: 'foglio t', label: 'Archimede Triennio', nRows: 10, nValidRows: 8, closed: false, locked: false },
  ]);
  assert.deepEqual(pisa.sheets.map(s => s._id), ['d']);
  assert.deepEqual(lucca.sheets.map(s => s.label), ['Gara distrettuale', 'Gara distrettuale 2026']);
  assert.deepEqual(lucca.sheets[0], { _id: 'v', name: 'Lucca', label: 'Gara distrettuale', nRows: 0, nValidRows: 0, closed: false, locked: false });
  assert.deepEqual(lucca.schools[0].sheets.map(s => s._id), ['n']);
});

test('entries are filtered by role and accent-insensitive words; emails deduplicated; CSV columns', () => {
  const { addressBookEntries, filterEntries, entryEmails, entryCsvRows } = load('app/lib/addressBookEntries.ts', {});
  const districts = [{ name: 'Forlì', coordinators: [{ name: 'Anna', surname: 'Rossi', email: 'anna@example.org' }], admins: [],
    schools: [
      { code: 'FOPS01', name: 'Liceo Righi', city: 'Cesena', province: 'FC', contact: { name: 'Anna', surname: 'Rossi', email: 'anna@example.org' },
        sheets: [{ _id: 's1', name: 'FOPS01', label: 'Archimede Biennio', nRows: 0, nValidRows: 0, closed: false, locked: false }] },
      { code: 'FOPS02', name: 'Liceo Morgagni', city: 'Forlì', province: 'FC', contact: null },
    ] }];
  const entries = addressBookEntries(districts);
  assert.deepEqual(plain(entries.map(e => e.role)), ['CD', 'RI', 'RI']);
  assert.equal(filterEntries(entries, new Set(['CD', 'RD', 'RI']), 'forli').length, 3);
  assert.deepEqual(plain(filterEntries(entries, new Set(['RI']), 'liceo cesena').map(e => e.code)), ['FOPS01']);
  assert.deepEqual(plain(filterEntries(entries, new Set(['RD']), '')), []);
  assert.deepEqual(plain(entryEmails(entries)), ['anna@example.org']);
  const csv = plain(entryCsvRows(entries));
  assert.deepEqual(Object.keys(csv[0]), ['distretto', 'ruolo', 'cognome', 'nome', 'email', 'codice_meccanografico', 'scuola', 'città', 'provincia', 'fogli']);
  assert.deepEqual(csv.map(row => row.fogli), ['', 'Archimede Biennio', '']);
});

function resolvers({ isAdmin = true, addressBookSelection, loadAddressBook = async () => ({ districts: [], warnings: [] }) } = {}) {
  const updates = [];
  const logs = [];
  const finds = [];
  const user = { _id: 'u1', isAdmin, addressBookSelection };
  const lib = load('app/graphql/resolvers/olimanagerAddressBook.ts', {
    '@/app/lib/olimanagerAddressBook': { loadAddressBook },
    '@/app/lib/appLog': { appLog: (...args) => logs.push(args) },
    '@/app/lib/mongodb': {
      getUsersCollection: async () => ({ updateOne: async (...args) => { updates.push(args); } }),
      getSheetsCollection: async () => ({ find: (...args) => { finds.push(args); return { toArray: async () => [] }; } }),
    },
    '@/app/lib/olimanagerVenueSheetConfig': config,
    './utils': {
      get_authenticated_user: async () => user,
      check_admin: u => { if (!u.isAdmin) throw new Error('non autorizzato'); },
    },
  });
  return { lib, updates, logs, finds };
}
const context = { req: {} };

test('the resolver remembers the edition per user only after a successful load', async () => {
  const ok = resolvers({ loadAddressBook: async (req, olympiadId, editionId, findSheets) => {
    await findSheets(['31', '32']);
    return { districts: [], warnings: [] };
  } });
  await ok.lib.olimanagerAddressBook(null, { olympiadId: 'oli', editionId: 'ed' }, context);
  assert.deepEqual(plain(ok.finds[0][0]), { 'commonData.olimanager_contest_id': { $in: ['31', '32'] } });
  assert.deepEqual(plain(ok.updates), [[{ _id: 'u1' }, { $set: { addressBookSelection: { olympiadId: 'oli', editionId: 'ed' } } }]]);
  assert.equal(ok.logs[0][0], 'olimanager.address_book_viewed');

  const failing = resolvers({ loadAddressBook: async () => { throw new Error('remota'); } });
  await assert.rejects(failing.lib.olimanagerAddressBook(null, { olympiadId: 'oli', editionId: 'x' }, context), /remota/);
  assert.deepEqual(failing.updates, []);

  assert.deepEqual(plain(await resolvers({ addressBookSelection: { olympiadId: 'oli', editionId: 'ed' } }).lib.olimanagerAddressBookSelection(null, {}, context)), { olympiadId: 'oli', editionId: 'ed' });
  assert.equal(await resolvers().lib.olimanagerAddressBookSelection(null, {}, context), null);
});

test('address book and saved selection are reserved to administrators', async () => {
  const { lib, updates } = resolvers({ isAdmin: false });
  await assert.rejects(lib.olimanagerAddressBook(null, { olympiadId: 'oli', editionId: 'ed' }, context), /non autorizzato/);
  await assert.rejects(lib.olimanagerAddressBookSelection(null, {}, context), /non autorizzato/);
  assert.deepEqual(updates, []);
});
