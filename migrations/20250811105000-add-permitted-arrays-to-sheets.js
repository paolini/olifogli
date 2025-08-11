// Add empty arrays for permittedEmails and permittedIds to sheets

module.exports = {
  /**
   * @param {import('mongodb').Db} db
   * @param {import('mongodb').MongoClient} client
   */
  async up(db, client) {
    // permittedEmails
    await db.collection('sheets').updateMany(
      { $or: [ { permittedEmails: { $exists: false } }, { permittedEmails: null } ] },
      { $set: { permittedEmails: [] } }
    )

    // permittedIds
    await db.collection('sheets').updateMany(
      { $or: [ { permittedIds: { $exists: false } }, { permittedIds: null } ] },
      { $set: { permittedIds: [] } }
    )
  },

  /**
   * @param {import('mongodb').Db} db
   * @param {import('mongodb').MongoClient} client
   */
  async down(db, client) {
    // Remove only if still empty to avoid data loss
    await db.collection('sheets').updateMany(
      { permittedEmails: { $exists: true, $size: 0 } },
      { $unset: { permittedEmails: '' } }
    )

    await db.collection('sheets').updateMany(
      { permittedIds: { $exists: true, $size: 0 } },
      { $unset: { permittedIds: '' } }
    )
  }
}
