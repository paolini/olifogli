#!/usr/bin/env node
const DAY_MS = 86400000;

function cutoffDate(days, now = new Date()) {
  if (!/^[1-9]\d*$/.test(String(days)) || !Number.isSafeInteger(Number(days))) {
    throw new Error('--days deve essere un intero positivo');
  }
  const cutoff = new Date(now.getTime() - Number(days) * DAY_MS);
  if (!Number.isFinite(cutoff.getTime())) throw new Error('Soglia temporale non valida');
  return cutoff;
}

function parseArgs(args) {
  let days;
  let dryRun = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--days' && days === undefined) days = args[++i];
    else if (args[i] === '--dry-run' && !dryRun) dryRun = true;
    else throw new Error('Uso: npm run rows:cleanup -- --days N [--dry-run]');
  }
  cutoffDate(days);
  return { days: Number(days), dryRun };
}

async function cleanupDeletedRows(db, { days, dryRun = false, now = new Date() }) {
  const cutoff = cutoffDate(days, now);
  // Solo date BSON: documenti legacy senza una data valida restano intatti.
  const filter = { deletedOn: { $type: 'date', $lt: cutoff } };
  const rows = db.collection('deleted_rows');
  const count = dryRun
    ? await rows.countDocuments(filter)
    : (await rows.deleteMany(filter)).deletedCount;
  return { event: 'rows.cleanup', dryRun, retentionDays: Number(days), cutoff: cutoff.toISOString(), count };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  require('dotenv/config');
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI mancante');
  const { MongoClient } = require('mongodb');
  const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  try {
    await client.connect();
    console.log(JSON.stringify(await cleanupDeletedRows(client.db(), options)));
  } finally {
    await client.close();
  }
}

if (require.main === module) main().catch(() => {
  // Non stampare URI, credenziali, dati delle righe o errori grezzi.
  console.error('Pulizia fallita: verificare --days N (intero positivo), [--dry-run], MONGODB_URI e accesso al database.');
  process.exitCode = 1;
});

module.exports = { cutoffDate, parseArgs, cleanupDeletedRows };
