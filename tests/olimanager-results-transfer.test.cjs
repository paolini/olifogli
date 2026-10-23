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
const access = { accessToken: 'synthetic-private-token', expiresAt: Date.now() / 1000 + 3600 };
const job = { endpoint, operation: 'update_results' };
const row = () => ({ data: { name: 'Ada', surname: 'Lovelace', birthDate: '05/01/2010', classYear: '3', classSection: 'B', score: '10' },
  olimanager: { participantId: '326', contestId: '10' }, error: '' });
const scores = () => [5, 0, null, 5].map((score, index) => ({ participantId: 326, problemIndex: index + 1, score, disqualified: index === 1 }));
const node = () => ({ pk: 326, problemResults: [], result: { totalScore: null }, officialVenue: { contest: { id: 10 } }, competitor: { pk: 88, school: { externalId: 'TEST0001' },
  members: [{ name: 'Ada', surname: 'Lovelace', birthDate: '2010-01-05', classYear: 11, section: 'B' }] } });
const success = { data: { participants: { bulkUpdateResults: { __typename: 'BulkUpdateResultsSuccess', nothing: null } } } };
function fixture({ results = scores(), participant = node(), allowed = true, respond, credential = access, mutation = success } = {}) {
  const schema = { fields: [{ name: 'classYear' }], extract_olimanager_results: () => results,
    validationContext: () => ({ contest_id: 10, school_external_id: () => 'TEST0001', absent: data => data.variant === '000' }) };
  const dependencies = { './schema': { schemas: { test: schema } } };
  const remote = load('app/lib/olimanagerRemoteCheck.ts', dependencies);
  const validation = load('app/lib/olimanagerJobValidation.ts', dependencies);
  const { createResultsSender } = load('app/lib/olimanagerResultsTransfer.ts', {
    ...dependencies, './olimanagerRemoteCheck': remote, './olimanagerJobValidation': validation,
  });
  let time = Date.now();
  const calls = [], waits = [];
  const options = { endpoint, now: () => time, wait: async ms => { waits.push(ms); time += ms; }, request: async (url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(url, endpoint); assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, 'Bearer ' + access.accessToken);
    calls.push(body);
    if (respond) return respond(body);
    const data = body.query.includes('Permissions')
      ? { users: { me: { isStaff: allowed } }, contests: { contests: [{ id: 10, edition: { olympiad: { admin: null } } }] } }
      : { participants: { participants: { edges: participant ? [{ node: participant }] : [] } } };
    return new Response(JSON.stringify(body.query.startsWith('mutation ') ? mutation : { data }));
  } };
  const send = createResultsSender(job, credential, options);
  return { calls, waits, schema, send: value => send(value, { schema: 'test', commonData: {} }, { commonData: {} }), createResultsSender, options };
}

test('checks link and sends exact absolute scores using OAuth, with shared request pacing', async () => {
  const f = fixture(), value = row(), before = JSON.stringify(value);
  const result = await f.send(value);
  assert.equal(result.result, 'results_updated'); assert.equal(result.participantId, '326'); assert.equal(result.contestId, '10');
  assert.equal(f.calls.length, 3);
  assert.match(f.calls[0].query, /^query OlimanagerCheckPermissions/);
  assert.match(f.calls[1].query, /^query OlimanagerCheckParticipant/);
  assert.match(f.calls[2].query, /^mutation BulkUpdateResults/);
  assert.deepEqual(f.calls[2].variables, { contestId: 10, problemResults: scores() });
  assert.deepEqual(f.waits, [250, 250]);
  assert.equal(JSON.stringify(value), before, 'the worker persists success only after receiving the result');
  await f.send(value);
  assert.deepEqual(f.calls.at(-1).variables, f.calls[2].variables, 'replay overwrites with the same absolute scores');
  assert.equal(f.calls.filter(call => call.query.includes('Permissions')).length, 1);
});

test('absent rows are skipped without a remote request', async () => {
  const f = fixture();
  assert.equal((await f.send({ data: { variant: '000' } })).result, 'absent');
  assert.equal(f.calls.length, 0);
});

test('invalid rows, links, totals and problem payloads are rejected before any remote call', async () => {
  for (const value of [{ ...row(), encrypted_data: 'PRIVATE' }, { ...row(), error: 'invalid' },
    { ...row(), olimanager: {} }, { ...row(), olimanager: { participantId: '326bad' } },
    { ...row(), data: { ...row().data, score: '10bad' } }, { ...row(), data: { ...row().data, score: '11' } }]) {
    const f = fixture();
    assert.equal((await f.send(value)).result, 'unverifiable'); assert.equal(f.calls.length, 0);
  }
  const wrongContest = fixture();
  assert.equal((await wrongContest.send({ ...row(), olimanager: { participantId: '326', contestId: '99' } })).result, 'wrong_contest');
  assert.equal(wrongContest.calls.length, 0);
  for (const results of [[], [{ ...scores()[0], participantId: 999 }], [{ ...scores()[0], problemIndex: 0 }],
    [scores()[0], scores()[0]], [{ ...scores()[0], score: NaN }], [{ ...scores()[0], score: 1.5 }],
    [{ ...scores()[0], disqualified: 'false' }]]) {
    const f = fixture({ results });
    assert.equal((await f.send(row())).result, 'unverifiable'); assert.equal(f.calls.length, 0);
  }
  const unsupported = fixture(); unsupported.schema.extract_olimanager_results = undefined;
  assert.equal((await unsupported.send(row())).result, 'unverifiable'); assert.equal(unsupported.calls.length, 0);
});

test('missing, unauthorized or mismatched participants never receive results', async () => {
  for (const [settings, outcome] of [[{ allowed: false }, 'unverifiable'], [{ participant: null }, 'not_found'],
    [{ participant: { ...node(), officialVenue: { contest: { id: 99 } } } }, 'wrong_contest'],
    [{ participant: { ...node(), competitor: { ...node().competitor, school: { externalId: 'WRONG' } } } }, 'wrong_school'],
    [{ participant: { ...node(), competitor: { ...node().competitor, members: [{ ...node().competitor.members[0], surname: 'PRIVATE' }] } } }, 'different']]) {
    const f = fixture(settings);
    assert.equal((await f.send(row())).result, outcome);
    assert.ok(f.calls.every(call => !call.query.startsWith('mutation ')));
  }
});

for (const stage of ['read', 'mutation']) test(`HTTP 401 during ${stage} requests another login without reporting a successful transfer`, async () => {
  const f = fixture({ respond: body => {
    if (stage === 'read' || body.query.startsWith('mutation ')) return new Response('PRIVATE', { status: 401 });
    return new Response(JSON.stringify({ data: body.query.includes('Permissions')
      ? { users: { me: { isStaff: true } }, contests: { contests: [{ id: 10, edition: { olympiad: { admin: null } } }] } }
      : { participants: { participants: { edges: [{ node: node() }] } } } }));
  } });
  const result = await f.send(row());
  assert.equal(result.result, 'needs_login'); assert.ok(!JSON.stringify(result).includes('PRIVATE'));
});

test('expired credentials and changed destinations cannot send results', async () => {
  const f = fixture({ credential: { ...access, expiresAt: 1 } });
  assert.equal((await f.send(row())).result, 'needs_login'); assert.equal(f.calls.length, 0);
  assert.throws(() => f.createResultsSender(job, access, { ...f.options, endpoint: 'https://other.invalid/graphql/' }), /endpoint/);
});

test('provider validation errors, malformed successes and GraphQL errors never claim synchronization', async () => {
  for (const mutation of [{ data: { participants: { bulkUpdateResults: { __typename: 'OperationInfo', messages: [{ message: 'PRIVATE' }] } } } },
    { data: {} }, { errors: [{ message: 'PRIVATE' }] }]) {
    const result = await fixture({ mutation }).send(row());
    assert.equal(result.result, 'unverifiable'); assert.ok(!JSON.stringify(result).includes('PRIVATE'));
  }
});

function snapshot(results = scores(), totalScore = 10) {
  return { endpoint, contestId: '10', participantId: '326',
    scores: results.map(({ problemIndex, score, disqualified }) => ({ problemIndex, score, disqualified })), totalScore };
}
function withRemoteResults(results = scores(), totalScore = 10) {
  return { ...node(), problemResults: results.map(({ problemIndex, score, disqualified }) => ({ problem: { index: problemIndex }, score, disqualified })),
    result: { totalScore } };
}

test('matching results use the existing participant read and skip the mutation, establishing a legacy baseline', async () => {
  const f = fixture({ participant: withRemoteResults([...scores()].reverse()) });
  const result = await f.send(row());
  assert.equal(result.result, 'results_unchanged');
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[1].variables.includeResults, true);
  assert.match(f.calls[1].query, /problemResults @include/);
  assert.match(f.calls[1].query, /result @include/);
  assert.equal(JSON.stringify(result.resultsSnapshot), JSON.stringify(snapshot()));
});

test('a different first remote result is reported with local/remote values, without a write', async () => {
  const remote = scores(); remote[0].score = 4;
  const f = fixture({ participant: withRemoteResults(remote, 9) });
  const result = await f.send(row());
  assert.equal(result.result, 'results_conflict'); assert.equal(f.calls.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(result.resultDifferences)), [
    { field: 'Esercizio 1', localValue: '5', remoteValue: '4' }, { field: 'Totale', localValue: '10', remoteValue: '9' },
  ]);
  assert.equal(result.resultsSnapshot, undefined);
});

test('only a local change may update an unchanged remote baseline', async () => {
  const updated = scores(); updated[0].score = 4;
  const value = row(); value.data.score = '9'; value.olimanager.resultsSnapshot = snapshot();
  const f = fixture({ results: updated, participant: withRemoteResults() });
  const result = await f.send(value);
  assert.equal(result.result, 'results_updated'); assert.equal(f.calls.length, 3);
  assert.deepEqual(f.calls[2].variables.problemResults, updated);
  assert.equal(JSON.stringify(result.resultsSnapshot), JSON.stringify(snapshot(updated, 9)));
});

test('remote-only and divergent simultaneous changes preserve the shared baseline and never overwrite remote results', async () => {
  const remote = scores(); remote[0].score = 4;
  for (const changeLocal of [false, true]) {
    const local = scores(); if (changeLocal) local[3].score = 3;
    const value = row(); value.data.score = changeLocal ? '8' : '10'; value.olimanager.resultsSnapshot = snapshot();
    const before = JSON.stringify(value);
    const f = fixture({ results: local, participant: withRemoteResults(remote, 9) });
    const result = await f.send(value);
    assert.equal(result.result, 'results_conflict'); assert.equal(f.calls.length, 2);
    assert.equal(JSON.stringify(value), before);
  }
});

test('converging local and remote changes accept a new shared baseline without a mutation', async () => {
  const changed = scores(); changed[0].score = 4;
  const value = row(); value.data.score = '9'; value.olimanager.resultsSnapshot = snapshot();
  const f = fixture({ results: changed, participant: withRemoteResults(changed, 9) });
  const result = await f.send(value);
  assert.equal(result.result, 'results_unchanged'); assert.equal(f.calls.length, 2);
  assert.equal(result.resultsSnapshot.totalScore, 9);
});

test('a baseline for a different endpoint, contest or participant cannot authorize an overwrite', async () => {
  const local = scores(); local[0].score = 4;
  for (const binding of [{ endpoint: 'https://other.invalid/graphql/' }, { contestId: '99' }, { participantId: '999' }]) {
    const value = row(); value.data.score = '9'; value.olimanager.resultsSnapshot = { ...snapshot(), ...binding };
    const f = fixture({ results: local, participant: withRemoteResults() });
    assert.equal((await f.send(value)).result, 'results_conflict'); assert.equal(f.calls.length, 2);
  }
});

test('manual totals, disqualification, missing or extra exercises and zero versus null are not treated as equivalent', async () => {
  const disqualified = scores(); disqualified[0].disqualified = true;
  const zero = scores(); zero[2].score = 0;
  const swapped = scores(); swapped[0].score = 0; swapped[1].score = 5;
  for (const participant of [withRemoteResults(scores(), 99), withRemoteResults(disqualified), withRemoteResults(zero),
    withRemoteResults(scores().slice(0, -1), 5), withRemoteResults([...scores(), { participantId: 326, problemIndex: 99, score: 0, disqualified: false }]),
    withRemoteResults(swapped)]) {
    const f = fixture({ participant });
    const result = await f.send(row());
    assert.equal(result.result, 'results_conflict'); assert.ok(result.resultDifferences.length > 0);
    assert.equal(f.calls.length, 2);
  }
});

test('remote deletion after a synchronization is a conflict even when the remote is now empty', async () => {
  const value = row(); value.olimanager.resultsSnapshot = snapshot();
  const f = fixture();
  assert.equal((await f.send(value)).result, 'results_conflict'); assert.equal(f.calls.length, 2);
});

test('incomplete or malformed remote scores never permit a write', async () => {
  const duplicate = withRemoteResults(); duplicate.problemResults.push(duplicate.problemResults[0]);
  for (const participant of [{ ...node(), problemResults: undefined }, { ...node(), result: undefined }, duplicate,
    { ...node(), result: { totalScore: '10' } }, { ...node(), problemResults: [{ problem: { index: 1 }, score: 5, disqualified: 'false' }] }]) {
    const f = fixture({ participant });
    assert.equal((await f.send(row())).result, 'unverifiable'); assert.equal(f.calls.length, 2);
  }
});

test('a removed local exercise cannot leave an unnoticed remote score even if the baseline matches', async () => {
  const local = scores().slice(0, -1), value = row(); value.data.score = '5'; value.olimanager.resultsSnapshot = snapshot();
  const f = fixture({ results: local, participant: withRemoteResults() });
  assert.equal((await f.send(value)).result, 'results_conflict'); assert.equal(f.calls.length, 2);
});
