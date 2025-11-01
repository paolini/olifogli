// Aggiunge i campi nRows e nValidRows a tutti gli sheets calcolandoli dalle rows collegate

module.exports = {
  /**
   * @param {import('mongodb').Db} db
   * @param {import('mongodb').MongoClient} client
   */
  async up(db, client) {
    const sheetsCollection = db.collection('sheets')
    const rowsCollection = db.collection('rows')
    
    // Ottieni tutti gli sheet
    const sheets = await sheetsCollection.find({}).toArray()
    
    console.log(`Inizializzazione nRows e nValidRows per ${sheets.length} sheets...`)
    
    let updated = 0
    for (const sheet of sheets) {
      // Conta tutte le righe per questo sheet
      const nRows = await rowsCollection.countDocuments({ sheetId: sheet._id })
      
      // Conta le righe valide (error vuoto o assente)
      const nValidRows = await rowsCollection.countDocuments({ 
        sheetId: sheet._id,
        $or: [
          { error: '' },
          { error: { $exists: false } }
        ]
      })
      
      // Aggiorna lo sheet con i conteggi
      await sheetsCollection.updateOne(
        { _id: sheet._id },
        { $set: { nRows, nValidRows } }
      )
      
      updated++
      if (updated % 100 === 0) {
        console.log(`Processati ${updated}/${sheets.length} sheets...`)
      }
    }
    
    console.log(`✓ Inizializzati nRows e nValidRows per ${updated} sheets`)
  },

  /**
   * @param {import('mongodb').Db} db
   * @param {import('mongodb').MongoClient} client
   */
  async down(db, client) {
    // Rimuovi i campi nRows e nValidRows da tutti gli sheet
    const result = await db.collection('sheets').updateMany(
      {},
      { $unset: { nRows: '', nValidRows: '' } }
    )
    
    console.log(`Rimossi nRows e nValidRows da ${result.modifiedCount} sheets`)
  }
}
