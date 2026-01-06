module.exports = {
  /**
   * @param db {import('mongodb').Db}
   * @param client {import('mongodb').MongoClient}
   * @returns {Promise<void>}
   */
  async up(db, client) {
    const keysToDuplicate = ["scan_info", "panel_instructions", "table_instructions", "table_instructions_standard"];

    for (const key of keysToDuplicate) {
      const doc = await db.collection('settings').findOne({ key });
      if (doc) {
        // Duplicate for biennio
        const biennioDoc = {
          ...doc,
          key: `${key}_archimede_biennio`,
          updatedOn: new Date()
        };
        delete biennioDoc._id; // Remove _id to let Mongo generate a new one
        await db.collection('settings').insertOne(biennioDoc);

        // Duplicate for triennio
        const triennioDoc = {
          ...doc,
          key: `${key}_archimede_triennio`,
          updatedOn: new Date()
        };
        delete triennioDoc._id;
        await db.collection('settings').insertOne(triennioDoc);
      }
    }
  },

  /**
   * @param db {import('mongodb').Db}
   * @param client {import('mongodb').MongoClient}
   * @returns {Promise<void>}
   */
  async down(db, client) {
    const keysToRemove = [
      "scan_info_archimede_biennio",
      "scan_info_archimede_triennio",
      "panel_instructions_archimede_biennio",
      "panel_instructions_archimede_triennio",
      "table_instructions_archimede_biennio",
      "table_instructions_archimede_triennio",
      "table_instructions_standard_archimede_biennio",
      "table_instructions_standard_archimede_triennio"
    ];

    await db.collection('settings').deleteMany({ key: { $in: keysToRemove } });
  }
};