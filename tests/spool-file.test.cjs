const assert = require('node:assert/strict');
const { test } = require('node:test');
const { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { ObjectId } = require('bson');

function load(file, dependencies = {}) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(source, {
    exports, process, Buffer, console,
    require: name => name in dependencies ? dependencies[name] : require(name),
  });
  return exports;
}

const spool = () => load('app/lib/spool.ts');

function tempDir(t) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'olifogli-spool-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('a staged spool file is invisible to workers until published', async t => {
  const dir = path.join(tempDir(t), 'spool');
  const staged = await spool().stageSpoolFile(dir, 'archimede_biennio-abc.pdf', Buffer.from('%PDF'));

  // oliscan takes *.pdf, olisheet *.jsonl: the staged name matches neither.
  assert.deepEqual(readdirSync(dir).filter(name => name.endsWith('.pdf')), []);

  await staged.publish();
  assert.deepEqual(readdirSync(dir), ['archimede_biennio-abc.pdf']);
  assert.equal(readFileSync(path.join(dir, 'archimede_biennio-abc.pdf'), 'utf8'), '%PDF');
});

test('a discarded spool file leaves the directory empty', async t => {
  const dir = tempDir(t);
  const staged = await spool().stageSpoolFile(dir, 'gara_prime-abc.jsonl', '{}');
  await staged.discard();
  await staged.discard();
  assert.deepEqual(readdirSync(dir), []);
});

function uploadFixture(t, { failTransaction = false, failWrite = false } = {}) {
  const dir = tempDir(t);
  // A regular file where the spool directory should be makes staging fail.
  if (failWrite) writeFileSync(path.join(dir, 'spool-is-a-file'), '');
  const spoolDir = failWrite ? path.join(dir, 'spool-is-a-file') : dir;
  const sheet = { _id: new ObjectId(), schema: 'archimede_biennio', name: 'Liceo' };
  const committed = { jobs: [], counter: 0 };
  const diagnostics = [];
  const appLogs = [];

  function withTransaction(callback) {
    const pending = { jobs: [], counter: 0 };
    const session = { pending };
    return callback(session).then(() => {
      if (failTransaction) throw new Error('transaction aborted');
      committed.jobs.push(...pending.jobs);
      committed.counter += pending.counter;
    });
  }
  const jobs = {
    insertOne: async (doc, { session }) => { session.pending.jobs.push(doc); return { acknowledged: true, insertedId: doc._id }; },
    deleteOne: async (filter, { session }) => { session.pending.jobs.push({ deleted: filter._id }); },
  };
  const sheets = {
    findOne: async () => sheet,
    updateOne: async (_, update, { session }) => { session.pending.counter += update.$inc.nScanJobs; },
  };

  process.env.SCANS_SPOOL_DIR = spoolDir;
  process.env.NEXTAUTH_SECRET ||= 'test-secret';
  const route = load('app/api/upload/route.ts', {
    'next/server': { NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) } },
    '../../lib/logging': { logDiagnostic: event => diagnostics.push(event) },
    '@/app/graphql/types': { get_context: async () => ({}) },
    '@/app/lib/mongodb': { getScanJobsCollection: async () => jobs, getSheetsCollection: async () => sheets, withTransaction },
    '@/app/graphql/resolvers/utils': { get_authenticated_user: async () => ({ _id: new ObjectId() }), check_user_can_edit_rows: () => {} },
    '@/app/lib/schema': { schemas: { archimede_biennio: { name: 'archimede_biennio' } } },
    '@/app/lib/spool': spool(),
    '@/app/lib/appLog': { appLog: (event, fields, options) => appLogs.push({ event, fields, userId: options?.userId }) },
  });
  const file = { type: 'application/pdf', arrayBuffer: async () => new TextEncoder().encode('%PDF-1.7').buffer };
  const request = { formData: async () => new Map([['file', file], ['sheetId', sheet._id.toString()]]) };
  return { post: () => route.POST(request), spoolDir, committed, diagnostics, appLogs };
}

test('upload publishes the PDF under the id of the committed job', async t => {
  const fixture = uploadFixture(t);
  const response = await fixture.post();

  assert.equal(response.status, 200);
  assert.equal(fixture.committed.jobs.length, 1);
  assert.equal(fixture.committed.counter, 1);
  const jobId = fixture.committed.jobs[0]._id.toString();
  assert.equal(response.body.jobId, jobId);
  assert.deepEqual(readdirSync(fixture.spoolDir), [`archimede_biennio-${jobId}.pdf`]);
  assert.equal(fixture.appLogs.length, 1);
  assert.equal(fixture.appLogs[0].event, 'scan.uploaded');
  assert.equal(fixture.appLogs[0].fields.jobId, jobId);
  assert.ok(fixture.appLogs[0].userId);
});

test('a failed transaction leaves no file for oliscan', async t => {
  const fixture = uploadFixture(t, { failTransaction: true });
  const response = await fixture.post();

  assert.equal(response.status, 500);
  assert.deepEqual(fixture.committed, { jobs: [], counter: 0 });
  assert.deepEqual(readdirSync(fixture.spoolDir), []);
  assert.deepEqual(fixture.appLogs, []);
});

test('a failed write creates no job and does not change the counter', async t => {
  const fixture = uploadFixture(t, { failWrite: true });
  const response = await fixture.post();

  assert.equal(response.status, 500);
  assert.deepEqual(fixture.committed, { jobs: [], counter: 0 });
  assert.deepEqual(fixture.diagnostics, ['app/api/upload/route.error_writing_file']);
});
