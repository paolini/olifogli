// Fix scan_results documents that have raw_data or data_raw instead of rawData
// This migration ensures all scan_results have the rawData field in camelCase
// and sets an empty object {} for any documents missing this field entirely

module.exports = {
  /**
   * @param {import('mongodb').Db} db
   * @param {import('mongodb').MongoClient} client
   */
  async up(db, client) {
    // First, rename any raw_data fields to rawData
    await db.collection('scan_results').updateMany(
      { raw_data: { $exists: true } },
      { $rename: { 'raw_data': 'rawData' } }
    )

    // Then, rename any data_raw fields to rawData
    await db.collection('scan_results').updateMany(
      { data_raw: { $exists: true } },
      { $rename: { 'data_raw': 'rawData' } }
    )

    // Finally, set rawData to empty object for any documents that don't have it
    await db.collection('scan_results').updateMany(
      { rawData: { $exists: false } },
      { $set: { rawData: {} } }
    )
  },

  /**
   * @param {import('mongodb').Db} db
   * @param {import('mongodb').MongoClient} client
   */
  async down(db, client) {
    // Revert: rename rawData back to raw_data
    // Note: We can't distinguish between original raw_data and data_raw, so we revert to raw_data
    // Also, we don't remove the empty {} objects as they may have been added manually
    await db.collection('scan_results').updateMany(
      { rawData: { $exists: true } },
      { $rename: { 'rawData': 'raw_data' } }
    )
  }
}
