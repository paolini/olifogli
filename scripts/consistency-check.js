#!/usr/bin/env node
// Script per verificare la coerenza dei dati nel database

// Carica le variabili d'ambiente dal file .env
try {
  require('dotenv').config();
} catch (e) {
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

async function main() {
  const client = new MongoClient(MONGODB_URI);
  
  try {
    await client.connect();
    console.log('✓ Connesso a MongoDB');
    
    const db = client.db();
    const sheetsCollection = db.collection('sheets');
    const rowsCollection = db.collection('rows');
    
    const sheets = await sheetsCollection.find({}).toArray();
    console.log(`\nVerifica di ${sheets.length} sheets...`);
    if (shouldFix) {
      console.log('Modalità FIX attiva: gli errori verranno corretti automaticamente\n');
    } else {
      console.log('');
    }
    
    let errors = 0;
    let warnings = 0;
    let checked = 0;
    let fixed = 0;
    
    for (const sheet of sheets) {
      checked++;
      
      // Conta le righe effettive
      const actualNRows = await rowsCollection.countDocuments({ sheetId: sheet._id });
      const actualNValidRows = await rowsCollection.countDocuments({
        sheetId: sheet._id,
        $or: [
          { error: '' },
          { error: { $exists: false } }
        ]
      });
      
      // Verifica nRows
      const storedNRows = sheet.nRows ?? null;
      const storedNValidRows = sheet.nValidRows ?? null;
      
      // Controllo nRows
      if (storedNRows === null) {
        console.error(`❌ Sheet "${sheet.name}" (${sheet._id}): campo nRows mancante`);
        errors++;
        if (shouldFix) {
          await sheetsCollection.updateOne(
            { _id: sheet._id },
            { $set: { nRows: actualNRows } }
          );
          console.log(`   ✓ Corretto: nRows impostato a ${actualNRows}`);
          fixed++;
        }
      } else if (storedNRows !== actualNRows) {
        console.error(`❌ Sheet "${sheet.name}" (${sheet._id}): nRows=${storedNRows} ma ci sono ${actualNRows} righe effettive (diff: ${actualNRows - storedNRows})`);
        errors++;
        if (shouldFix) {
          await sheetsCollection.updateOne(
            { _id: sheet._id },
            { $set: { nRows: actualNRows } }
          );
          console.log(`   ✓ Corretto: nRows aggiornato da ${storedNRows} a ${actualNRows}`);
          fixed++;
        }
      }
      
      // Controllo nValidRows
      if (storedNValidRows === null) {
        console.error(`❌ Sheet "${sheet.name}" (${sheet._id}): campo nValidRows mancante`);
        errors++;
        if (shouldFix) {
          await sheetsCollection.updateOne(
            { _id: sheet._id },
            { $set: { nValidRows: actualNValidRows } }
          );
          console.log(`   ✓ Corretto: nValidRows impostato a ${actualNValidRows}`);
          fixed++;
        }
      } else if (storedNValidRows !== actualNValidRows) {
        console.error(`❌ Sheet "${sheet.name}" (${sheet._id}): nValidRows=${storedNValidRows} ma ci sono ${actualNValidRows} righe valide effettive (diff: ${actualNValidRows - storedNValidRows})`);
        errors++;
        if (shouldFix) {
          await sheetsCollection.updateOne(
            { _id: sheet._id },
            { $set: { nValidRows: actualNValidRows } }
          );
          console.log(`   ✓ Corretto: nValidRows aggiornato da ${storedNValidRows} a ${actualNValidRows}`);
          fixed++;
        }
      }
      
      // Mostra progresso ogni 100 sheet
      if (checked % 100 === 0) {
        console.log(`   Verificati ${checked}/${sheets.length} sheets...`);
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('RIEPILOGO:');
    console.log(`  Sheets verificati: ${checked}`);
    console.log(`  Errori trovati: ${errors}`);
    if (shouldFix && fixed > 0) {
      console.log(`  Errori corretti: ${fixed}`);
    }
    console.log(`  Avvisi: ${warnings}`);
    
    if (errors === 0 && warnings === 0) {
      console.log('\n✅ Tutti i contatori sono corretti!');
      process.exit(0);
    } else if (shouldFix && fixed > 0) {
      console.log(`\n✅ Corretti ${fixed} errori di consistenza!`);
      if (errors > fixed) {
        console.log(`⚠️  Rimangono ancora ${errors - fixed} errori da verificare.`);
        process.exit(1);
      }
      process.exit(0);
    } else {
      console.log('\n⚠️  Sono stati trovati problemi di coerenza.');
      console.log('   Esegui "npm run consistency-check -- --fix" per correggere automaticamente.');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('Errore durante la verifica:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

main();
