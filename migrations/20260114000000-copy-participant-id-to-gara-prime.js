module.exports = {
  /**
   * @param db {import('mongodb').Db}
   * @param client {import('mongodb').MongoClient}
   * @returns {Promise<void>}
   */
  async up(db, client) {
    const rowsCollection = db.collection('rows');
    const sheetsCollection = db.collection('sheets');

    console.log('Starting migration: copy participantId from selected rows to gara_prime rows');

    // Helper function to create key from row
    const getRowKey = (row) => `${row.data?.name || ''}|${row.data?.surname || ''}|${row.data?.birthDate || ''}|${row.data?.classSection || ''}`;

    // Trova tutti gli sheet con schema 'gara_prime'
    const garaPrimeSheets = await sheetsCollection.find({ schema: 'gara_prime' }).toArray();
    const garaPrimeSheetIds = garaPrimeSheets.map(s => s._id);

    console.log(`Found ${garaPrimeSheetIds.length} gara_prime sheets`);

    // Trova tutte le righe selezionate per 'gara_prime'
    const selectedRows = await rowsCollection.find({
      selections: {
        $elemMatch: { label: 'gara_prime' }
      }
    }).toArray();

    console.log(`Found ${selectedRows.length} selected rows for gara_prime`);

    // Crea una mappa delle righe selezionate, chiave: name|surname|birthDate|classSection
    const selectedMap = new Map();
    for (const row of selectedRows) {
      const key = getRowKey(row);
      if (row.olimanager?.participantId) {
        selectedMap.set(key, row.olimanager.participantId);
      }
    }

    console.log(`Created map with ${selectedMap.size} entries`);

    // Trova tutte le righe di gara_prime
    const garaPrimeRows = await rowsCollection.find({
      sheetId: { $in: garaPrimeSheetIds }
    }).toArray();

    console.log(`Found ${garaPrimeRows.length} gara_prime rows`);

    let updatedCount = 0;

    // Per ogni riga di gara_prime, cerca il match
    for (const row of garaPrimeRows) {
      const key = getRowKey(row);
      const participantId = selectedMap.get(key);
      if (participantId && !row.olimanager?.participantId) {
        // Aggiorna la riga con participantId
        await rowsCollection.updateOne(
          { _id: row._id },
          {
            $set: {
              'olimanager.participantId': participantId,
              'olimanager.error': '',
              updatedOn: new Date(),
              updatedBy: 'migration-20260114-copy-participant-id'
            }
          }
        );
        updatedCount++;
      }
    }

    console.log(`Updated ${updatedCount} gara_prime rows with participantId`);
  },

  /**
   * @param db {import('mongodb').Db}
   * @param client {import('mongodb').MongoClient}
   * @returns {Promise<void>}
   */
  async down(db, client) {
    // Non è possibile fare down facilmente, dato che non sappiamo quali erano gli originali
    console.log('Down migration not implemented for participantId copy');
  }
};