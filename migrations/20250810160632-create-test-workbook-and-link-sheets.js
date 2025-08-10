const { ObjectId } = require('mongodb');

module.exports = {
  /**
   * @param db {import('mongodb').Db}
   * @param client {import('mongodb').MongoClient}
   * @returns {Promise<void>}
   */
  async up(db, client) {
    const sheetCount = await db.collection('sheets').countDocuments();
    if (sheetCount === 0) {
        console.log('No sheets found, skipping migration.');
        return;
    }

    // 1. Create a new workbook
    // 2. Get all the sheets
    // 3. Add the workbook_id to all the sheets

    let adminUser = await db.collection('users').findOne({ is_admin: true });
    if (!adminUser) {
      adminUser = await db.collection('users').findOne({});
    }
    if (!adminUser) {
        throw new Error('No user found to own the workbook. Please create a user first.');
    }

    const workbookResult = await db.collection('workbooks').insertOne({
        name: 'test',
        owner_id: adminUser._id,
        createdOn: new Date(),
        updatedOn: new Date(),
        createdBy: adminUser._id,
        updatedBy: adminUser._id,
    });

    const workbookId = workbookResult.insertedId;

    await db.collection('sheets').updateMany({}, { $set: { workbook_id: workbookId } });
  },

  /**
   * @param db {import('mongodb').Db}
   * @param client {import('mongodb').MongoClient}
   * @returns {Promise<void>}
   */
  async down(db, client) {
    // 1. Get the test workbook
    // 2. Remove the workbook_id from all the sheets
    // 3. Delete the workbook

    const workbook = await db.collection('workbooks').findOne({ name: 'test' });
    if (workbook) {
        await db.collection('sheets').updateMany({ workbook_id: workbook._id }, { $unset: { workbook_id: '' } });
        await db.collection('workbooks').deleteOne({ _id: workbook._id });
    }
  }
};
