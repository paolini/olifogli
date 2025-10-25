// Delete orphan rows (rows that belong to deleted sheets)

module.exports = {
  /**
   * @param {import('mongodb').Db} db
   * @param {import('mongodb').MongoClient} client
   */
  async up(db, client) {
    // Get all existing sheet IDs
    const sheetIds = await db.collection('sheets').distinct('_id');
    
    // Delete rows that don't belong to any existing sheet
    const result = await db.collection('rows').deleteMany({
      sheetId: { $nin: sheetIds }
    });
    
    console.log(`Deleted ${result.deletedCount} orphan rows`);
  },

  /**
   * @param {import('mongodb').Db} db
   * @param {import('mongodb').MongoClient} client
   */
  async down(db, client) {
    // Cannot restore deleted rows
    console.log('Cannot restore deleted orphan rows');
  }
}
