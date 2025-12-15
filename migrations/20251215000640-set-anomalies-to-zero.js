module.exports = {
  /**
   * @param db {import('mongodb').Db}
   * @param client {import('mongodb').MongoClient}
   * @returns {Promise<void>}
   */
  async up(db, client) {
    // Imposta anomalies a 0 per tutti i sheet
    await db.collection('sheets').updateMany(
      {},
      { $set: { anomalies: 0 } }
    );

    // Imposta anomalies a 0 per tutte le rows
    await db.collection('rows').updateMany(
      {},
      { $set: { anomalies: 0 } }
    );
  },

  /**
   * @param db {import('mongodb').Db}
   * @param client {import('mongodb').MongoClient}
   * @returns {Promise<void>}
   */
  async down(db, client) {
    // Non reversibile: non si può distinguere tra valori 0 impostati dalla migrazione e valori 0 originali
    // Rimuovi il campo anomalies dove è 0, assumendo che siano stati impostati dalla migrazione
    await db.collection('sheets').updateMany(
      { anomalies: 0 },
      { $unset: { anomalies: 1 } }
    );

    await db.collection('rows').updateMany(
      { anomalies: 0 },
      { $unset: { anomalies: 1 } }
    );
  }
};
