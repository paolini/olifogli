module.exports = {
  /**
   * @param db {import('mongodb').Db}
   * @param client {import('mongodb').MongoClient}
   * @returns {Promise<void>}
   */
  async up(db, client) {
    const sheetsCollection = db.collection('sheets');
    const rowsCollection = db.collection('rows');

    // Prima imposta nSyncedRows a 0 per tutti gli sheet
    await sheetsCollection.updateMany(
      {},
      { $set: { nSyncedRows: 0 } }
    );

    // Poi trova tutte le righe sincronizzate e aggrega per sheetId
    const syncedRowsAggregation = await rowsCollection.aggregate([
      {
        $match: {
          'olimanager.resultsUpdatedOn': { $exists: true }
        }
      },
      {
        $group: {
          _id: '$sheetId',
          count: { $sum: 1 }
        }
      }
    ]).toArray();

    // Aggiorna solo gli sheet che hanno righe sincronizzate
    for (const result of syncedRowsAggregation) {
      await sheetsCollection.updateOne(
        { _id: result._id },
        { $set: { nSyncedRows: result.count } }
      );
    }
  },

  /**
   * @param db {import('mongodb').Db}
   * @param client {import('mongodb').MongoClient}
   * @returns {Promise<void>}
   */
  async down(db, client) {
    // Rimuove il campo nSyncedRows da tutti i sheet
    await db.collection('sheets').updateMany(
      {},
      { $unset: { nSyncedRows: "" } }
    );
  },
};