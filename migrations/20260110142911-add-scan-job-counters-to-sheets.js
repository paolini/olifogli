module.exports = {
  /**
   * @param db {import('mongodb').Db}
   * @param client {import('mongodb').MongoClient}
   * @returns {Promise<void>}
   */
  async up(db, client) {
    const sheetsCollection = db.collection('sheets');
    const scanJobsCollection = db.collection('scan_jobs');
    const scanSheetJobsCollection = db.collection('scan_sheet_jobs');

    // Prima imposta nScanJobs e nScanSheetJobs a 0 per tutti gli sheet
    await sheetsCollection.updateMany(
      {},
      { $set: { nScanJobs: 0, nScanSheetJobs: 0 } }
    );

    // Conta ScanJobs per sheetId
    const scanJobsAggregation = await scanJobsCollection.aggregate([
      {
        $group: {
          _id: '$sheetId',
          count: { $sum: 1 }
        }
      }
    ]).toArray();

    // Aggiorna sheet con nScanJobs
    for (const result of scanJobsAggregation) {
      await sheetsCollection.updateOne(
        { _id: result._id },
        { $set: { nScanJobs: result.count } }
      );
    }

    // Conta ScanSheetJobs per sheetId
    const scanSheetJobsAggregation = await scanSheetJobsCollection.aggregate([
      {
        $group: {
          _id: '$sheetId',
          count: { $sum: 1 }
        }
      }
    ]).toArray();

    // Aggiorna sheet con nScanSheetJobs
    for (const result of scanSheetJobsAggregation) {
      await sheetsCollection.updateOne(
        { _id: result._id },
        { $set: { nScanSheetJobs: result.count } }
      );
    }
  },

  /**
   * @param db {import('mongodb').Db}
   * @param client {import('mongodb').MongoClient}
   * @returns {Promise<void>}
   */
  async down(db, client) {
    // Rimuove i campi nScanJobs e nScanSheetJobs da tutti i sheet
    await db.collection('sheets').updateMany(
      {},
      { $unset: { nScanJobs: "", nScanSheetJobs: "" } }
    );
  }
};
