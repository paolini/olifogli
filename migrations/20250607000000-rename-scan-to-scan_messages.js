// Migration script to rename the 'scans' collection to 'scan_messages'

module.exports = {
  async up(db, client) {
    const collections = await db.listCollections({ name: 'scans' }).toArray()
    if (collections.length > 0) {
      await db.collection('scans').rename('scan_messages')
    }
  },

  async down(db, client) {
    const collections = await db.listCollections({ name: 'scan_messages' }).toArray()
    if (collections.length > 0) {
      await db.collection('scan_messages').rename('scans')
    }
  }
}
