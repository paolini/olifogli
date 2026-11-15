const assert = require('node:assert/strict');
const { test } = require('node:test');
const { runWorkerLoop } = require('../app/lib/workerLoop.ts');

function harness(results, { once = false } = {}) {
  const errors = [], delays = [];
  let calls = 0, stop = false;
  const done = runWorkerLoop({
    once,
    shouldStop: () => stop,
    delay: async ms => { delays.push(ms); },
    onError: (error, failures) => errors.push([error.message, failures]),
    iteration: async () => {
      const result = results[calls++];
      if (calls >= results.length) stop = true;
      if (result instanceof Error) throw result;
      return result;
    },
  });
  return { done, errors, delays, calls: () => calls };
}

test('regression #74: an error in one iteration does not stop the worker', async () => {
  const h = harness([new Error('job failed'), true, false]);
  await h.done;
  assert.equal(h.calls(), 3);
  assert.deepEqual(h.errors, [['job failed', 1]]);
});

test('consecutive failures back off up to the maximum, and success resets the count', async () => {
  const failures = Array.from({ length: 7 }, (_, i) => new Error(`e${i}`));
  const h = harness([...failures, true, new Error('again'), false]);
  await h.done;
  assert.deepEqual(h.delays.slice(0, 7), [1000, 2000, 4000, 8000, 16000, 30000, 30000]);
  assert.deepEqual(h.errors.at(-1), ['again', 1]);
});

test('an idle worker waits before polling again', async () => {
  const h = harness([false, false]);
  await h.done;
  assert.deepEqual(h.delays, [1000]);
});

test('--once runs one iteration and reports errors to the caller', async () => {
  assert.equal(await harness([true], { once: true }).done, true);
  await assert.rejects(harness([new Error('boom')], { once: true }).done, /boom/);
});
