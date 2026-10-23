const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { ObjectId } = require('mongodb');
const ts = require('typescript');
function load(file, dependencies = {}) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(path.resolve(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(source, { exports, Buffer, Date, Error, Map, URL, AbortSignal, setTimeout, process: { env: {} }, require(id) {
    if (Object.hasOwn(dependencies, id)) return dependencies[id];
    if (id === 'node:crypto') return require(id);
    throw new Error('Unexpected dependency: ' + id);
  } });
  return exports;
}
const { protectJobAccess, unprotectJobAccess } = load('app/lib/olimanagerJobCredentials.ts');
const { createRemoteInspector, compareParticipant } = load('app/lib/olimanagerRemoteCheck.ts', {
  './schema': { schemas: { test: { validationContext() { return { contest_id: 10, school_external_id: () => 'TEST0001' }; } } } },
});
const endpoint = 'https://provider.example.invalid/graphql/';
const access = { accessToken: 'synthetic-private-token', expiresAt: Math.floor(Date.now() / 1000) + 3600 };
const job = () => ({ _id: new ObjectId(), createdBy: new ObjectId(), endpoint });
const row = () => ({ data: { name: 'Salvatore', surname: 'Amato', birthDate: '19/12/2008', classYear: '3', classSection: 'X' },
  olimanager: { participantId: '325', contestId: '10' } });
const participant = () => ({ pk: 325, officialVenue: { contest: { id: 10 } }, competitor: { pk: 88,
  school: { externalId: 'TEST0001' }, members: [{ name: 'Salvatore', surname: 'Amato', birthDate: '2008-12-19', classYear: 11, section: 'X' }] } });
const permissionData = (allowed = true) => ({ users: { me: { isStaff: false } },
  contests: { contests: [{ id: 10, edition: { olympiad: { admin: allowed ? { __typename: 'OlympiadAdminType' } : null } } }] } });
function fixture({ allowed = true, nodes = [participant()], respond } = {}) {
  const calls = [];
  const inspect = createRemoteInspector(job(), access, { endpoint, wait: async () => {}, request: async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push({ url, options, body });
    assert.equal(url, endpoint);
    assert.equal(options.method, 'POST'); assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, 'Bearer ' + access.accessToken);
    assert.equal(options.headers.Cookie, undefined);
    assert.match(body.query, /^query /); assert.doesNotMatch(body.query, /\bmutation\b/);
    if (respond) return respond(body, calls.length);
    const data = body.query.includes('Permissions') ? permissionData(allowed)
      : { participants: { participants: { edges: nodes.map(node => ({ node })) } } };
    return new Response(JSON.stringify({ data }));
  } });
  return { inspect: value => inspect(value, { schema: 'test', commonData: {} }, { commonData: {} }), calls };
}

test('delegation is encrypted, randomized and bound to job, author and endpoint', () => {
  const original = job(), secret = 'synthetic-encryption-key';
  const protectedAccess = protectJobAccess(original, access, secret);
  assert.ok(!JSON.stringify(protectedAccess).includes(access.accessToken));
  assert.equal(unprotectJobAccess(original, protectedAccess, secret).accessToken, access.accessToken);
  assert.notEqual(protectJobAccess(original, access, secret).ciphertext, protectedAccess.ciphertext);
  for (const modified of [{ ...original, _id: new ObjectId() }, { ...original, createdBy: new ObjectId() }, { ...original, endpoint: 'https://other.invalid/graphql/' }]) {
    assert.throws(() => unprotectJobAccess(modified, protectedAccess, secret), /delega OAuth/);
  }
  assert.throws(() => unprotectJobAccess(original, protectedAccess, 'another-key'), /delega OAuth/);
  assert.throws(() => protectJobAccess(original, { ...access, expiresAt: 1 }, secret), /scaduto/);
  assert.throws(() => protectJobAccess(original, access), /NEXTAUTH_SECRET/);
});

test('matching participant is read with OAuth and comparison never changes the row', async () => {
  const f = fixture(), value = row(), before = JSON.stringify(value);
  const result = await f.inspect(value);
  assert.equal(result.result, 'matched'); assert.equal(result.participantId, '325'); assert.equal(result.competitorId, '88');
  assert.equal(JSON.stringify(value), before);
  assert.equal(f.calls.length, 2);
  assert.deepEqual(f.calls[1].body.variables, { contestId: 10, participantId: 325 });
  await f.inspect(value);
  assert.equal(f.calls.length, 3, 'cache successful permission check per contest');
});

test('unmatched and invalid local links never start remote searches or creations', async () => {
  const f = fixture();
  assert.equal((await f.inspect({ data: row().data })).result, 'unmatched');
  assert.equal((await f.inspect({ ...row(), olimanager: { participantId: 'bad' } })).result, 'unverifiable');
  assert.equal((await f.inspect({ ...row(), olimanager: { participantId: '325', contestId: '99' } })).result, 'wrong_contest');
  assert.equal(f.calls.length, 0);
});

test('comparison normalizes whitespace/case/dates and identifies exact differing fields', () => {
  const remote = participant(), value = row();
  remote.competitor.members[0].name = '  SALVATORE  ';
  assert.equal(compareParticipant(value, remote, 10, 'test0001').result, 'matched');
  remote.competitor.members[0].surname = 'Other'; remote.competitor.members[0].birthDate = '2008-12-20';
  const result = compareParticipant(value, remote, 10, 'TEST0001');
  assert.equal(result.result, 'different');
  assert.deepEqual(Array.from(result.differences), ['Cognome', 'Data di nascita']);
  assert.ok(!JSON.stringify(result).includes('Other'));
  remote.competitor.school.externalId = 'WRONG';
  assert.equal(compareParticipant(value, remote, 10, 'TEST0001').result, 'wrong_school');
  remote.officialVenue.contest.id = 99;
  assert.equal(compareParticipant(value, remote, 10, 'TEST0001').result, 'wrong_contest');
});

test('missing participant requires confirmed contest permissions, denied access is not not_found', async () => {
  const missing = fixture({ nodes: [] });
  assert.equal((await missing.inspect(row())).result, 'not_found');
  assert.equal(missing.calls.length, 3);
  const denied = fixture({ allowed: false, nodes: [] });
  assert.equal((await denied.inspect(row())).result, 'unverifiable');
  assert.equal(denied.calls.length, 1);
  const revoked = fixture({ respond: (body, count) => new Response(JSON.stringify({ data: body.query.includes('Permissions')
    ? permissionData(count === 1) : { participants: { participants: { edges: [] } } } })) });
  assert.equal((await revoked.inspect(row())).result, 'unverifiable');
});

for (const [status, outcome] of [[401, 'needs_login'], [403, 'unverifiable'], [429, 'unverifiable'], [503, 'unverifiable']]) {
  test(`HTTP ${status} produces ${outcome}, never a missing participant`, async () => {
    const f = fixture({ respond: () => new Response('PRIVATE BODY', { status }) });
    const result = await f.inspect(row());
    assert.equal(result.result, outcome); assert.ok(!JSON.stringify(result).includes('PRIVATE BODY'));
  });
}

test('expired/missing delegation and changed endpoints fail without disclosing the token', async () => {
  const options = { endpoint, request() { assert.fail('No remote request'); }, wait: async () => {} };
  for (const credential of [null, { ...access, expiresAt: 1 }]) {
    const inspect = createRemoteInspector(job(), credential, options);
    assert.equal((await inspect(row(), { schema: 'test' }, {})).result, 'needs_login');
  }
  assert.throws(() => createRemoteInspector(job(), access, { ...options, endpoint: 'https://other.invalid/graphql/' }), /endpoint/);
});

test('GraphQL errors, malformed responses, and ambiguous competitors remain unverifiable', async () => {
  for (const reply of [{ errors: [{ message: 'PRIVATE' }] }, { data: {} }]) {
    const f = fixture({ respond: () => new Response(JSON.stringify(reply)) });
    const result = await f.inspect(row());
    assert.equal(result.result, 'unverifiable'); assert.ok(!JSON.stringify(result).includes('PRIVATE'));
  }
  const remote = participant(); remote.competitor.members.push({ ...remote.competitor.members[0] });
  assert.equal((await fixture({ nodes: [remote] }).inspect(row())).result, 'unverifiable');
});
