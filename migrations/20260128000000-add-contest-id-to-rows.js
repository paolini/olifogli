module.exports = {
  /**
   * @param db {import('mongodb').Db}
   * @param client {import('mongodb').MongoClient}
   * @returns {Promise<void>}
   */
  async up(db, client) {
    const rowsCollection = db.collection('rows');
    const sheetsCollection = db.collection('sheets');
    const workbooksCollection = db.collection('workbooks');

    console.log('Starting migration: add contestId to rows based on workbook commonData');

    // Ottieni tutti i workbook
    const workbooks = await workbooksCollection.find({}).toArray();
    console.log(`Found ${workbooks.length} workbooks`);

    let totalUpdated = 0;
    
    for (const workbook of workbooks) {
      const warnedSchemas = new Set();
      const contestIds = workbook.commonData || {};
      let partialUpdated = 0;

      // Ottieni tutti gli sheet di questo workbook
      const sheets = await sheetsCollection.find({ workbookId: workbook._id }).toArray();
      console.log(`Workbook ${workbook.name} ${workbook._id}: ${sheets.length} sheets`);

      for (const sheet of sheets) {
        const schema = sheet.schema;
        const primaryContestIdKey = `olimanager_${schema}_contest_id`;
        const secondaryContestIdKey = `olimanager_contest_id`;
        const contestId = contestIds[primaryContestIdKey] || contestIds[secondaryContestIdKey];

        if (!contestId) {
          if (!warnedSchemas.has(schema)) {
            console.log(`No contestId for schema ${schema} in workbook ${workbook.name} ${workbook._id}`);
            warnedSchemas.add(schema);
          }
          continue;
        }

        // Aggiorna tutte le righe dello sheet che hanno olimanager ma non contestId
        const result = await rowsCollection.updateMany(
          {
            sheetId: sheet._id,
            olimanager: { $exists: true },
            'olimanager.contestId': { $exists: false }
          },
          {
            $set: {
              'olimanager.contestId': contestId,
            }
          }
        );
        totalUpdated += result.modifiedCount;
        partialUpdated += result.modifiedCount;
        // console.log(`Updated ${result.modifiedCount} rows for sheet ${sheet.name}${sheet._id}`);
      }
      console.log(`Workbook ${workbook.name} ${workbook._id}: Updated ${partialUpdated} rows with contestId`);
    }

    console.log(`Total updated rows: ${totalUpdated}`);
  },

  /**
   * @param db {import('mongodb').Db}
   * @param client {import('mongodb').MongoClient}
   * @returns {Promise<void>}
   */
  async down(db, client) {
    const rowsCollection = db.collection('rows');

    console.log('Starting down migration: remove contestId from rows');

    // Rimuovi contestId da tutte le righe che lo hanno
    const result = await rowsCollection.updateMany(
      { 'olimanager.contestId': { $exists: true } },
      {
        $unset: { 'olimanager.contestId': 1 },
        $set: {
          updatedOn: new Date(),
          updatedBy: 'migration-20260128-add-contest-id-down'
        }
      }
    );

    console.log(`Removed contestId from ${result.modifiedCount} rows`);
  }
};