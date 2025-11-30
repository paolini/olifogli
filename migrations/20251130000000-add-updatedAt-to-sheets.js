// Migrazione: aggiunge updatedAt ai fogli basato sull'ultima modifica delle righe
// Esegui con migrate-mongo o come script standalone

const { ObjectId } = require('bson');

module.exports = {
  async up(db) {
    // Per ogni sheet, trova il max updatedOn delle sue righe, oppure usa createdAt se non ci sono righe
    const sheets = await db.collection('sheets').find({}).toArray();
    for (const sheet of sheets) {
      const row = await db.collection('rows').find({ sheetId: sheet._id }).sort({ updatedOn: -1 }).limit(1).toArray();
      const updatedAt = row.length > 0 ? row[0].updatedOn : sheet.createdAt;
      await db.collection('sheets').updateOne(
        { _id: sheet._id },
        { $set: { updatedAt } }
      );
    }
  },

  async down(db) {
    // Rimuovi updatedAt da tutti i fogli
    await db.collection('sheets').updateMany({}, { $unset: { updatedAt: 1 } });
  }
};