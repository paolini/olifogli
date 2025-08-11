// Set default empty object for commonData in all sheets

module.exports = {
  /**
   * @param {import('mongodb').Db} db
   * @param {import('mongodb').MongoClient} client
   */
  async up(db, client) {
    await db.collection('sheets').updateMany(
      { $or: [ { commonData: { $exists: false } }, { commonData: null } ] },
      { $set: { commonData: {} } }
    )
  },

  /**
   * @param {import('mongodb').Db} db
   * @param {import('mongodb').MongoClient} client
   */
  async down(db, client) {
    // Only remove the field if it is an empty object, to avoid data loss
    await db.collection('sheets').updateMany(
      { commonData: {} },
      { $unset: { commonData: '' } }
    )
  }
}
