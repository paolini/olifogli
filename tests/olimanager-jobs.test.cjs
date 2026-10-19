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
  vm.runInNewContext(source, { exports, Date, Map, URL, Error, fetch() { assert.fail('No remote calls during checks'); }, require(id) {
    if (Object.hasOwn(dependencies, id)) return dependencies[id];
    if (id === 'mongodb') return require(id);
    throw new Error('Unexpected dependency: ' + id);
  } });
  return exports;
}
const core = load('app/lib/olimanagerJobs.ts');

test('queue rejects non-admin users and empty selections before accessing MongoDB', async () => {
  const db = { collection() { assert.fail('Unexpected database access'); } };
  await assert.rejects(core.queueOlimanagerCheck(db, null, { isAdmin: false }, {}, 'https://provider.invalid/graphql/'), /non autorizzato/);
  await assert.rejects(core.queueOlimanagerCheck(db, null, { isAdmin: true }, {}, 'https://provider.invalid/graphql/'), /Selezionare/);
});

test('local validation checks configuration, identity availability and existing row errors', () => {
  let contest = 10, school = 'TEST0001';
  const { validateOlimanagerJobRow } = load('app/lib/olimanagerJobValidation.ts', {
    './schema': { schemas: { test: { validationContext() { return { contest_id: contest, school_external_id: () => school }; } } } },
  });
  const row = { data: {}, error: '' }, sheet = { schema: 'test', commonData: {} }, workbook = { commonData: {} };
  assert.doesNotThrow(() => validateOlimanagerJobRow(row, sheet, workbook));
  contest = NaN;
  assert.throws(() => validateOlimanagerJobRow(row, sheet, workbook), /ID gara/);
  contest = 10; school = '';
  assert.throws(() => validateOlimanagerJobRow(row, sheet, workbook), /meccanografico/);
  school = 'TEST0001';
  assert.throws(() => validateOlimanagerJobRow({ ...row, encrypted_data: 'private' }, sheet, workbook), /criptata/);
  assert.throws(() => validateOlimanagerJobRow({ ...row, error: 'campo mancante' }, sheet, workbook), /campo mancante/);
});

test('active job prevents reopening a sheet', async () => {
  let writes = 0;
  const { default: openSheet } = load('app/graphql/resolvers/openSheet.ts', {
    '@/app/lib/mongodb': { async getSheetsCollection() { return {
      async findOne() { return { _id: new ObjectId(), olimanagerJobId: new ObjectId() }; },
      async updateOne() { writes++; },
    }; } },
    './utils': { async get_authenticated_user() { return { isAdmin: true }; }, check_user_is_sheet_admin() {} },
  });
  await assert.rejects(openSheet(null, { _id: new ObjectId() }, {}), /lavoro Olimanager/);
  assert.equal(writes, 0);
});

for (const name of ['requestOlimanagerCheck', 'olimanagerJobs', 'olimanagerJobItems']) test(`${name} requires administrator privileges before domain access`, async () => {
  const resolver = load('app/graphql/resolvers/olimanagerJobs.ts', {
    '@/app/lib/mongodb': {}, '@/app/lib/olimanagerJobs': {},
    './utils': { async get_authenticated_user() { return { isAdmin: false }; },
      check_admin(user) { if (!user.isAdmin) throw new Error('non autorizzato'); } },
  });
  await assert.rejects(resolver[name](null, {}, {}), /non autorizzato/);
});

for (const bulk of [false, true]) test(`active job prevents unlocking through ${bulk ? 'updateSheets' : 'unlockSheet'}`, async () => {
  let writes = 0;
  const id = new ObjectId();
  const dependencies = {
    '@/app/lib/mongodb': { async getSheetsCollection() { return {
      async findOne() { return { _id: id, locked: true, olimanagerJobId: new ObjectId() }; },
      async updateOne() { writes++; },
    }; } },
    './utils': { async get_authenticated_user() { return { isAdmin: true }; } },
  };
  const resolver = load(`app/graphql/resolvers/${bulk ? 'updateSheets' : 'unlockSheet'}.ts`, dependencies).default;
  await assert.rejects(resolver(null, bulk ? { sheets: [{ _id: id, locked: false }] } : { _id: id }, {}), /lavoro Olimanager/);
  assert.equal(writes, 0);
});

// Opt-in integration suite. Every fixture creates and drops only its own uniquely named test database.
const integrationUri = process.env.OLIMANAGER_WORKER_TEST_URI;
test('MongoDB worker integration', { skip: !integrationUri }, async t => {
  assert.match(integrationUri, /^mongodb:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//, 'Only local MongoDB is allowed');
  const client = new MongoClient(integrationUri, { serverSelectionTimeoutMS: 4000 });
  await client.connect();
  t.after(() => client.close());
  async function fixture(t, count = 3) {
    const db = client.db('olifogli_worker_test_' + new ObjectId());
    t.after(() => db.dropDatabase());
    const user = { _id: new ObjectId(), email: 'admin@example.invalid', isAdmin: true };
    const workbook = { _id: new ObjectId(), commonData: {} };
    const sheet = { _id: new ObjectId(), name: 'Test', closed: true, locked: true, workbookId: workbook._id, schema: 'test' };
    const rows = Array.from({ length: count }, () => ({ _id: new ObjectId(), sheetId: sheet._id, data: {}, error: '' }));
    await db.collection('users').insertOne(user);
    await db.collection('workbooks').insertOne(workbook);
    await db.collection('sheets').insertOne(sheet);
    await db.collection('rows').insertMany(rows);
    const transaction = async fn => {
      const session = client.startSession();
      try { return await session.withTransaction(() => fn(session)); }
      finally { await session.endSession(); }
    };
    const queue = targets => core.queueOlimanagerCheck(db, transaction, user, targets, 'https://provider.invalid/graphql/');
    const run = options => core.runNextOlimanagerCheck(db, transaction, { workerId: 'test', validate() {}, ...options });
    return { db, user, sheet, rows, queue, run };
  }
  await t.test('queued work persists while worker is stopped; union deduplicates rows and releases locks', async t => {
    const f = await fixture(t);
    const job = await f.queue({ rowIds: [f.rows[0]._id, f.rows[0]._id], sheetIds: [f.sheet._id] });
    assert.equal((await f.db.collection('olimanager_jobs').findOne()).status, 'queued');
    assert.equal(await f.db.collection('olimanager_job_items').countDocuments(), 0);
    assert.ok((await f.db.collection('sheets').findOne()).olimanagerJobId.equals(job._id));
    await assert.rejects(f.queue({ sheetIds: [f.sheet._id] }), /già un lavoro/);
    let checked = 0;
    assert.equal(await f.run({ validate() { checked++; } }), true);
    const finished = await f.db.collection('olimanager_jobs').findOne();
    assert.equal(finished.status, 'completed');
    assert.equal(finished.totalRows, 3); assert.equal(finished.succeededRows, 3);
    assert.equal(checked, 3);
    assert.equal(await f.db.collection('olimanager_job_items').countDocuments(), 3);
    assert.equal((await f.db.collection('sheets').findOne()).olimanagerJobId, undefined);
    assert.equal(await f.run(), false);
    assert.equal(await f.db.collection('rows').countDocuments({ olimanager: { $exists: true } }), 0);
  });
  await t.test('explicit selection excludes other rows and reports errors on exact items', async t => {
    const f = await fixture(t);
    await f.queue({ rowIds: [f.rows[1]._id] });
    await f.run({ validate() { throw new Error('Configurazione di prova mancante'); } });
    const job = await f.db.collection('olimanager_jobs').findOne(), item = await f.db.collection('olimanager_job_items').findOne();
    assert.equal(job.status, 'completed_with_errors'); assert.equal(job.totalRows, 1); assert.equal(job.failedRows, 1);
    assert.ok(item.rowId.equals(f.rows[1]._id));
    assert.match(item.error, /Configurazione/);
  });
  await t.test('closed but unfinalized sheets and missing rows are rejected without leaving jobs or reservations', async t => {
    const f = await fixture(t);
    await f.db.collection('sheets').updateOne({}, { $set: { locked: false } });
    await assert.rejects(f.queue({ rowIds: [f.rows[0]._id] }), /Finalizzare/);
    await assert.rejects(f.queue({ rowIds: [new ObjectId()] }), /righe/);
    assert.equal(await f.db.collection('olimanager_jobs').countDocuments(), 0);
    assert.equal((await f.db.collection('sheets').findOne()).olimanagerJobId, undefined);
  });
  await t.test('two workers cannot process the same job concurrently', async t => {
    const f = await fixture(t);
    await f.queue({ sheetIds: [f.sheet._id] });
    let checked = 0;
    await Promise.all([f.run({ workerId: 'a', validate() { checked++; } }), f.run({ workerId: 'b', validate() { checked++; } })]);
    assert.equal(checked, 3);
  });
  await t.test('worker resumes interrupted preparation without duplicate items', async t => {
    const f = await fixture(t);
    await f.queue({ rowIds: [f.rows[0]._id], sheetIds: [f.sheet._id] });
    let stops = 0;
    await f.run({ shouldStop: () => ++stops === 2 });
    assert.equal((await f.db.collection('olimanager_jobs').findOne()).status, 'preparing');
    await f.run();
    assert.equal(await f.db.collection('olimanager_job_items').countDocuments(), 3);
    assert.equal((await f.db.collection('olimanager_jobs').findOne()).succeededRows, 3);
  });
  await t.test('worker resumes after a committed batch without repeating successful rows', async t => {
    const f = await fixture(t, 205);
    await f.queue({ sheetIds: [f.sheet._id] });
    let checked = 0;
    await f.run({ validate() { checked++; }, shouldStop: () => checked >= 200 });
    assert.equal((await f.db.collection('olimanager_jobs').findOne()).succeededRows, 200);
    await f.run({ validate() { checked++; } });
    assert.equal(checked, 205);
    assert.equal((await f.db.collection('olimanager_jobs').findOne()).succeededRows, 205);
  });
  await t.test('expired lease cannot commit outcomes or release another worker’s reservation', async t => {
    const f = await fixture(t);
    await f.queue({ sheetIds: [f.sheet._id] });
    const start = Date.now(); let time = start;
    await f.run({ now: () => new Date(time), validate() { time = start + 61_000; } });
    assert.equal(await f.db.collection('olimanager_job_items').countDocuments({ status: 'pending' }), 3);
    assert.ok((await f.db.collection('sheets').findOne()).olimanagerJobId);
    await f.run({ now: () => new Date(time) });
    assert.equal((await f.db.collection('olimanager_jobs').findOne()).status, 'completed');
  });
  await t.test('revoked local administrator fails the job and releases sheets', async t => {
    const f = await fixture(t);
    await f.queue({ sheetIds: [f.sheet._id] });
    await f.db.collection('users').updateOne({}, { $set: { isAdmin: false } });
    await f.run({ validate() { assert.fail('Should not validate'); } });
    assert.equal((await f.db.collection('olimanager_jobs').findOne()).status, 'failed');
    assert.equal((await f.db.collection('sheets').findOne()).olimanagerJobId, undefined);
  });
});
