// Migrate from permittedEmails/permittedIds to unified permissions structure

module.exports = {
  /**
   * @param {import('mongodb').Db} db
   * @param {import('mongodb').MongoClient} client
   */
  async up(db, client) {
    console.log('Migrating sheets to new permissions structure...')
    
    // Add permissions field to all sheets
    await db.collection('sheets').updateMany(
      { permissions: { $exists: false } },
      { $set: { permissions: [] } }
    )

    // Get all sheets to process
    const sheets = await db.collection('sheets').find({}).toArray()
    
    for (const sheet of sheets) {
      const permissions = []
      
      // Convert permittedEmails to permissions with 'editor' role
      if (sheet.permittedEmails && Array.isArray(sheet.permittedEmails)) {
        for (const email of sheet.permittedEmails) {
          if (email && email.trim()) {
            permissions.push({
              email: email.trim(),
              role: 'editor'
            })
          }
        }
      }
      
      // Convert permittedIds to permissions with 'editor' role  
      if (sheet.permittedIds && Array.isArray(sheet.permittedIds)) {
        for (const userId of sheet.permittedIds) {
          if (userId) {
            permissions.push({
              userId: userId,
              role: 'editor'
            })
          }
        }
      }
      
      // Update the sheet with new permissions structure
      if (permissions.length > 0) {
        await db.collection('sheets').updateOne(
          { _id: sheet._id },
          { $set: { permissions } }
        )
      }
    }
    
    console.log(`Migrated ${sheets.length} sheets to new permissions structure`)
  },

  /**
   * @param {import('mongodb').Db} db
   * @param {import('mongodb').MongoClient} client
   */
  async down(db, client) {
    console.log('Rolling back permissions migration...')
    
    // Get all sheets to process
    const sheets = await db.collection('sheets').find({}).toArray()
    
    for (const sheet of sheets) {
      const permittedEmails = []
      const permittedIds = []
      
      if (sheet.permissions && Array.isArray(sheet.permissions)) {
        for (const permission of sheet.permissions) {
          if (permission.email) {
            permittedEmails.push(permission.email)
          }
          if (permission.userId) {
            permittedIds.push(permission.userId)
          }
        }
      }
      
      // Restore old structure
      await db.collection('sheets').updateOne(
        { _id: sheet._id },
        { 
          $set: { 
            permittedEmails: permittedEmails,
            permittedIds: permittedIds
          },
          $unset: { permissions: '' }
        }
      )
    }
    
    console.log('Rollback completed')
  }
}