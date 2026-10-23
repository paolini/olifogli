const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { test } = require('node:test');

function load(file, dependencies) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(source, { exports, Date, Map, URL, Error, AbortSignal, setTimeout, process: { env: {} }, require(id) {
    if (Object.hasOwn(dependencies, id)) return dependencies[id];
    throw new Error('Unexpected dependency: ' + id);
  } });
  return exports;
}
const endpoint = 'https://staging.example.invalid/graphql/';
const job = { endpoint, operation: 'match_or_create_participants' };
const access = { accessToken: 'synthetic-private-token', expiresAt: Date.now() / 1000 + 3600 };
const row = () => ({ data: { name: ' Ada ', surname: 'Lovelace', birthDate: '5/1/2010', classYear: '3', classSection: 'B' }, error: '' });
const sheet = { schema: 'test', commonData: {} }, workbook = { commonData: {} };
const success = (created = true, multiple = false) => ({ data: { participants: { matchOrCreateParticipant: {
  __typename: 'ParticipantMatchSuccess', participant: { pk: 325, competitor: { pk: 88 } },
  participantCreated: created, competitorCreated: created, multipleCompetitorsMatched: multiple,
} } } });
function fixture({ created = true, multiple = false, respond, credential = access } = {}) {
  const schema = { fields: [{ name: 'classYear' }], validationContext: () => ({
    contest_id: 10, school_external_id: () => 'TEST0001', absent: data => data.variant === '000',
  }) };
  const dependencies = { './schema': { schemas: { test: schema } } };
  const remote = load('app/lib/olimanagerRemoteCheck.ts', dependencies);
  const validation = load('app/lib/olimanagerJobValidation.ts', dependencies);
  const { createParticipantMatcher } = load('app/lib/olimanagerParticipantMatch.ts', {
    ...dependencies, './olimanagerRemoteCheck': remote, './olimanagerJobValidation': validation,
  });
  const calls = [];
  const options = { endpoint, wait: async () => {}, request: async (url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(url, endpoint);
    assert.equal(options.headers.Authorization, 'Bearer ' + access.accessToken);
    assert.equal(options.redirect, 'error');
    calls.push(body);
    return respond ? respond(body) : new Response(JSON.stringify(success(created, multiple)));
  } };
  const match = createParticipantMatcher(job, credential, options);
  return { calls, schema, match: value => match(value, sheet, workbook), createParticipantMatcher, options };
}

for (const created of [true, false]) test(`matchOrCreateParticipant returns ${created ? 'created' : 'linked'} with exact provider variables`, async () => {
  const f = fixture({ created }), value = row(), before = JSON.stringify(value);
  const result = await f.match(value);
  assert.equal(result.result, created ? 'created' : 'linked');
  assert.equal(result.participantId, '325'); assert.equal(result.contestId, '10');
  assert.equal(result.competitorId, '88'); assert.equal(result.participantCreated, created);
  assert.equal(JSON.stringify(value), before, 'worker, not the remote adapter, persists the link');
  assert.equal(f.calls.length, 1);
  assert.match(f.calls[0].query, /^mutation MatchOrCreateParticipant/);
  assert.deepEqual(f.calls[0].variables, { contestId: 10, schoolExternalId: 'TEST0001', name: 'Ada', surname: 'Lovelace',
    classYear: 11, section: 'B', birthDate: '2010-01-05' });
});

test('absent rows are skipped and encrypted/invalid rows cannot create participants', async () => {
  const f = fixture();
  assert.equal((await f.match({ ...row(), data: { variant: '000' } })).result, 'absent');
  for (const value of [{ ...row(), encrypted_data: 'private' }, { ...row(), error: 'invalid' },
    { data: { ...row().data, name: '' } }, { data: { ...row().data, classYear: '9' } },
    { data: { ...row().data, birthDate: 'not-a-date' } }]) {
    assert.equal((await f.match(value)).result, 'unverifiable');
  }
  assert.equal(f.calls.length, 0);
});

test('existing correct links are read and skipped without invoking the mutation', async () => {
  const f = fixture({ respond: body => {
    assert.match(body.query, /^query /);
    return new Response(JSON.stringify({ data: body.query.includes('Permissions')
      ? { users: { me: { isStaff: true } }, contests: { contests: [{ id: 10, edition: { olympiad: { admin: null } } }] } }
      : { participants: { participants: { edges: [{ node: { pk: 325, officialVenue: { contest: { id: 10 } },
        competitor: { pk: 88, school: { externalId: 'TEST0001' }, members: [{ name: 'Ada', surname: 'Lovelace', birthDate: '2010-01-05', classYear: 11, section: 'B' }] },
      } }] } } } }));
  } });
  const result = await f.match({ ...row(), olimanager: { participantId: '325', contestId: '10' } });
  assert.equal(result.result, 'already_linked'); assert.equal(result.participantId, '325');
  assert.equal(f.calls.length, 2);
  assert.equal((await f.match({ ...row(), olimanager: { participantId: '325', contestId: '99' } })).result, 'wrong_contest');
  assert.equal(f.calls.length, 2);
});

test('ambiguous matches retain the provider flag for manual review', async () => {
  const result = await fixture({ multiple: true }).match(row());
  assert.equal(result.result, 'created'); assert.equal(result.multipleCompetitorsMatched, true);
});

for (const status of [401, 403, 500]) test(`HTTP ${status} never fabricates a participant link`, async () => {
  const f = fixture({ respond: () => new Response('PRIVATE', { status }) });
  const result = await f.match(row());
  assert.equal(result.result, status === 401 ? 'needs_login' : 'unverifiable');
  assert.equal(result.participantId, undefined);
  assert.ok(!JSON.stringify(result).includes('PRIVATE'));
});

test('expired credentials and changed destinations cannot invoke the mutation', async () => {
  const f = fixture({ credential: { ...access, expiresAt: 1 } });
  assert.equal((await f.match(row())).result, 'needs_login');
  assert.equal(f.calls.length, 0);
  assert.throws(() => f.createParticipantMatcher(job, access, { ...f.options, endpoint: 'https://other.invalid/graphql/' }), /endpoint/);
});

test('provider validation, malformed success and network failures expose no private payload or bogus link', async () => {
  for (const reply of [{ data: { participants: { matchOrCreateParticipant: { __typename: 'OperationInfo', messages: [{ message: 'PRIVATE' }] } } } },
    { errors: [{ message: 'PRIVATE' }] }, { data: { participants: { matchOrCreateParticipant: { __typename: 'ParticipantMatchSuccess' } } } }]) {
    const result = await fixture({ respond: () => new Response(JSON.stringify(reply)) }).match(row());
    assert.equal(result.result, 'unverifiable'); assert.equal(result.participantId, undefined);
    assert.ok(!JSON.stringify(result).includes('PRIVATE'));
  }
  const result = await fixture({ respond: () => { throw new Error('PRIVATE'); } }).match(row());
  assert.equal(result.result, 'unverifiable'); assert.ok(!JSON.stringify(result).includes('PRIVATE'));
});
