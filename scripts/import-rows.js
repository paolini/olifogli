// scripts/import-rows.js
try {
  require('dotenv').config();
} catch (e) {
  // dotenv non installato: ignora in produzione
}
const { MongoClient, ObjectId } = require('mongodb');
const Papa = require('papaparse');

async function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => data += chunk);
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

async function main() {
  const [,, workbookId] = process.argv;
  if (!workbookId) {
    console.error('Usage: node scripts/import-rows.js <workbookId> < input.csv');
    process.exit(1);
  }
  if (!ObjectId.isValid(workbookId)) {
    console.error('Invalid workbookId');
    process.exit(1);
  }
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    console.error('MONGODB_URI is not defined.');
    process.exit(1);
  }
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db();
  const sheetsCol = db.collection('sheets');
  const rowsCol = db.collection('rows');

  const csvText = await readStdin();
  const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
  if (!parsed.data || parsed.data.length === 0) {
    console.error('No data found in CSV.');
    process.exit(1);
  }

  const now = new Date();

  for (const row of parsed.data) {
    const sheetName = row.school;
    if (!sheetName) continue;
    // Cerca sheet esistente
    let sheet = await sheetsCol.findOne({ name: sheetName, workbookId: new ObjectId(workbookId) });
    if (!sheet) {
      // Crea sheet se non esiste
      const sheetDoc = {
        name: sheetName,
        workbookId: new ObjectId(workbookId),
        createdAt: now,
        permissions: [],
      };
      const res = await sheetsCol.insertOne(sheetDoc);
      sheet = { ...sheetDoc, _id: res.insertedId };
      console.log(`Creato sheet: ${sheetName}`);
    }
    // Inserisci row
    const rowDoc = {
      sheetId: sheet._id,
      isValid: true,
      data: {
        cognome: row.surname || '',
        nome: row.name || '',
        scuola: row.school || '',
        classe: row.classYear || '',
        sezione: row.classSection || '',
        dataNascita: row.birthDate || '',
        r01: row['1'] || '',
        r02: row['2'] || '',
        r03: row['3'] || '',
        r04: row['4'] || '',
        r05: row['5'] || '',
        r06: row['6'] || '',
        r07: row['7'] || '',
        r08: row['8'] || '',
        r09: row['9'] || '',
        r10: row['10'] || '',
        r11: row['11'] || '',
        r12: row['12'] || '',
        punti: row.score || '',
      },
      createdOn: now,
      createdBy: null,
      updatedOn: now,
      updatedBy: null,
    };
    await rowsCol.insertOne(rowDoc);
    console.log(`Aggiunta riga a sheet ${sheetName}`);
  }
  await client.close();
  console.log('Import completato.');
}

main();
