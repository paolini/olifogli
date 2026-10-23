const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
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

test('job subscription rejects non-admins before opening the event source and rechecks revoked privileges', async () => {
  let admin = false, opened = 0, closed = 0;
  const source = { async next() { return { done: false, value: { olimanagerJobsUpdated: true } }; },
    async return() { closed++; return { done: true }; }, [Symbol.asyncIterator]() { return this; } };
  const subscribe = load('app/graphql/resolvers/olimanagerJobsSubscription.ts', {
    '@/app/lib/pubsub': { TOPICS: { OLIMANAGER_JOBS_UPDATED: 'jobs' }, pubsub: {
      asyncIterator(topic) { assert.equal(topic, 'jobs'); opened++; return source; },
    } },
    './utils': { async get_authenticated_user() { return { isAdmin: admin }; },
      check_admin(user) { if (!user.isAdmin) throw new Error('Forbidden'); } },
  }).default;
  await assert.rejects(subscribe(null, {}, {}), /Forbidden/);
  assert.equal(opened, 0);
  admin = true;
  const iterator = await subscribe(null, {}, {});
  assert.equal((await iterator.next()).value.olimanagerJobsUpdated, false); // initial refresh/reconnect
  assert.equal((await iterator.next()).value.olimanagerJobsUpdated, true);
  admin = false;
  await assert.rejects(iterator.next(), /Forbidden/);
  assert.equal(closed, 1);
});

test('MongoDB watcher filters visible changes and publishes only an invalidation signal', async () => {
  const handlers = {}, failures = [];
  let pipeline, publications = 0;
  const stream = { on(name, callback) { handlers[name] = callback; return this; } };
  const db = { collection(name) { assert.equal(name, 'olimanager_jobs'); return {
    watch(value) { pipeline = JSON.parse(JSON.stringify(value)); return stream; },
  }; } };
  const { watchOlimanagerJobs } = load('app/lib/olimanagerJobEvents.ts');
  assert.equal(watchOlimanagerJobs(db, async (...args) => { assert.equal(args.length, 0); publications++; }, error => failures.push(error)), stream);
  const encoded = JSON.stringify(pipeline);
  assert.ok(encoded.includes('updateDescription.updatedFields.status'));
  assert.ok(encoded.includes('updateDescription.updatedFields.succeededRows'));
  assert.ok(!encoded.includes('leaseExpiresAt'));
  handlers.change({ fullDocument: { private: 'must not escape' } });
  await Promise.resolve();
  assert.equal(publications, 1);
  handlers.error('test failure');
  assert.deepEqual(failures, ['test failure']);
});
