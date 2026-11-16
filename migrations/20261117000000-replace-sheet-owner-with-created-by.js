// Sheets no longer have an owner. `ownerId` becomes the informative `createdBy`
// (the creator's email, as for workbooks and rows) and the `owner` permission
// role becomes `admin` (responsabile).
module.exports = {
  /**
   * @param db {import('mongodb').Db}
   */
  async up(db) {
    const sheets = db.collection('sheets');
    const users = db.collection('users');
    let renamed = 0;
    for (const ownerId of await sheets.distinct('ownerId', { ownerId: { $ne: null } })) {
      const user = await users.findOne({ _id: ownerId }, { projection: { email: 1 } });
      if (!user?.email) console.log(`Owner ${ownerId} not found: createdBy left empty`);
      const result = await sheets.updateMany({ ownerId }, { $set: { createdBy: user?.email || '' }, $unset: { ownerId: '' } });
      renamed += result.modifiedCount;
    }
    const remaining = await sheets.updateMany({ ownerId: { $exists: true } }, { $unset: { ownerId: '' } });
    console.log(`Replaced ownerId with createdBy on ${renamed} sheets (${remaining.modifiedCount} without owner)`);
    const roles = await sheets.updateMany(
      { 'permissions.role': 'owner' },
      { $set: { 'permissions.$[p].role': 'admin' } },
      { arrayFilters: [{ 'p.role': 'owner' }] },
    );
    console.log(`Converted owner permissions to admin on ${roles.modifiedCount} sheets`);
  },

  /**
   * Restores `ownerId` from `createdBy`; converted owner permissions stay admin.
   * @param db {import('mongodb').Db}
   */
  async down(db) {
    const sheets = db.collection('sheets');
    const users = db.collection('users');
    for (const email of await sheets.distinct('createdBy')) {
      const user = email ? await users.findOne({ email }, { projection: { _id: 1 } }) : null;
      if (!user) { console.log(`User ${email} not found: ownerId not restored`); continue; }
      await sheets.updateMany({ createdBy: email }, { $set: { ownerId: user._id }, $unset: { createdBy: '' } });
    }
  },
};
