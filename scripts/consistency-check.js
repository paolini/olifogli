#!/usr/bin/env node
// Verifica (e con --fix corregge) i contatori denormalizzati dei fogli:
// nRows, nValidRows, nSyncedRows, anomalies (dalle righe) e nScanJobs,
// nScanSheetJobs (dai lavori di scansione e di generazione dei fogli).
// Le stesse regole di conteggio sono in app/graphql/resolvers/rowTrash.ts
// (rowCounters) e nella mutation recountSheet.

// Carica le variabili d'ambiente dal file .env
try {
  require('dotenv').config();
} catch {
  // dotenv non installato: ignora in produzione
}

const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('MONGODB_URI is not defined. Please set it in your environment.');
  process.exit(1);
}

// Controlla se è stata richiesta la correzione automatica
const args = process.argv.slice(2);
const shouldFix = args.includes('--fix') || args.includes('-f');

const COUNTERS = ['nRows', 'nValidRows', 'nSyncedRows', 'anomalies', 'nScanJobs', 'nScanSheetJobs'];

async function countBySheet(collection, pipeline) {
  const result = new Map();
  for (const entry of await collection.aggregate(pipeline).toArray()) result.set(entry._id.toString(), entry);
  return result;
}

async function main() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log('✓ Connesso a MongoDB');

    const db = client.db();
    const sheetsCollection = db.collection('sheets');

    const rowCounts = await countBySheet(db.collection('rows'), [{ $group: {
      _id: '$sheetId',
      nRows: { $sum: 1 },
      nValidRows: { $sum: { $cond: [{ $in: [{ $ifNull: ['$error', ''] }, ['']] }, 1, 0] } },
      nSyncedRows: { $sum: { $cond: [{ $ifNull: ['$olimanager.resultsUpdatedOn', false] }, 1, 0] } },
      anomalies: { $sum: { $ifNull: ['$anomalies', 0] } },
    } }]);
    const scanJobs = await countBySheet(db.collection('scan_jobs'), [{ $group: { _id: '$sheetId', n: { $sum: 1 } } }]);
    const scanSheetJobs = await countBySheet(db.collection('scan_sheet_jobs'), [{ $group: { _id: '$sheetId', n: { $sum: 1 } } }]);

    const sheets = await sheetsCollection.find({}).toArray();
    console.log(`\nVerifica di ${sheets.length} sheets...`);
    console.log(shouldFix ? 'Modalità FIX attiva: gli errori verranno corretti automaticamente\n' : '');

    let errors = 0;
    let fixed = 0;

    for (const sheet of sheets) {
      const id = sheet._id.toString();
      const rows = rowCounts.get(id);
      const actual = {
        nRows: rows?.nRows ?? 0,
        nValidRows: rows?.nValidRows ?? 0,
        nSyncedRows: rows?.nSyncedRows ?? 0,
        anomalies: rows?.anomalies ?? 0,
        nScanJobs: scanJobs.get(id)?.n ?? 0,
        nScanSheetJobs: scanSheetJobs.get(id)?.n ?? 0,
      };
      const $set = {};
      for (const counter of COUNTERS) {
        const stored = sheet[counter] ?? null;
        if (stored === actual[counter]) continue;
        errors++;
        console.error(stored === null
          ? `❌ Sheet "${sheet.name}" (${id}): campo ${counter} mancante (valore effettivo ${actual[counter]})`
          : `❌ Sheet "${sheet.name}" (${id}): ${counter}=${stored} ma il valore effettivo è ${actual[counter]} (diff: ${actual[counter] - stored})`);
        $set[counter] = actual[counter];
      }
      if (shouldFix && Object.keys($set).length > 0) {
        await sheetsCollection.updateOne({ _id: sheet._id }, { $set });
        fixed += Object.keys($set).length;
        console.log(`   ✓ Corretto: ${Object.entries($set).map(([k, v]) => `${k}=${v}`).join(', ')}`);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('RIEPILOGO:');
    console.log(`  Sheets verificati: ${sheets.length}`);
    console.log(`  Errori trovati: ${errors}`);
    if (shouldFix) console.log(`  Errori corretti: ${fixed}`);

    if (errors === 0) {
      console.log('\n✅ Tutti i contatori sono corretti!');
    } else if (shouldFix && fixed === errors) {
      console.log(`\n✅ Corretti ${fixed} errori di consistenza!`);
    } else {
      console.log('\n⚠️  Sono stati trovati problemi di coerenza.');
      console.log('   Esegui "npm run consistency-check -- --fix" per correggere automaticamente.');
      process.exitCode = 1;
    }
  } catch (error) {
    console.error('Errore durante la verifica:', error?.message ?? 'errore sconosciuto');
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}

main();
