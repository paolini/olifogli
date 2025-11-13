module.exports = {
  /**
   * @param db {import('mongodb').Db}
   * @param client {import('mongodb').MongoClient}
   * @returns {Promise<void>}
   */
  async up(db, client) {
    // Aggiorna tutti i documenti in cui commonData.Distretto inizia con "Distretto di "
    await db.collection('sheets').updateMany(
      { 'commonData.Distretto': { $regex: '^Distretto di ' } },
      [
        {
          $set: {
            'commonData.Distretto': {
              $trim: {
                input: { $substrCP: [ '$commonData.Distretto', 13, { $strLenCP: '$commonData.Distretto' } ] }
              }
            }
          }
        }
      ]
    );
  },

  /**
   * @param db {import('mongodb').Db}
   * @param client {import('mongodb').MongoClient}
   * @returns {Promise<void>}
   */
  async down(db, client) {
    // TODO write the statements to rollback your migration (if possible)
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: false}});
  }
};
