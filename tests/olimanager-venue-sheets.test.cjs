const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { ObjectId } = require('bson');

function load(relative, dependencies) {
  const exports = {};
  const filename = path.join(__dirname, '..', relative);
  const source = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(source, { exports, require(name) {
    if (name in dependencies) return dependencies[name];
    throw new Error(`Unexpected dependency: ${name}`);
  } }, { filename });
  return exports;
}
const plain = value => JSON.parse(JSON.stringify(value));
const config = load('app/lib/olimanagerVenueSheetConfig.ts', {});
const { venueSheetPlan, samePermissions, permissionChanges, applyPermissionChanges } = load('app/lib/olimanagerVenueSheetPlan.ts', { './olimanagerVenueSheetConfig': config });
test('applies only selected permission additions, removals and roles, preserving manual helpers', () => {
  const current = [{ email: 'old@example.org', role: 'manager' }, { email: 'coord@example.org', role: 'editor' }, { email: 'helper@example.org', role: 'editor' }];
  const desired = [{ email: 'new@example.org', role: 'manager' }, { email: 'coord@example.org', role: 'viewer' }];
  assert.deepEqual(plain(applyPermissionChanges(current, desired, [])), current);
  assert.deepEqual(plain(applyPermissionChanges(current, desired, ['new@example.org'])), [...current, desired[0]]);
  assert.deepEqual(plain(applyPermissionChanges(current, desired, ['old@example.org'])), current.slice(1));
  assert.deepEqual(plain(applyPermissionChanges(current, desired, ['coord@example.org'])), [current[0], current[2], desired[1]]);
  assert.deepEqual(plain(applyPermissionChanges(current, desired, ['old@example.org', 'new@example.org', 'coord@example.org'])), [current[2], ...desired]);
  assert.equal(current.length, 3);
});
test('permission plan distinguishes additions, removals, role changes, unchanged sheets and ambiguous matches', () => {
  const current = [{ email: 'old@example.org', role: 'manager' }, { email: 'coord@example.org', role: 'editor' }];
  const desired = [{ email: 'new@example.org', role: 'manager' }, { email: 'coord@example.org', role: 'viewer' }];
  assert.equal(samePermissions(current, [...current].reverse()), true);
  assert.equal(samePermissions(current, desired), false);
  assert.deepEqual(plain(permissionChanges(current, desired)), [
    { email: 'coord@example.org', previousRole: 'editor', role: 'viewer' },
    { email: 'new@example.org', role: 'manager' },
    { email: 'old@example.org', previousRole: 'manager' },
  ]);
  const candidate = { name: 'CODE', schema: 'archimede_biennio', permissions: desired, commonData: { olimanager_contest_id: '31' } };
  const existing = { _id: 'id', name: 'Legacy name', schema: candidate.schema, permissions: current, commonData: { Codice_meccanografico: 'CODE', olimanager_contest_id: '31' } };
  assert.equal(venueSheetPlan([candidate], [existing])[0].action, 'update');
  assert.equal(venueSheetPlan([candidate], [existing])[0].assignContest, false);
  assert.equal(venueSheetPlan([candidate], [{ ...existing, permissions: desired }])[0].action, 'unchanged');
  assert.equal(venueSheetPlan([candidate], [existing, { ...existing, _id: 'duplicate' }])[0].action, 'conflict');
  assert.equal(venueSheetPlan([candidate], [])[0].action, 'create');
  assert.equal(venueSheetPlan([candidate], [{ ...existing, schema: 'archimede_triennio' }])[0].action, 'create');
});
test('contest of existing sheets: same contest first, assignment of sheets without contest, conflict with another contest', () => {
  const permissions = [{ email: 'ref@example.org', role: 'manager' }];
  const candidate = { name: 'CODE', schema: 'archimede_biennio', permissions, commonData: { olimanager_contest_id: '31' } };
  const sheet = (id, contest) => ({ _id: id, name: 'CODE', schema: candidate.schema, permissions, commonData: contest === undefined ? {} : { olimanager_contest_id: contest } });
  const unassigned = venueSheetPlan([candidate], [sheet('a'), sheet('b', ' ')])[0];
  assert.equal(unassigned.action, 'conflict');
  const assign = venueSheetPlan([candidate], [sheet('a')])[0];
  assert.deepEqual([assign.action, assign.assignContest, assign.sheet._id, assign.changes.length], ['update', true, 'a', 0]);
  const same = venueSheetPlan([candidate], [sheet('a'), sheet('b', '31'), sheet('c', '99')])[0];
  assert.deepEqual([same.action, same.sheet._id], ['unchanged', 'b']);
  const other = venueSheetPlan([candidate], [sheet('c', '99')])[0];
  assert.equal(other.action, 'conflict');
  assert.match(other.reason, /#99/);
  assert.equal(venueSheetPlan([candidate], [sheet('a'), sheet('c', '99')])[0].action, 'conflict');
});
const choices = [{ id: 'math', name: 'Matematica', editions: [
  { id: 'old', name: '2025', contests: [{ id: 31, name: 'Biennio', scope: 'SCHOOL' }, { id: 32, name: 'Triennio', scope: 'SCHOOL' }] },
  { id: 'new', name: '2026', contests: [{ id: 41, name: 'Biennio', scope: 'SCHOOL' }, { id: 42, name: 'Distrettuale', scope: 'ZONE' }] },
] }];
function subscription(pk = 1, province = 'PI', extra = {}) {
  return { isValid: true, school: { pk, externalId: `CODE${pk}`, name: `Scuola ${pk}`, location: { city: { name: 'Pisa', province: { id: province } } } },
    contact: { user: { email: ' Referente@Example.org ' } }, ...extra };
}
const zones = [
  { id: 1, name: 'Distretto di Pisa', provinces: [{ id: 'PI' }], extraSchools: [], admins: [{ user: { email: 'COORD@example.org' } }, { user: { email: 'coord@example.org' } }, { user: { email: 'referente@example.org' } }] },
  { id: 2, name: 'Lucca', provinces: [{ id: 'LU' }], extraSchools: [{ pk: 2 }], admins: [{ user: { email: 'lucca@example.org' } }] },
];
function library(queryOlimanager = () => { throw new Error('Unexpected request'); }) {
  return load('app/lib/olimanagerVenueSheets.ts', { './olimanager': { queryOlimanager }, './olimanagerVenueSheetConfig': config });
}
const fromSubscriptions = (subscriptions, availableZones = zones) => library().sheetsFromSubscriptions(subscriptions, availableZones, 'archimede_biennio', 31);

test('one sheet of the chosen schema and contest per valid school, admin contact and district supervisors; exceptions override province', () => {
  const result = plain(fromSubscriptions([subscription(), subscription(2)]));
  assert.equal(result.sheets.length, 2);
  assert.deepEqual(result.sheets.map(s => [s.schema, s.commonData.olimanager_contest_id]), [['archimede_biennio', '31'], ['archimede_biennio', '31']]);
  assert.deepEqual(result.sheets[0].permissions, [{ email: 'referente@example.org', role: 'manager' }, { email: 'coord@example.org', role: 'viewer' }]);
  assert.equal(result.sheets[0].commonData.Distretto, 'Pisa');
  assert.equal(result.sheets[1].commonData.Distretto, 'Lucca');
  assert.equal(result.sheets[1].permissions[1].email, 'lucca@example.org');
});

test('invalid subscriptions excluded; missing contact or district does not prevent creation', () => {
  const result = fromSubscriptions([
    subscription(1, 'PI', { isValid: false }), subscription(2, 'LU', { contact: { user: null } }), subscription(3, 'XX'),
  ]);
  assert.equal(result.sheets.length, 2);
  assert.deepEqual(plain(result.sheets[0].permissions), [{ email: 'lucca@example.org', role: 'viewer' }]);
  assert.deepEqual(plain(result.sheets[1].permissions), [{ email: 'referente@example.org', role: 'manager' }]);
  assert.equal(result.sheets[1].commonData.Distretto, '');
  assert.equal(result.warnings.length, 2);
  assert.match(result.warnings[1], /CODE3: scuola \(provincia XX\) non riconducibile ad alcun distretto\.$/);
  assert.throws(() => fromSubscriptions([subscription(), subscription()]), /duplicato/);
});

test('creates the sheet with no admins or supervisors, including absent or ambiguous districts', () => {
  const noContact = { contact: { user: null } };
  for (const availableZones of [[], [{ ...zones[0], admins: [] }], [zones[0], { ...zones[0], id: 3 }]]) {
    const result = fromSubscriptions([subscription(1, 'PI', noContact)], availableZones);
    assert.equal(result.sheets.length, 1);
    assert.deepEqual(plain(result.sheets.map(s => s.permissions)), [[]]);
    assert.equal(result.warnings.length, 2);
    assert.equal(result.warnings.some(w => w.includes('esclus')), false);
  }
});

test('reads all pages of the selected historical edition instead of latest zone subscriptions', async () => {
  const requests = [];
  const lib = library(async (req, query, variables) => {
    requests.push({ query, variables });
    if (query.includes('editions {')) return { olympiads: { olympiads: choices } };
    if (query.includes('zones {')) return { zones: { zones } };
    const second = variables.after === 'page2';
    assert.equal(variables.edition, 'old');
    return { olympiads: { edition: { subscriptions: { edges: [{ node: subscription(second ? 2 : 1) }], pageInfo: { hasNextPage: !second, endCursor: second ? null : 'page2' } } } } };
  });
  const result = await lib.loadVenueSheets({}, 'math', 'old', 'archimede_triennio', 32);
  assert.deepEqual(plain(result.sheets.map(s => [s.schema, s.commonData.olimanager_contest_id])), [['archimede_triennio', '32'], ['archimede_triennio', '32']]);
  assert.equal(requests.length, 4);
  assert.equal(requests[1].variables.olympiad, 'math');
});

test('rejects invalid contests, contests of another edition or olympiad, contests of the wrong scope and unsupported schemas', async () => {
  const lib = library(async () => ({ olympiads: { olympiads: choices } }));
  for (const [edition, schema, contest] of [['old', 'archimede_biennio', 0], ['old', 'archimede_biennio', 41], ['new', 'archimede_biennio', 42],
    ['missing', 'archimede_biennio', 31], ['old', 'gara_prime', 31], ['new', 'gara_prime', 41], ['old', 'distrettuale', 31], ['old', 'constructor', 31]]) {
    await assert.rejects(lib.loadVenueSheets({}, 'math', edition, schema, contest));
  }
  await assert.rejects(lib.loadVenueSheets({}, 'other', 'old', 'archimede_biennio', 31));
});

test('detects broken pagination instead of repeating requests forever', async () => {
  const lib = library(async (req, query) => {
    if (query.includes('editions {')) return { olympiads: { olympiads: choices } };
    if (query.includes('zones {')) return { zones: { zones } };
    return { olympiads: { edition: { subscriptions: { edges: [], pageInfo: { hasNextPage: true, endCursor: 'same' } } } } };
  });
  await assert.rejects(lib.loadVenueSheets({}, 'math', 'old', 'archimede_biennio', 31), /Paginazione/);
});

const venue = (id, name, emails = [`admin${id}@example.org`], extra = {}) =>
  ({ id, name, parentVenue: null, admins: emails.map(email => ({ user: email && { email } })), ...extra });

test('zone contests: one sheet per top-level venue, named after its district; venue admins manage, RD edit', () => {
  const rd = [{ user: { email: 'RD@example.org' } }, { user: { email: 'admin1@example.org' } }];
  const districts = [{ ...zones[0], admins: rd }, { ...zones[0], id: 3, name: 'Distretto di Pisa Est', admins: [] }];
  const result = plain(library().sheetsFromVenues([
    venue(1, 'Distretto di Pisa (Gara delle Prime)'),
    venue(2, 'Distretto di Pisa Est (Gara delle Prime)', []),
    venue(3, 'Sottosede di Pisa', ['sub@example.org'], { parentVenue: { id: 1 } }),
    venue(4, 'Distretto di Atlantide (Gara delle Prime)', [null]),
  ], districts, 'gara_prime', 33));
  assert.deepEqual(result.sheets.map(s => s.name), ['Pisa', 'Pisa Est', 'Atlantide']);
  assert.deepEqual(result.sheets[0], { name: 'Pisa', schema: 'gara_prime', commonData: { Distretto: 'Pisa', olimanager_contest_id: '33' },
    permissions: [{ email: 'admin1@example.org', role: 'manager' }, { email: 'rd@example.org', role: 'editor' }] });
  assert.deepEqual(result.sheets[1].permissions, []);
  assert.deepEqual(result.sheets[2].permissions, []);
  assert.deepEqual(result.warnings, [
    'Venue Distretto di Pisa Est (Gara delle Prime): nessun amministratore; nessun responsabile assegnato.',
    'Pisa Est: distretto Distretto di Pisa Est senza responsabili di distretto (RD).',
    'Venue Distretto di Atlantide (Gara delle Prime): non riconducibile ad alcun distretto.',
    'Venue Distretto di Atlantide (Gara delle Prime): nessun amministratore; nessun responsabile assegnato.',
  ]);
  assert.throws(() => library().sheetsFromVenues([venue(1, 'Distretto di Pisa'), venue(2, 'Distretto di Pisa (bis)')], zones, 'gara_prime', 33), /Più venue/);
});

test('zone contests read the venues of the contest, not the school subscriptions', async () => {
  const requests = [];
  const zoneChoices = [{ id: 'math', name: 'Matematica', editions: [{ id: 'new', name: '2026', contests: [{ id: 42, name: 'Gara delle prime', scope: 'ZONE' }] }] }];
  const lib = library(async (req, query, variables) => {
    requests.push(variables);
    if (query.includes('editions {')) return { olympiads: { olympiads: zoneChoices } };
    if (query.includes('zones {')) return { zones: { zones } };
    if (query.includes('venues {')) return { venues: { venues: [venue(1, 'Distretto di Pisa (Gara delle Prime)')] } };
    throw new Error('Unexpected query');
  });
  const result = plain(await lib.loadVenueSheets({}, 'math', 'new', 'gara_prime', 42));
  assert.deepEqual(result.sheets.map(s => [s.name, s.schema, s.commonData.olimanager_contest_id]), [['Pisa', 'gara_prime', '42']]);
  assert.deepEqual(plain(requests[2]), { contest: 42 });
  assert.equal(requests.length, 3);
});

function resolverFixture(remoteFailure = false) {
  const writes = [], remote = [];
  const module = load('app/graphql/resolvers/olimanagerVenueSheets.ts', {
    '@/app/lib/mongodb': { getWorkbooksCollection: async () => ({ findOne: async () => ({}), updateOne: async (...args) => { writes.push(args); return { acknowledged: true, matchedCount: 1 }; } }) },
    '@/app/lib/olimanagerVenueSheets': { venueSheetChoices: async () => choices, loadVenueSheets: async (...args) => { remote.push(args); if (remoteFailure) throw new Error('OAuth failure'); return { sheets: [], warnings: [] }; } },
    './utils': { get_authenticated_user: async ctx => { if (!ctx.user) throw new Error('Authentication required'); return ctx.user; }, check_admin: user => { if (!user.isAdmin) throw new Error('Forbidden'); } },
  });
  return { ...module, writes, remote };
}
const args = { workbookId: new ObjectId(), olympiadId: 'math', editionId: 'old', schema: 'archimede_biennio', contestId: 31 };
const context = { user: { isAdmin: true, email: 'admin@example.org' }, req: {} };
test('persists only olympiad and edition with dotted updates, preserving other workbook settings', async () => {
  const f = resolverFixture();
  await f.prepareOlimanagerVenueSheets(null, args, context);
  const update = f.writes[0][1].$set;
  assert.equal(update['commonData.olimanager_olympiad_id'], 'math');
  assert.equal(update['commonData.olimanager_edition_id'], 'old');
  assert.equal(Object.keys(update).some(key => key.includes('contest')), false);
  assert.equal('commonData' in update, false);
  assert.deepEqual(f.remote[0], [context.req, 'math', 'old', 'archimede_biennio', 31]);
});
test('no configuration writes on remote failure and no remote reads for unauthorized users', async () => {
  const f = resolverFixture(true);
  await assert.rejects(f.prepareOlimanagerVenueSheets(null, args, context), /OAuth/);
  assert.equal(f.writes.length, 0);
  const protectedResolver = resolverFixture();
  for (const ctx of [{}, { user: { isAdmin: false }, req: {} }, { user: context.user }]) {
    await assert.rejects(protectedResolver.prepareOlimanagerVenueSheets(null, args, ctx));
    await assert.rejects(protectedResolver.olimanagerVenueSheetChoices(null, {}, ctx));
  }
  assert.equal(protectedResolver.writes.length, 0);
  assert.equal(protectedResolver.remote.length, 0);
});
