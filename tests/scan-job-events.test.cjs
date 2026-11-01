const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { ObjectId } = require('mongodb');

function load(file, dependencies = {}) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(source, { exports, require(id) {
    if (Object.hasOwn(dependencies, id)) return dependencies[id];
    throw new Error('Unexpected dependency: ' + id);
  } });
  return exports;
}

function fixture() {
  const streams = {}, events = [], errors = [], reads = [];
  const sheetId = new ObjectId(), jobId = new ObjectId();
  let job = { _id: jobId, sheetId };
  const db = { collection(name) { return {
    watch(pipeline, options) {
      const handlers = {};
      const stream = { pipeline, options, handlers, closed: false,
        on(event, callback) { handlers[event] = callback; return this; },
        async close() { this.closed = true; },
      };
      streams[name] = stream;
      return stream;
    },
    async findOne(query, options) { reads.push({ name, query, options }); return job; },
  }; } };
  const { watchScanJobs } = load('app/lib/scanJobEvents.ts');
  const watcher = watchScanJobs(db, async (id, kind) => { events.push({ id, kind }); }, error => errors.push(error));
  return { streams, events, errors, reads, sheetId, jobId, watcher, setJob(value) { job = value; } };
}

test('scan and PDF changes publish sheet-scoped invalidations without job data', async () => {
  const f = fixture();
  for (const [name, kind] of [['scan_jobs', 'scan'], ['scan_sheet_jobs', 'pdf']]) {
    const stream = f.streams[name];
    assert.deepEqual(Array.from(stream.pipeline[0].$match.operationType.$in), ['insert', 'update', 'replace']);
    assert.equal(stream.options.fullDocument, 'updateLookup');
    stream.handlers.change({ fullDocument: { sheetId: f.sheetId, private: 'secret' } });
    assert.deepEqual(f.events.at(-1), { id: String(f.sheetId), kind });
    stream.handlers.change({ fullDocument: null }); // Deleted before updateLookup.
    stream.handlers.change({});
  }
  assert.equal(f.events.length, 2);
  await f.watcher.close();
  assert.ok(Object.values(f.streams).every(stream => stream.closed));
});

test('late scan results refresh the owning sheet even without a job status change', async () => {
  const f = fixture();
  f.streams.scan_results.handlers.change({ fullDocument: { jobId: f.jobId, rawData: 'private' } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.reads[0].name, 'scan_jobs');
  assert.equal(f.reads[0].query._id, f.jobId);
  assert.equal(f.reads[0].options.projection.sheetId, 1);
  assert.deepEqual(f.events, [{ id: String(f.sheetId), kind: 'scan' }]);
  f.setJob(null);
  f.streams.scan_results.handlers.change({ fullDocument: { jobId: f.jobId } });
  f.streams.scan_results.handlers.change({ fullDocument: null });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.events.length, 1);
});

test('watcher and asynchronous publication errors reach diagnostics', async () => {
  const f = fixture();
  const failure = new Error('synthetic failure');
  for (const stream of Object.values(f.streams)) stream.handlers.error(failure);
  assert.deepEqual(f.errors, [failure, failure, failure]);
  const { watchScanJobs } = load('app/lib/scanJobEvents.ts');
  const handlers = {};
  const db = { collection(name) { return {
    watch() { return { on(event, callback) { handlers[name + event] = callback; }, close() {} }; },
    async findOne() { throw failure; },
  }; } };
  watchScanJobs(db, async () => { throw failure; }, error => f.errors.push(error));
  handlers.scan_jobschange({ fullDocument: { sheetId: f.sheetId } });
  handlers.scan_resultschange({ fullDocument: { jobId: f.jobId } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.errors.length, 5);
});

test('deleting scans notifies other browsers only after a successful commit', async () => {
  const order = [], jobId = new ObjectId(), sheetId = new ObjectId();
  let fail = false;
  const database = {
    async getScanJobsCollection() { return {
      async findOne() { return { _id: jobId, sheetId }; },
      async deleteOne() { order.push('delete-job'); },
    }; },
    async getScanResultsCollection() { return { async deleteMany() { order.push('delete-results'); } }; },
    async getSheetsCollection() { return { async updateOne() { order.push('update-sheet'); } }; },
    async withTransaction(run) { await run({}); if (fail) throw new Error('commit failed'); order.push('commit'); },
  };
  const remove = load('app/graphql/resolvers/deleteScan.ts', {
    '@/app/lib/mongodb': database,
    '@/app/lib/pubsub': { TOPICS: { SCAN_JOB_UPDATED: id => `scan.${id}` } },
    './utils': { async get_authenticated_user() { return {}; }, check_user_can_delete_job() {} },
  }).default;
  const context = { pubsub: { async publish(topic, payload) {
    order.push('publish');
    assert.equal(topic, `scan.${sheetId}`);
    assert.equal(payload.scanJobUpdated, true);
  } } };
  assert.equal(await remove(null, { jobId }, context), true);
  assert.deepEqual(order, ['delete-results', 'delete-job', 'update-sheet', 'commit', 'publish']);
  fail = true;
  order.length = 0;
  await assert.rejects(remove(null, { jobId }, context), /commit failed/);
  assert.ok(!order.includes('publish'));
});
