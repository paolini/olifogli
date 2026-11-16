// Workbooks no longer have an owner: `createdBy` (the creator's email) already
// records who created them. `ownerId` fills a missing `createdBy` and is removed.
module.exports = {
  /**
   * @param db {import('mongodb').Db}
   */
  async up(db) {
    const workbooks = db.collection('workbooks');
    const users = db.collection('users');
    for await (const workbook of workbooks.find({ ownerId: { $exists: true }, createdBy: { $in: [null, ''] } })) {
      const user = workbook.ownerId ? await users.findOne({ _id: workbook.ownerId }, { projection: { email: 1 } }) : null;
      await workbooks.updateOne({ _id: workbook._id }, { $set: { createdBy: user?.email || '' } });
    }
    const result = await workbooks.updateMany({ ownerId: { $exists: true } }, { $unset: { ownerId: '' } });
    console.log(`Removed ownerId from ${result.modifiedCount} workbooks`);
  },

  /**
   * Restores `ownerId` from `createdBy`.
   * @param db {import('mongodb').Db}
   */
  async down(db) {
    const workbooks = db.collection('workbooks');
    const users = db.collection('users');
    for (const email of await workbooks.distinct('createdBy')) {
      const user = email ? await users.findOne({ email }, { projection: { _id: 1 } }) : null;
      if (!user) { console.log(`User ${email} not found: ownerId not restored`); continue; }
      await workbooks.updateMany({ createdBy: email }, { $set: { ownerId: user._id } });
    }
  },
};
