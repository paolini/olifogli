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
const { venueSheetPlan, samePermissions, permissionChanges, applyPermissionChanges } = load('app/lib/olimanagerVenueSheetPlan.ts', {});
test('applies only selected permission additions, removals and roles, preserving manual helpers', () => {
  const current = [{ email: 'old@example.org', role: 'admin' }, { email: 'coord@example.org', role: 'editor' }, { email: 'helper@example.org', role: 'editor' }];
  const desired = [{ email: 'new@example.org', role: 'admin' }, { email: 'coord@example.org', role: 'view' }];
  assert.deepEqual(plain(applyPermissionChanges(current, desired, [])), current);
  assert.deepEqual(plain(applyPermissionChanges(current, desired, ['new@example.org'])), [...current, desired[0]]);
  assert.deepEqual(plain(applyPermissionChanges(current, desired, ['old@example.org'])), current.slice(1));
  assert.deepEqual(plain(applyPermissionChanges(current, desired, ['coord@example.org'])), [current[0], current[2], desired[1]]);
  assert.deepEqual(plain(applyPermissionChanges(current, desired, ['old@example.org', 'new@example.org', 'coord@example.org'])), [current[2], ...desired]);
  assert.equal(current.length, 3);
});
test('permission plan distinguishes additions, removals, role changes, unchanged sheets and ambiguous matches', () => {
  const current = [{ email: 'old@example.org', role: 'admin' }, { email: 'coord@example.org', role: 'editor' }];
  const desired = [{ email: 'new@example.org', role: 'admin' }, { email: 'coord@example.org', role: 'view' }];
  assert.equal(samePermissions(current, [...current].reverse()), true);
  assert.equal(samePermissions(current, desired), false);
  assert.deepEqual(plain(permissionChanges(current, desired)), [
    { email: 'coord@example.org', previousRole: 'editor', role: 'view' },
    { email: 'new@example.org', role: 'admin' },
    { email: 'old@example.org', previousRole: 'admin' },
  ]);
  const candidate = { name: 'CODE', schema: 'archimede_biennio', permissions: desired, commonData: {} };
  const existing = { _id: 'id', name: 'Legacy name', schema: candidate.schema, permissions: current, commonData: { Codice_meccanografico: 'CODE' } };
  assert.equal(venueSheetPlan([candidate], [existing])[0].action, 'update');
  assert.equal(venueSheetPlan([candidate], [{ ...existing, permissions: desired }])[0].action, 'unchanged');
  assert.equal(venueSheetPlan([candidate], [existing, { ...existing, _id: 'duplicate' }])[0].action, 'conflict');
  assert.equal(venueSheetPlan([candidate], [])[0].action, 'create');
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
  return load('app/lib/olimanagerVenueSheets.ts', { './olimanager': { queryOlimanager } });
}

test('two Archimede sheets per valid school, admin contact and district supervisors; exceptions override province', () => {
  const result = plain(library().sheetsFromSubscriptions([subscription(), subscription(2)], zones));
  assert.equal(result.sheets.length, 4);
  assert.deepEqual(result.sheets.slice(0, 2).map(s => s.schema), ['archimede_biennio', 'archimede_triennio']);
  assert.deepEqual(result.sheets[0].permissions, [{ email: 'referente@example.org', role: 'admin' }, { email: 'coord@example.org', role: 'view' }]);
  assert.equal(result.sheets[0].commonData.Distretto, 'Pisa');
  assert.equal(result.sheets[2].commonData.Distretto, 'Lucca');
  assert.equal(result.sheets[2].permissions[1].email, 'lucca@example.org');
});

test('invalid subscriptions excluded; missing contact or district does not prevent creation', () => {
  const result = library().sheetsFromSubscriptions([
    subscription(1, 'PI', { isValid: false }), subscription(2, 'LU', { contact: { user: null } }), subscription(3, 'XX'),
  ], zones);
  assert.equal(result.sheets.length, 4);
  assert.deepEqual(plain(result.sheets[0].permissions), [{ email: 'lucca@example.org', role: 'view' }]);
  assert.deepEqual(plain(result.sheets[2].permissions), [{ email: 'referente@example.org', role: 'admin' }]);
  assert.equal(result.sheets[2].commonData.Distretto, '');
  assert.equal(result.warnings.length, 2);
  assert.throws(() => library().sheetsFromSubscriptions([subscription(), subscription()], zones), /duplicato/);
});

test('creates both sheets with no admins or supervisors, including absent or ambiguous districts', () => {
  const noContact = { contact: { user: null } };
  for (const availableZones of [[], [{ ...zones[0], admins: [] }], [zones[0], { ...zones[0], id: 3 }]]) {
    const result = library().sheetsFromSubscriptions([subscription(1, 'PI', noContact)], availableZones);
    assert.equal(result.sheets.length, 2);
    assert.deepEqual(plain(result.sheets.map(s => s.permissions)), [[], []]);
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
  const result = await lib.loadVenueSheets({}, 'math', 31, 32);
  assert.equal(result.editionId, 'old');
  assert.equal(result.sheets.length, 4);
  assert.equal(requests.length, 4);
  assert.equal(requests[1].variables.olympiad, 'math');
});

test('rejects same contest, mismatched editions, wrong olympiad and non-school contests', async () => {
  const lib = library(async () => ({ olympiads: { olympiads: choices } }));
  for (const ids of [[31, 31], [0, 32], [31, 41], [41, 42]]) {
    await assert.rejects(lib.loadVenueSheets({}, 'math', ...ids));
  }
  await assert.rejects(lib.loadVenueSheets({}, 'other', 31, 32));
});

test('detects broken pagination instead of repeating requests forever', async () => {
  const lib = library(async (req, query) => {
    if (query.includes('editions {')) return { olympiads: { olympiads: choices } };
    if (query.includes('zones {')) return { zones: { zones } };
    return { olympiads: { edition: { subscriptions: { edges: [], pageInfo: { hasNextPage: true, endCursor: 'same' } } } } };
  });
  await assert.rejects(lib.loadVenueSheets({}, 'math', 31, 32), /Paginazione/);
});

function resolverFixture(remoteFailure = false) {
  const writes = [], remote = [];
  const module = load('app/graphql/resolvers/olimanagerVenueSheets.ts', {
    '@/app/lib/mongodb': { getWorkbooksCollection: async () => ({ findOne: async () => ({}), updateOne: async (...args) => { writes.push(args); return { acknowledged: true, matchedCount: 1 }; } }) },
    '@/app/lib/olimanagerVenueSheets': { venueSheetChoices: async () => choices, loadVenueSheets: async (...args) => { remote.push(args); if (remoteFailure) throw new Error('OAuth failure'); return { sheets: [], warnings: [], editionId: 'old' }; } },
    '@/app/lib/olimanagerVenueSheetConfig': config,
    './utils': { get_authenticated_user: async ctx => { if (!ctx.user) throw new Error('Authentication required'); return ctx.user; }, check_admin: user => { if (!user.isAdmin) throw new Error('Forbidden'); } },
  });
  return { ...module, writes, remote };
}
const args = { workbookId: new ObjectId(), olympiadId: 'math', biennioContestId: 31, triennioContestId: 32 };
const context = { user: { isAdmin: true, email: 'admin@example.org' }, req: {} };
test('persists olympiad, edition and legacy contest keys with dotted updates, preserving other workbook settings', async () => {
  const f = resolverFixture();
  await f.prepareOlimanagerVenueSheets(null, args, context);
  const update = f.writes[0][1].$set;
  assert.equal(update['commonData.olimanager_olympiad_id'], 'math');
  assert.equal(update['commonData.olimanager_edition_id'], 'old');
  assert.equal(update['commonData.olimanager_archimede_biennio_contest_id'], '31');
  assert.equal(update['commonData.olimanager_archimede_triennio_contest_id'], '32');
  assert.equal('commonData' in update, false);
  assert.equal(f.remote[0][0], context.req);
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
