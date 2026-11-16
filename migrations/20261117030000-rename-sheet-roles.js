// Sheet roles are renamed so that they cannot be confused with the global roles:
// `admin` (responsabile) becomes `manager`, `view` («supervisore») becomes
// `viewer` («osservatore»). `editor` (aiutante) is unchanged.
const RENAMES = [['admin', 'manager'], ['view', 'viewer']];

async function rename(db, pairs) {
  const sheets = db.collection('sheets');
  for (const [from, to] of pairs) {
    const result = await sheets.updateMany(
      { 'permissions.role': from },
      { $set: { 'permissions.$[p].role': to } },
      { arrayFilters: [{ 'p.role': from }] },
    );
    console.log(`Renamed sheet role ${from} to ${to} on ${result.modifiedCount} sheets`);
  }
}

module.exports = {
  /**
   * @param db {import('mongodb').Db}
   */
  async up(db) {
    await rename(db, RENAMES);
  },

  /**
   * @param db {import('mongodb').Db}
   */
  async down(db) {
    await rename(db, RENAMES.map(([from, to]) => [to, from]));
  },
};
