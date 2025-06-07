// Migrazione per normalizzare i riferimenti ai jobId in scan_messages e scan_results
// 1. Elenca tutti i jobId unici in scan_messages
// 2. Crea un documento scan_job per ciascun jobId
// 3. Aggiorna i riferimenti jobId in scan_messages e scan_results con il nuovo _id di scan_job

module.exports = {
  async up(db, client) {
    const scanMessages = db.collection('scan_messages');
    const scanResults = db.collection('scan_results');
    const scanJobs = db.collection('scan_jobs');

    // 1. Trova tutti i jobId unici
    const jobIds = await scanMessages.distinct('jobId');
    const jobIdToObjectId = {};

    // 2. Per ogni jobId, crea un documento scan_job e salva la mappatura
    for (const jobId of jobIds) {
      // Trova un esempio di scan_message per recuperare sheetId, timestamp, ownerId
      const message = await scanMessages.findOne({ jobId });
      if (!message) continue;
      const jobDoc = {
        jobId: jobId, // Mantieni il jobId originale come stringa
        sheetId: message.sheetId,
        timestamp: message.timestamp,
        ownerId: null // non sappiamo chi ha creato il job
      };
      const insertResult = await scanJobs.insertOne(jobDoc);
      jobIdToObjectId[jobId] = insertResult.insertedId;
    }

    // 3. Aggiorna tutti i riferimenti in scan_messages
    for (const [jobId, newId] of Object.entries(jobIdToObjectId)) {
      await scanMessages.updateMany(
        { jobId },
        { $set: { jobId: newId } }
      );
      await scanResults.updateMany(
        { jobId },
        { $set: { jobId: newId } }
      );
    }
    console.log('Migrazione completata: jobId normalizzati e referenziati come ObjectId.');
  },

  async down(db, client) {
    // Ripristina i jobId originali usando il campo jobId salvato in scan_jobs
    const scanJobs = db.collection('scan_jobs');
    const scanMessages = db.collection('scan_messages');
    const scanResults = db.collection('scan_results');

    // Recupera tutti i job con il jobId originale
    const jobs = await scanJobs.find({ jobId: { $exists: true } }).toArray();
    for (const job of jobs) {
      await scanMessages.updateMany(
        { jobId: job._id },
        { $set: { jobId: job.jobId } }
      );
      await scanResults.updateMany(
        { jobId: job._id },
        { $set: { jobId: job.jobId } }
      );
    }
    // Elimina tutti i job creati
    await scanJobs.deleteMany({});
    console.log('Migrazione revert: jobId ripristinati come stringa originale e scan_jobs svuotata.');
  }
};
