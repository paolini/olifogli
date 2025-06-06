module.exports = {
  /**
   * @param db {import('mongodb').Db}
   * @param client {import('mongodb').MongoClient}
   * @returns {Promise<void>}
   */
  async up(db, client) {
    // Aggiorna tutti i documenti con schema: "ammissioneSenior" a "ammissione_senior"
    await db.collection('sheets').updateMany(
      { schema: "ammissioneSenior" },
      { $set: { schema: "ammissione_senior" } }
    );
  },

  /**
   * @param db {import('mongodb').Db}
   * @param client {import('mongodb').MongoClient}
   * @returns {Promise<void>}
   */
  async down(db, client) {
    // Ripristina i documenti a "ammissioneSenior" se necessario
    await db.collection('sheets').updateMany(
      { schema: "ammissione_senior" },
      { $set: { schema: "ammissioneSenior" } }
    );
  }
};
