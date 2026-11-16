// The Olimanager contest now belongs to each sheet (`commonData.olimanager_contest_id`)
// instead of the workbook (`olimanager_<schema>_contest_id`, `olimanager_contest_id`).
const SHEET_KEY = 'olimanager_contest_id';
const WORKBOOK_KEY = /^olimanager_(\w+_)?contest_id$/;

module.exports = {
  /**
   * @param db {import('mongodb').Db}
   */
  async up(db) {
    const workbooks = db.collection('workbooks');
    const sheets = db.collection('sheets');
    let assigned = 0;
    for await (const workbook of workbooks.find({})) {
      const config = workbook.commonData || {};
      const keys = Object.keys(config).filter(key => WORKBOOK_KEY.test(key));
      if (!keys.length) continue;
      const used = new Set();
      for await (const sheet of sheets.find({ workbookId: workbook._id })) {
        if (String(sheet.commonData?.[SHEET_KEY] ?? '').trim()) continue;
        const key = config[`olimanager_${sheet.schema}_contest_id`] ? `olimanager_${sheet.schema}_contest_id` : 'olimanager_contest_id';
        const contest = String(config[key] ?? '').trim();
        if (!contest) continue;
        used.add(key);
        await sheets.updateOne({ _id: sheet._id }, { $set: { [`commonData.${SHEET_KEY}`]: contest } });
        assigned++;
      }
      const unused = keys.filter(key => !used.has(key) && String(config[key] ?? '').trim());
      if (unused.length) console.log(`Workbook ${workbook._id}: removing unused ${unused.map(key => `${key}=${config[key]}`).join(', ')}`);
      await workbooks.updateOne({ _id: workbook._id }, { $unset: Object.fromEntries(keys.map(key => [`commonData.${key}`, ''])) });
    }
    console.log(`Assigned the Olimanager contest to ${assigned} sheets`);
  },

  /**
   * Restores one workbook key per schema when all its sheets share the contest.
   * @param db {import('mongodb').Db}
   */
  async down(db) {
    const workbooks = db.collection('workbooks');
    const sheets = db.collection('sheets');
    for await (const workbook of workbooks.find({})) {
      const contests = new Map();
      for await (const sheet of sheets.find({ workbookId: workbook._id, [`commonData.${SHEET_KEY}`]: { $exists: true } })) {
        if (!contests.has(sheet.schema)) contests.set(sheet.schema, new Set());
        contests.get(sheet.schema).add(String(sheet.commonData[SHEET_KEY]));
      }
      const $set = {};
      for (const [schema, values] of contests) {
        if (values.size === 1) $set[`commonData.olimanager_${schema}_contest_id`] = [...values][0];
        else console.log(`Workbook ${workbook._id}: schema ${schema} has several contests, not restored`);
      }
      if (Object.keys($set).length) await workbooks.updateOne({ _id: workbook._id }, { $set });
    }
    await sheets.updateMany({}, { $unset: { [`commonData.${SHEET_KEY}`]: '' } });
  },
};
