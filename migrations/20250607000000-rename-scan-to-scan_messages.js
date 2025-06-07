// Migration script to rename the 'scans' collection to 'scan_messages'

module.exports = {
  async up(db, client) {
    await db.collection('scans').rename('scan_messages')
  },

  async down(db, client) {
      await db.collection('scan_messages').rename('scans')
  }
}
