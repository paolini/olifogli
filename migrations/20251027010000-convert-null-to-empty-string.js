// Convert null createdBy and updatedBy to empty string

module.exports = {
  /**
   * @param {import('mongodb').Db} db
   * @param {import('mongodb').MongoClient} client
   */
  async up(db, client) {
    // Update rows collection
    await db.collection('rows').updateMany(
      { createdBy: null },
      { $set: { createdBy: '' } }
    );
    await db.collection('rows').updateMany(
      { updatedBy: null },
      { $set: { updatedBy: '' } }
    );

    // Update workbooks collection
    await db.collection('workbooks').updateMany(
      { createdBy: null },
      { $set: { createdBy: '' } }
    );
    await db.collection('workbooks').updateMany(
      { updatedBy: null },
      { $set: { updatedBy: '' } }
    );
  },

  /**
   * @param {import('mongodb').Db} db
   * @param {import('mongodb').MongoClient} client
   */
  async down(db, client) {
    // Revert rows collection
    await db.collection('rows').updateMany(
      { createdBy: '' },
      { $set: { createdBy: null } }
    );
    await db.collection('rows').updateMany(
      { updatedBy: '' },
      { $set: { updatedBy: null } }
    );

    // Revert workbooks collection
    await db.collection('workbooks').updateMany(
      { createdBy: '' },
      { $set: { createdBy: null } }
    );
    await db.collection('workbooks').updateMany(
      { updatedBy: '' },
      { $set: { updatedBy: null } }
    );
  }
}