// Migrazione per spostare permissions da sheets.permissions a una collection separata 'permissions'
// filepath: migrations/20250810000000-move-permissions-to-separate-collection.js

module.exports = {
  async up(db, client) {
    // Ottieni tutti i sheets con permissions
    const sheets = await db.collection('sheets').find({ permissions: { $exists: true, $ne: [] } }).toArray();
    
    const permissionsToInsert = [];
    
    // Per ogni sheet, estrai le permissions e aggiungi sheet_id
    for (const sheet of sheets) {
      if (Array.isArray(sheet.permissions)) {
        for (const permission of sheet.permissions) {
          permissionsToInsert.push({
            sheet_id: sheet._id,
            user_id: permission.user_id || null,
            user_email: permission.user_email || null,
            filter_field: permission.filter_field || null,
            filter_value: permission.filter_value || null
          });
        }
      }
    }
    
    // Inserisci le permissions nella nuova collection
    if (permissionsToInsert.length > 0) {
      await db.collection('permissions').insertMany(permissionsToInsert);
      console.log(`Inserted ${permissionsToInsert.length} permissions into separate collection`);
    }
    
    // Rimuovi il campo permissions da tutti i sheets
    await db.collection('sheets').updateMany(
      {},
      { $unset: { permissions: "" } }
    );
    
    console.log('Removed permissions field from sheets collection');
  },

  async down(db, client) {
    // Ottieni tutte le permissions
    const permissions = await db.collection('permissions').find({}).toArray();
    
    // Raggruppa le permissions per sheet_id
    const grouped = {};
    for (const permission of permissions) {
      const sheetId = permission.sheet_id.toString();
      if (!grouped[sheetId]) {
        grouped[sheetId] = [];
      }
      
      const permissionData = {};
      if (permission.user_id) permissionData.user_id = permission.user_id;
      if (permission.user_email) permissionData.user_email = permission.user_email;
      if (permission.filter_field) permissionData.filter_field = permission.filter_field;
      if (permission.filter_value) permissionData.filter_value = permission.filter_value;
      
      grouped[sheetId].push(permissionData);
    }
    
    // Aggiorna ogni sheet con le sue permissions
    for (const [sheetIdStr, sheetPermissions] of Object.entries(grouped)) {
      const { ObjectId } = require('mongodb');
      const sheetId = new ObjectId(sheetIdStr);
      
      await db.collection('sheets').updateOne(
        { _id: sheetId },
        { $set: { permissions: sheetPermissions } }
      );
    }
    
    console.log('Restored permissions field to sheets collection');
    
    // Rimuovi la collection permissions
    await db.collection('permissions').drop();
    console.log('Dropped permissions collection');
  }
};
