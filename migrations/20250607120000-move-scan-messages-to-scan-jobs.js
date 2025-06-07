// Migrazione per spostare i dati da scan_messages a scan_jobs.messages
// filepath: migrations/20250607120000-move-scan-messages-to-scan-jobs.js

module.exports = {
  async up(db, client) {
    // Ottieni tutti i messaggi
    const scanMessages = await db.collection('scan_messages').find({}).toArray();
    // Raggruppa i messaggi per (sheetId, jobId)
    const grouped = {};
    for (const msg of scanMessages) {
      const key = msg.jobId.toString();
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push({
        timestamp: msg.timestamp,
        status: msg.status,
        message: msg.message || ''
      });
    }

    // Per ogni gruppo, aggiorna il documento scan_jobs corrispondente
    const scanJobs = await db.collection('scan_jobs').find({}).toArray();
    for (const job of scanJobs) {
        const key = job._id.toString();
        const messages = grouped[key]
        if (messages === undefined) continue;
    
        const res = await db.collection('scan_jobs').updateOne(
            {  _id: job._id },
            { $set: { messages } }
      );
      console.log(JSON.stringify({ key, res}, null, 2));
    }
  },

  async down(db, client) {
    // Per ogni scan_job con messages, ricrea i documenti scan_messages
    const scanJobs = await db.collection('scan_jobs').find({ messages: { $exists: true } }).toArray();
    const scanMessagesToInsert = [];
    for (const job of scanJobs) {
      if (!Array.isArray(job.messages)) continue;
      for (const msg of job.messages) {
        scanMessagesToInsert.push({
          jobId: job._id,
          timestamp: msg.timestamp,
          status: msg.status,
          message: msg.message || ''
        });
      }
    }
    if (scanMessagesToInsert.length > 0) {
      await db.collection('scan_messages').insertMany(scanMessagesToInsert);
    }
    // Rimuovi l'attributo messages da tutti i documenti scan_jobs
    await db.collection('scan_jobs').updateMany({}, { $unset: { messages: '' } });
  }
}
