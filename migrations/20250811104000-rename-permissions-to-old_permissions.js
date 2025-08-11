// Rename `permissions` to `old_permissions` in sheets

module.exports = {
  /**
   * @param {import('mongodb').Db} db
   * @param {import('mongodb').MongoClient} client
   */
  async up(db, client) {
    // If both fields exist, preserve existing old_permissions
    await db.collection('sheets').updateMany(
      { permissions: { $exists: true } },
      [
        { $set: { old_permissions: { $ifNull: ['$old_permissions', '$permissions'] } } },
        { $unset: 'permissions' }
      ]
    )
  },

  /**
   * @param {import('mongodb').Db} db
   * @param {import('mongodb').MongoClient} client
   */
  async down(db, client) {
    // Restore `permissions` from `old_permissions` if needed
    await db.collection('sheets').updateMany(
      { old_permissions: { $exists: true } },
      [
        { $set: { permissions: { $ifNull: ['$permissions', '$old_permissions'] } } },
        { $unset: 'old_permissions' }
      ]
    )
  }
}
