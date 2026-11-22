// The address book no longer remembers the last edition of each user: its
// pages have their own URLs (/olimanager/<olympiad>/<edition>).
module.exports = {
  /**
   * @param db {import('mongodb').Db}
   */
  async up(db) {
    const result = await db.collection('users').updateMany({ addressBookSelection: { $exists: true } }, { $unset: { addressBookSelection: '' } });
    console.log(`Removed addressBookSelection from ${result.modifiedCount} users`);
  },

  /**
   * The removed selections cannot be restored; nothing reads them any more.
   */
  async down() {},
};
