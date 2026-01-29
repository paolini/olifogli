// const { ObjectId } = require('mongodb');

module.exports = {
  /**
   * @param db {import('mongodb').Db}
   * @param client {import('mongodb').MongoClient}
   * @returns {Promise<void>}
   */
  async up(db, client) {
    const rowsCollection = db.collection('rows');
    const sheetsCollection = db.collection('sheets');

    // Workaround for BSON version mismatch between migrate-mongo and local mongodb
    // We try to get the ObjectId class directly from a retrieved document
    const sampleSheet = await sheetsCollection.findOne({});
    if (!sampleSheet) {
      console.log('No sheets found, skipping migration.');
      return;
    }
    const ObjectId = sampleSheet._id.constructor;

    console.log('Starting migration: fill nome_scuola and città_scuola in gara_prime sheets using scuole data (v2 - no ObjectId)');

    // Sheet ID specifico per le scuole - converti in ObjectId per la query
    const scuoleSheetId = new ObjectId('6958f58aa93b8a78d78876c4');
    
    // Debug: verifica se il sheet esiste
    const sheetExists = await sheetsCollection.findOne({ _id: scuoleSheetId });
    console.log('Sheet exists:', !!sheetExists, sheetExists ? { name: sheetExists.name, schema: sheetExists.schema } : 'null');

    // Ottieni tutte le righe del sheet scuole
    const scuoleRows = await rowsCollection.find({ sheetId: scuoleSheetId }).toArray();
    console.log(`Found ${scuoleRows.length} rows in scuole sheet`);
    
    if (scuoleRows.length > 0) {
      console.log('Sample row data:', JSON.stringify(scuoleRows[0].data, null, 2));
    }

    // Costruisci la mappa da Codice_meccanografico a row.data
    const scuoleMap = new Map();
    for (const row of scuoleRows) {
      const codiceMeccanografico = row.data?.Codice_meccanografico;
      const nomeScuola = row.data?.Nome_scuola;
      const cittaScuola = row.data?.Città_scuola;
      
      if (codiceMeccanografico && nomeScuola && cittaScuola && 
          typeof nomeScuola === 'string' && nomeScuola.trim() !== '' &&
          typeof cittaScuola === 'string' && cittaScuola.trim() !== '') {
        scuoleMap.set(codiceMeccanografico, row.data);
      }
    }
    console.log(`Built map with ${scuoleMap.size} entries`);

    // Ottieni tutti gli sheet con schema "gara_prime"
    const garaPrimeSheets = await sheetsCollection.find({ schema: 'gara_prime' }).toArray();
    console.log(`Found ${garaPrimeSheets.length} gara_prime sheets`);

    let totalUpdated = 0;

    for (const sheet of garaPrimeSheets) {
      console.log(`Processing sheet ${sheet.name} (${sheet._id})`);

      // Ottieni tutte le righe di questo sheet
      const rows = await rowsCollection.find({ sheetId: sheet._id }).toArray();

      let sheetUpdated = 0;

      for (const row of rows) {
        const codiceMeccanografico = row.data?.codice_meccanografico;
        if (!codiceMeccanografico) continue;

        const scuoleData = scuoleMap.get(codiceMeccanografico);
        if (!scuoleData) continue;

        const updates = {};

        // Se nome_scuola è vuoto, metti Scuola
        if ((!row.data?.nome_scuola || row.data.nome_scuola.trim() === '') && 
            scuoleData.Nome_scuola && typeof scuoleData.Nome_scuola === 'string' && scuoleData.Nome_scuola.trim() !== '') {
          updates['data.nome_scuola'] = scuoleData.Nome_scuola.trim();
        }

        // Se città_scuola è vuoto, metti Città_scuola
        if ((!row.data?.città_scuola || row.data.città_scuola.trim() === '') && 
            scuoleData.Città_scuola && typeof scuoleData.Città_scuola === 'string' && scuoleData.Città_scuola.trim() !== '') {
          updates['data.città_scuola'] = scuoleData.Città_scuola.trim();
        }

        if (Object.keys(updates).length > 0) {
          await rowsCollection.updateOne(
            { _id: row._id },
            { $set: updates }
          );
          sheetUpdated++;
          totalUpdated++;
        }
      }

      if (sheetUpdated > 0) {
        console.log(`Updated ${sheetUpdated} rows in sheet ${sheet.name}`);
      }
    }

    console.log(`Migration completed: updated ${totalUpdated} rows`);
  },

  /**
   * @param db {import('mongodb').Db}
   * @param client {import('mongodb').MongoClient}
   * @returns {Promise<void>}
   */
  async down(db, client) {
    // Questa migrazione è reversibile in modo sicuro - non facciamo nulla
    console.log('Migration rollback: no changes made (data migration is safe to re-run)');
    return Promise.resolve();
  }
};