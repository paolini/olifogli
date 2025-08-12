// Add indexes to speed up common queries
// - rows: index on sheetId used to count rows per sheet
// - sheets: index on workbookId used to filter sheets by workbook

module.exports = {
  async up(db) {
    await db.collection('rows').createIndex({ sheetId: 1 }, { name: 'sheetId_1' });
    await db.collection('sheets').createIndex({ workbookId: 1 }, { name: 'workbookId_1' });
  },

  async down(db) {
    try { await db.collection('rows').dropIndex('sheetId_1'); } catch {}
    try { await db.collection('sheets').dropIndex('workbookId_1'); } catch {}
  }
};
