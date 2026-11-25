const { test } = require('node:test');
const assert = require('node:assert/strict');
const { cutoffDate, parseArgs, cleanupDeletedRows } = require('../scripts/cleanup-deleted-rows.cjs');

test('richiede una durata esplicita e rifiuta opzioni e durate non valide', () => {
  for (const args of [[], ['--days'], ['--days', '0'], ['--days', '-1'], ['--days', '1.5'],
    ['--days', 'Infinity'], ['--days', '9007199254740991'], ['--days', '30', '--force'],
    ['--days', '30', '--days', '60']]) {
    assert.throws(() => parseArgs(args));
  }
  assert.deepEqual(parseArgs(['--dry-run', '--days', '30']), { days: 30, dryRun: true });
  assert.equal(cutoffDate(1, new Date('2026-03-30T10:00:00Z')).toISOString(), '2026-03-29T10:00:00.000Z');
});

test('anteprima e cancellazione limitate alle righe scadute con data BSON', async () => {
  const now = new Date('2026-11-25T12:00:00Z');
  const cutoff = new Date('2026-10-26T12:00:00Z');
  const documents = [
    { deletedOn: new Date(cutoff.getTime() - 1) },
    { deletedOn: cutoff },
    { deletedOn: now },
    {}, { deletedOn: null }, { deletedOn: '2020-01-01' },
  ];
  let deletions = 0;
  function matches(filter) {
    assert.deepEqual(filter, { deletedOn: { $type: 'date', $lt: cutoff } });
    return documents.filter(row => row.deletedOn instanceof Date && row.deletedOn < filter.deletedOn.$lt);
  }
  const db = { collection(name) {
    assert.equal(name, 'deleted_rows');
    return {
      async countDocuments(filter) { return matches(filter).length; },
      async deleteMany(filter) {
        deletions++;
        const expired = matches(filter);
        for (const row of expired) documents.splice(documents.indexOf(row), 1);
        return { deletedCount: expired.length };
      },
    };
  } };
  assert.equal((await cleanupDeletedRows(db, { days: 30, dryRun: true, now })).count, 1);
  assert.equal(deletions, 0);
  assert.equal(documents.length, 6);
  assert.equal((await cleanupDeletedRows(db, { days: 30, now })).count, 1);
  assert.equal(documents.length, 5);
  assert.equal((await cleanupDeletedRows(db, { days: 30, now })).count, 0);
});
