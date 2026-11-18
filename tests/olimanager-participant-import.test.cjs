const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { MongoClient, ObjectId } = require('mongodb');
const ts = require('typescript');

function load(file, dependencies = {}) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(path.resolve(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(source, { exports, Date, Map, Set, URL, Error, AbortSignal, setTimeout, process: { env: {} },
    fetch() { assert.fail('No remote calls'); }, require(id) {
      if (Object.hasOwn(dependencies, id)) return dependencies[id];
      if (id === 'mongodb') return require(id);
      throw new Error('Unexpected dependency: ' + id);
    } });
  return exports;
}
const plain = value => JSON.parse(JSON.stringify(value));
const config = load('app/lib/olimanagerVenueSheetConfig.ts');
const venueNames = load('app/lib/olimanagerVenueNames.ts');
const sheetPlan = load('app/lib/olimanagerVenueSheetPlan.ts', { './olimanagerVenueSheetConfig': config });
const remote = load('app/lib/olimanagerRemoteCheck.ts', { './schema': { schemas: {} } });
// Minimal stand-in for the distrettuale schema: dates and class years are kept as given.
const FIELDS = ['surname', 'name', 'birthDate', 'codice_meccanografico', 'nome_scuola', 'città_scuola', 'classYear', 'classSection', 'shirt_size'];
const schemas = { distrettuale: {
  fields: FIELDS.map(name => ({ name })),
  validationContext(sheetData, workbookData) { if (workbookData.broken) throw new Error('bad configuration'); return {}; },
  clean: data => ({ ...data }),
  computeDerivedData: data => ({ data, error: data.surname ? '' : 'Cognome mancante', anomalies: data.shirt_size ? 0 : 1 }),
} };
const appLogs = [];
const core = load('app/lib/olimanagerJobs.ts', { './appLog': { appLog: (event, fields) => appLogs.push({ event, fields }) } });
const imports = load('app/lib/olimanagerParticipantImport.ts', {
  './olimanagerRemoteCheck': remote, './olimanagerVenueNames': venueNames, './olimanagerVenueSheetConfig': config,
  './olimanagerVenueSheetPlan': sheetPlan, './schema': { schemas },
});

function participant(pk, venue, overrides = {}) {
  return { pk, officialVenue: { id: venue },
    competitor: { school: { externalId: 'PIPS0001', name: 'Liceo Test', location: { city: { name: 'Pisa' } } },
      members: [{ name: 'Ada', surname: `Rossi${pk}`, birthDate: '2008-03-07', classYear: 11, section: 'B' }] },
    extraFieldEntries: [{ field: { fieldName: 'Punteggio Archimede' }, value: '80' }, { field: { fieldName: 'Taglia maglietta' }, value: 'm' }],
    ...overrides };
}

test('venues map to district sheet names; subvenues follow their parent', () => {
  const zones = [{ name: 'Distretto di Pisa' }, { name: 'Distretto di Lucca' }];
  const names = venueNames.venueSheetNames([
    { id: 1, name: 'Distretto di Pisa', parentVenue: null },
    { id: 2, name: 'Distretto di Lucca (Gara distrettuale)', parentVenue: null },
    { id: 3, name: 'Aula 2', parentVenue: { id: 1 } },
    { id: 4, name: 'Distretti Esteri', parentVenue: null },
    { id: 5, name: 'Orfana', parentVenue: { id: 99 } },
  ], zones);
  assert.deepEqual(plain([...names]), [[1, 'Pisa'], [2, 'Lucca'], [3, 'Pisa'], [4, 'Distretti Esteri']]);
});

test('participant data follow the old CSV import and the target schema fields', () => {
  assert.deepEqual(plain(imports.participantRowData(participant(7, 1), new Set(FIELDS))), {
    surname: 'Rossi7', name: 'Ada', birthDate: '07/03/2008', codice_meccanografico: 'PIPS0001', nome_scuola: 'Liceo Test',
    'città_scuola': 'Pisa', classYear: '3', classSection: 'B', shirt_size: 'M',
  });
  // gara_prime has no class year nor shirt size.
  assert.deepEqual(Object.keys(imports.participantRowData(participant(7, 1), new Set(['surname', 'name', 'classSection']))), ['surname', 'name', 'classSection']);
  const pair = participant(8, 1);
  pair.competitor.members.push(pair.competitor.members[0]);
  assert.match(imports.participantRowData(pair, new Set(FIELDS)), /singola anagrafica/);
});

test('plan adds only new participants and reports, without changing, everything else', () => {
  const pisa = { _id: new ObjectId(), name: 'Pisa', commonData: { Distretto: 'Pisa' } };
  const lucca = { _id: new ObjectId(), name: 'Lucca', commonData: { Distretto: 'Lucca' } };
  const contest = { venueSheetNames: new Map([['1', 'Pisa'], ['2', 'Lucca'], ['3', 'Siena']]), participants: [
    participant(1, 1), participant(1, 1), participant(2, 1), participant(3, 2), participant(4, 3), participant(5, 9), participant(6, 2),
  ] };
  const existing = [
    { sheetId: pisa._id, olimanager: { participantId: '2' } },
    { sheetId: pisa._id, olimanager: { participantId: '6' } },
    { sheetId: lucca._id, olimanager: { participantId: '77' } },
    { sheetId: lucca._id },
  ];
  const plan = imports.planParticipantImport(contest, [pisa, lucca], existing, new Set(FIELDS));
  assert.deepEqual(plain(plan.rows.map(row => [row.participantId, row.sheetId.toString()])), [['1', pisa._id.toString()], ['3', lucca._id.toString()]]);
  assert.equal(plan.alreadyPresent, 1);
  assert.deepEqual(plain(plan.warnings), [
    'Partecipante #6: già presente nel foglio «Pisa», ma in Olimanager appartiene a «Lucca»; non importato.',
    'Distretto «Siena»: nessun foglio; 1 partecipanti non importati.',
    'Sede #9: non riconducibile a un distretto; 1 partecipanti non importati.',
    'Foglio «Lucca»: 1 righe collegate a partecipanti non più presenti nel contest.',
    'Foglio «Lucca»: 1 righe non collegate a Olimanager.',
  ]);
  const twins = imports.planParticipantImport(contest, [pisa, { ...pisa, _id: new ObjectId() }], [], new Set(FIELDS));
  assert.ok(twins.warnings.includes('Distretto «Pisa»: più fogli con lo stesso nome; 2 partecipanti non importati.'));
});

function fakeOlimanager({ pages = [[participant(1, 10)]], scope = 'ZONE', admin = {}, staff = false } = {}) {
  const calls = [];
  const query = async (document, variables) => {
    calls.push(variables);
    if (document.includes('ImportContest')) return { users: { me: { isStaff: staff } },
      contests: { contests: [{ id: 27, scope, edition: { olympiad: { id: 'olimat', admin } } }] } };
    if (document.includes('ImportZones')) return { zones: { zones: [{ name: 'Distretto di Pisa' }] } };
    if (document.includes('ImportVenues')) return { venues: { venues: [{ id: '10', name: 'Distretto di Pisa', parentVenue: null }] } };
    const index = variables.after ? Number(variables.after) : 0;
    return { participants: { participants: { edges: pages[index].map(node => ({ node })),
      pageInfo: { hasNextPage: index + 1 < pages.length, endCursor: index + 1 < pages.length ? String(index + 1) : null } } } };
  };
  return { query, calls };
}

test('reads every page of the contest and requires full visibility', async () => {
  const api = fakeOlimanager({ pages: [[participant(1, 10)], [participant(2, 10)], [participant(3, 10)]] });
  const contest = await imports.fetchContestParticipants(api.query, 27);
  assert.deepEqual(plain(contest.participants.map(p => p.pk)), [1, 2, 3]);
  assert.equal(contest.venueSheetNames.get('10'), 'Pisa');
  await assert.rejects(imports.fetchContestParticipants(fakeOlimanager({ admin: null }).query, 27), /amministratore dell’olimpiade/);
  await imports.fetchContestParticipants(fakeOlimanager({ admin: null, staff: true }).query, 27);
  await assert.rejects(imports.fetchContestParticipants(fakeOlimanager({ scope: 'SCHOOL' }).query, 27), /non è distrettuale/);
  await assert.rejects(imports.fetchContestParticipants(fakeOlimanager().query, 28), /non è disponibile/);
});

test('confirmation and cancellation require an administrator before database access', async () => {
  const db = { collection() { assert.fail('Unexpected database access'); } };
  await assert.rejects(core.confirmParticipantImport(db, null, { isAdmin: false }, new ObjectId()), /non autorizzato/);
  await assert.rejects(core.cancelParticipantImport(db, null, { isAdmin: false }, new ObjectId()), /non autorizzato/);
});

for (const name of ['requestOlimanagerImport', 'confirmOlimanagerImport', 'cancelOlimanagerImport', 'olimanagerImport']) test(`${name} requires administrator privileges`, async () => {
  const resolver = load('app/graphql/resolvers/olimanagerImport.ts', {
    '@/app/lib/mongodb': {}, '@/app/lib/olimanagerJobs': {}, '@/app/lib/olimanager': {}, '@/app/lib/olimanagerJobCredentials': {},
    '@/app/lib/olimanagerVenueSheetConfig': config,
    './utils': { async get_authenticated_user() { return { isAdmin: false }; },
      check_admin(user) { if (!user.isAdmin) throw new Error('non autorizzato'); } },
  });
  await assert.rejects(resolver[name](null, {}, {}), /non autorizzato/);
});

const integrationUri = process.env.OLIMANAGER_WORKER_TEST_URI;
test('MongoDB participant import integration', { skip: !integrationUri }, async t => {
  assert.match(integrationUri, /^mongodb:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//, 'Only local MongoDB is allowed');
  const client = new MongoClient(integrationUri, { serverSelectionTimeoutMS: 4000 });
  await client.connect();
  t.after(() => client.close());
  async function fixture(t) {
    const db = client.db('olifogli_import_test_' + new ObjectId());
    t.after(() => db.dropDatabase());
    const user = { _id: new ObjectId(), email: 'admin@example.invalid', isAdmin: true };
    const workbook = { _id: new ObjectId(), commonData: {} };
    const sheet = name => ({ _id: new ObjectId(), name, schema: 'distrettuale', workbookId: workbook._id,
      commonData: { Distretto: name, olimanager_contest_id: '27' }, permissions: [], nRows: 0, nValidRows: 0, anomalies: 0 });
    const pisa = sheet('Pisa'), lucca = sheet('Lucca');
    pisa.nRows = 1; pisa.nValidRows = 1;
    await db.collection('users').insertOne(user);
    await db.collection('workbooks').insertOne(workbook);
    await db.collection('sheets').insertMany([pisa, lucca]);
    // A row typed by hand before the import, already linked.
    await db.collection('rows').insertOne({ _id: new ObjectId(), sheetId: pisa._id, data: { surname: 'Rossi2' }, error: '', anomalies: 0,
      olimanager: { participantId: '2', error: '' } });
    const transaction = async fn => {
      const session = client.startSession();
      try { return await session.withTransaction(() => fn(session)); }
      finally { await session.endSession(); }
    };
    const contest = { venueSheetNames: new Map([['1', 'Pisa'], ['2', 'Lucca']]),
      participants: [participant(1, 1), participant(2, 1), participant(3, 2), participant(4, 2, { extraFieldEntries: [] })] };
    let fetches = 0;
    const fetchContest = async () => { fetches++; return contest; };
    const queue = () => core.queueOlimanagerJob(db, transaction, user, { sheetIds: [pisa._id, lucca._id] }, 'https://provider.invalid/graphql/',
      job => ({ _id: job._id, iv: 'x', ciphertext: 'x', tag: 'x', expiresAt: new Date(Date.now() + 3600_000) }),
      'import_participants', { workbookId: workbook._id, importSchema: 'distrettuale', importContestId: 27 });
    const run = (fetch = fetchContest) => core.runNextOlimanagerJob(db, transaction, { workerId: 'test', validate() {},
      runImport: imports.createParticipantImportRunner(fetch) });
    const job = () => db.collection('olimanager_jobs').findOne({}, { sort: { createdAt: -1 } });
    const sheetOf = s => db.collection('sheets').findOne({ _id: s._id });
    return { db, user, workbook, pisa, lucca, transaction, contest, queue, run, job, sheetOf, fetches: () => fetches };
  }

  await t.test('preview waits for confirmation, then rows and counters are created once', async t => {
    const f = await fixture(t);
    const queued = await f.queue();
    assert.equal((await f.sheetOf(f.pisa)).olimanagerJobId.toString(), queued._id.toString());
    assert.equal(await f.run(), true);
    let job = await f.job();
    assert.equal(job.status, 'awaiting_confirmation');
    assert.equal(job.totalRows, 3);
    assert.equal(job.alreadyPresentRows, 1);
    assert.deepEqual(job.warnings, []);
    assert.equal(await f.db.collection('olimanager_job_credentials').countDocuments(), 0);
    assert.equal((await f.sheetOf(f.pisa)).olimanagerJobId, undefined);
    assert.equal(await f.db.collection('rows').countDocuments(), 1);
    assert.equal(await f.run(), false, 'a preview is not picked up before confirmation');

    // A participant typed by hand after the preview is not duplicated.
    await f.db.collection('rows').insertOne({ _id: new ObjectId(), sheetId: f.lucca._id, data: { surname: 'Rossi3' }, error: '', anomalies: 0,
      olimanager: { participantId: '3', error: '' } });
    await f.db.collection('sheets').updateOne({ _id: f.lucca._id }, { $inc: { nRows: 1, nValidRows: 1 } });
    await core.confirmParticipantImport(f.db, f.transaction, f.user, job._id);
    await assert.rejects(core.confirmParticipantImport(f.db, f.transaction, f.user, job._id), /non è in attesa di conferma/);
    assert.equal(await f.run(), true);
    job = await f.job();
    assert.equal(job.status, 'completed');
    assert.equal(job.succeededRows, 2);
    assert.equal(job.skippedRows, 1);
    assert.equal(f.fetches(), 1, 'rows are created without reading Olimanager again');
    const rows = await f.db.collection('rows').find({ 'olimanager.contestId': '27' }).sort({ 'data.surname': 1 }).toArray();
    assert.deepEqual(rows.map(row => [row.data.surname, row.data.classYear, row.data.shirt_size, row.olimanager.participantId]),
      [['Rossi1', '3', 'M', '1'], ['Rossi4', '3', '', '4']]);
    assert.equal(rows[0].createdBy, 'admin@example.invalid');
    const pisa = await f.sheetOf(f.pisa), lucca = await f.sheetOf(f.lucca);
    assert.deepEqual([pisa.nRows, pisa.nValidRows, pisa.anomalies, pisa.olimanagerJobId], [2, 2, 0, undefined]);
    assert.deepEqual([lucca.nRows, lucca.nValidRows, lucca.anomalies], [2, 2, 1]);
    assert.equal(await f.db.collection('olimanager_job_items').countDocuments({ importData: { $exists: true } }), 0);

    // Running it again adds only participants created in the meantime.
    f.contest.participants.push(participant(5, 2));
    await f.queue();
    await f.run();
    job = await f.job();
    assert.equal(job.status, 'awaiting_confirmation');
    assert.equal(job.totalRows, 1);
    assert.equal(job.alreadyPresentRows, 4);
    f.contest.participants.pop();
    await core.cancelParticipantImport(f.db, f.transaction, f.user, job._id);
    await f.queue();
    await f.run();
    job = await f.job();
    assert.equal(job.status, 'completed', 'nothing to confirm');
    assert.equal(job.totalRows, 0);
  });

  await t.test('cancellation drops the preview and an expired delegation pauses the preview', async t => {
    const f = await fixture(t);
    await f.queue();
    await f.run(async () => { throw new remote.LoginRequired(); });
    let job = await f.job();
    assert.equal(job.status, 'needs_login');
    assert.ok((await f.sheetOf(f.pisa)).olimanagerJobId, 'sheets stay reserved while waiting for login');
    await core.cancelParticipantImport(f.db, f.transaction, f.user, job._id);
    job = await f.job();
    assert.equal(job.status, 'cancelled');
    assert.equal((await f.sheetOf(f.pisa)).olimanagerJobId, undefined);
    await f.queue();
    await f.run();
    job = await f.job();
    await core.cancelParticipantImport(f.db, f.transaction, f.user, job._id);
    assert.equal(await f.db.collection('olimanager_job_items').countDocuments(), 0);
    await assert.rejects(core.confirmParticipantImport(f.db, f.transaction, f.user, job._id), /non è in attesa/);
    await f.queue();
    await f.run(async () => { throw new remote.CheckFailed('Il contest non è distrettuale (ambito ZONE).'); });
    job = await f.job();
    assert.equal(job.status, 'failed');
    assert.match(job.error, /distrettuale/);
    assert.equal(await f.db.collection('rows').countDocuments(), 1);
  });

  await t.test('rows are not added to sheets closed or changed after the preview', async t => {
    const f = await fixture(t);
    await f.queue();
    await f.run();
    const job = await f.job();
    await f.db.collection('sheets').updateOne({ _id: f.lucca._id }, { $set: { closed: true } });
    await core.confirmParticipantImport(f.db, f.transaction, f.user, job._id);
    await f.run();
    const finished = await f.job();
    assert.equal(finished.status, 'completed_with_errors');
    assert.deepEqual([finished.succeededRows, finished.failedRows], [1, 2]);
    assert.equal((await f.sheetOf(f.lucca)).nRows, 0);
    assert.equal(await f.db.collection('rows').countDocuments({ sheetId: f.lucca._id }), 0);
  });
});
