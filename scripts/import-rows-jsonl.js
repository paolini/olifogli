// scripts/import-rows-jsonl.js
try {
  require('dotenv').config();
} catch (e) {
  // dotenv non installato: ignora in produzione
}
const { MongoClient, ObjectId } = require('mongodb');
const readline = require('readline');

async function readStdin() {
  return new Promise((resolve, reject) => {
    const lines = [];
    const rl = readline.createInterface({
      input: process.stdin,
      crlfDelay: Infinity
    });
    
    rl.on('line', (line) => {
      if (line.trim()) {
        try {
          lines.push(JSON.parse(line));
        } catch (e) {
          console.error(`Errore nel parsing della riga: ${line}`);
          console.error(e.message);
        }
      }
    });
    
    rl.on('close', () => resolve(lines));
    rl.on('error', reject);
  });
}

async function main() {
  const [,, workbookId, schema] = process.argv;
  if (!workbookId) {
    console.error('Usage: node scripts/import-rows-jsonl.js <workbookId> <schema> < input.jsonl');
    console.error('Example: node scripts/import-rows-jsonl.js 68ee3b9965595f7f38e4db97 archimede-biennio < data.jsonl');
    process.exit(1);
  }
  if (!ObjectId.isValid(workbookId)) {
    console.error('Invalid workbookId');
    process.exit(1);
  }
  if (!schema) {
    console.error('Schema is required (e.g., archimede-triennio, archimede-biennio, ammissione_senior, scuole)');
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
  
  // Ottieni ownerId dal workbook
  const workbooksCol = db.collection('workbooks');
  const workbook = await workbooksCol.findOne({ _id: new ObjectId(workbookId) });
  if (!workbook) {
    console.error('Workbook not found');
    process.exit(1);
  }
  const ownerId = workbook.ownerId;
  if (!ownerId) {
    console.error('Workbook has no ownerId');
    process.exit(1);
  }

  const jsonLines = await readStdin();
  if (!jsonLines || jsonLines.length === 0) {
    console.error('No data found in JSONL.');
    process.exit(1);
  }

  console.log(`Trovate ${jsonLines.length} righe da importare.`);

  // Carica tutti gli sheet del workbook con lo schema specificato
  const existingSheets = await sheetsCol.find({ 
    workbookId: new ObjectId(workbookId), 
    schema: schema 
  }).toArray();
  
  // Crea una mappa per accesso rapido: school_id -> sheet
  const sheetMap = new Map();
  for (const sheet of existingSheets) {
    sheetMap.set(sheet.name, sheet);
  }
  console.log(`Trovati ${sheetMap.size} sheet nel workbook ${workbookId} con schema ${schema}.`);

  const now = new Date();
  let importedCount = 0;
  let createdSheetsCount = 0;

  for (const record of jsonLines) {
    // Estrai participationId
    const participationId = record.participationId;
    if (!participationId) {
      console.warn('Record senza participationId, saltato:', record.id);
      continue;
    }

    // Estrai school_id dalla prima parte del participationId (fino al primo trattino)
    // Es: "AGIS00100X-archimede-biennio" -> "AGIS00100X"
    const schoolId = participationId.split('-')[0];
    if (!schoolId) {
      console.warn('Impossibile estrarre school_id da participationId:', participationId);
      continue;
    }

    // Cerca sheet esistente nella mappa usando school_id come chiave
    let sheet = sheetMap.get(schoolId);
    if (!sheet) {
      // Crea sheet se non esiste
      const sheetDoc = {
        name: schoolId,
        workbookId: new ObjectId(workbookId),
        ownerId: ownerId,
        schema: schema,
        commonData: {
          name: schoolId,
          schoolId: schoolId,
        },
        createdAt: now,
        permissions: [],
      };
      const res = await sheetsCol.insertOne(sheetDoc);
      sheet = { ...sheetDoc, _id: res.insertedId };
      sheetMap.set(schoolId, sheet); // Aggiungi alla mappa usando school_id
      createdSheetsCount++;
      console.log(`Creato sheet: ${schoolId}`);
    }

    // Prepara i dati della riga
    const userData = record.userData || {};
    const answers = record.answers || {};
    
    // Converti la data di nascita in formato gg/mm/yyyy
    let dataNascita = '';
    if (userData.birthDate) {
      try {
        const date = new Date(userData.birthDate);
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const year = date.getFullYear();
        dataNascita = `${day}/${month}/${year}`;
      } catch (e) {
        dataNascita = userData.birthDate; // Fallback al valore originale se la conversione fallisce
      }
    }
    
    const rowData = {
      surname: userData.surname || '',
      name: userData.name || '',
      classYear: userData.classYear ? userData.classYear.toString() : '',
      classSection: userData.classSection || '',
      birthDate: dataNascita,
      variant: record.variant || '',
      score: record.score !== undefined ? record.score.toString() : '',
    };

    // Aggiungi le risposte (assumendo 16 domande)
    for (let i = 1; i <= 16; i++) {
      const key = i.toString();
      const field = `r${i.toString().padStart(2, '0')}`;
      rowData[field] = answers[key] || '';
    }

    // Inserisci row
    const rowDoc = {
      sheetId: sheet._id,
      isValid: true,
      data: rowData,
      createdOn: now,
      createdBy: null,
      updatedOn: now,
      updatedBy: null,
    };
    
    await rowsCol.insertOne(rowDoc);
    importedCount++;
    
    if (importedCount % 100 === 0) {
      console.log(`Importate ${importedCount} righe...`);
    }
  }
  
  await client.close();
  console.log(`\nImport completato:`);
  console.log(`- Sheet creati: ${createdSheetsCount}`);
  console.log(`- Righe importate: ${importedCount}`);
}

main().catch(err => {
  console.error('Errore durante l\'import:', err);
  process.exit(1);
});
