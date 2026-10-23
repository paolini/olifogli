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
const node = () => ({ pk: 326, officialVenue: { contest: { id: 10 } }, competitor: { pk: 88, school: { externalId: 'TEST0001' },
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
