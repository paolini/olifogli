// Migrazione: mette in minuscolo tutte le email nelle permission dei fogli
// Esegui con migrate-mongo o come script standalone

const { ObjectId } = require('bson');

module.exports = {
  async up(db) {
    // Aggiorna tutte le Sheet: permissions.email -> minuscolo
    const sheets = await db.collection('sheets').find({ 'permissions.email': { $exists: true, $ne: null } }).toArray();
    for (const sheet of sheets) {
      let updated = false;
      const newPermissions = sheet.permissions.map(p => {
        if (p.email && typeof p.email === 'string' && p.email !== p.email.toLowerCase()) {
          updated = true;
          return { ...p, email: p.email.toLowerCase() };
        }
        return p;
      });
      if (updated) {
        await db.collection('sheets').updateOne(
          { _id: sheet._id },
          { $set: { permissions: newPermissions } }
        );
      }
    }
  },

  async down(db) {
    // Non reversibile: non si può risalire alle maiuscole originali
    return;
  }
};
