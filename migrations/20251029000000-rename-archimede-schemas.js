module.exports = {
  /**
   * @param db {import('mongodb').Db}
   * @param client {import('mongodb').MongoClient}
   * @returns {Promise<void>}
   */
  async up(db, client) {
    // Aggiorna tutti i documenti con schema: "archimede-biennio" a "archimede_biennio"
    await db.collection('sheets').updateMany(
      { schema: "archimede-biennio" },
      { $set: { schema: "archimede_biennio" } }
    );

    // Aggiorna tutti i documenti con schema: "archimede-triennio" a "archimede_triennio"
    await db.collection('sheets').updateMany(
      { schema: "archimede-triennio" },
      { $set: { schema: "archimede_triennio" } }
    );
  },

  /**
   * @param db {import('mongodb').Db}
   * @param client {import('mongodb').MongoClient}
   * @returns {Promise<void>}
   */
  async down(db, client) {
    // Ripristina i documenti a "archimede-biennio" se necessario
    await db.collection('sheets').updateMany(
      { schema: "archimede_biennio" },
      { $set: { schema: "archimede-biennio" } }
    );

    // Ripristina i documenti a "archimede-triennio" se necessario
    await db.collection('sheets').updateMany(
      { schema: "archimede_triennio" },
      { $set: { schema: "archimede-triennio" } }
    );
  }
};
