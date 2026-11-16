// Scan jobs follow the permissions of their sheet: `ownerId` gave the uploader
// special rights and becomes the informative `createdBy` (the uploader's email).
module.exports = {
  /**
   * @param db {import('mongodb').Db}
   */
  async up(db) {
    const jobs = db.collection('scan_jobs');
    const users = db.collection('users');
    let renamed = 0;
    for (const ownerId of await jobs.distinct('ownerId', { ownerId: { $ne: null } })) {
      const user = await users.findOne({ _id: ownerId }, { projection: { email: 1 } });
      if (!user?.email) console.log(`Owner ${ownerId} not found: createdBy left empty`);
      const result = await jobs.updateMany({ ownerId }, { $set: { createdBy: user?.email || '' }, $unset: { ownerId: '' } });
      renamed += result.modifiedCount;
    }
    const remaining = await jobs.updateMany({ ownerId: { $exists: true } }, { $set: { createdBy: '' }, $unset: { ownerId: '' } });
    console.log(`Replaced ownerId with createdBy on ${renamed} scan jobs (${remaining.modifiedCount} without owner)`);
  },

  /**
   * Restores `ownerId` from `createdBy`.
   * @param db {import('mongodb').Db}
   */
  async down(db) {
    const jobs = db.collection('scan_jobs');
    const users = db.collection('users');
    for (const email of await jobs.distinct('createdBy')) {
      const user = email ? await users.findOne({ email }, { projection: { _id: 1 } }) : null;
      if (!user) { console.log(`User ${email} not found: ownerId not restored`); continue; }
      await jobs.updateMany({ createdBy: email }, { $set: { ownerId: user._id }, $unset: { createdBy: '' } });
    }
  },
};
