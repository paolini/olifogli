// Replace createdBy and updatedBy ObjectId with email string

const { ObjectId } = require('mongodb');

module.exports = {
  /**
   * @param {import('mongodb').Db} db
   * @param {import('mongodb').MongoClient} client
   */
  async up(db, client) {
    // Get all users for lookup
    const users = await db.collection('users').find({}).toArray();

    // Update rows collection - for each user update all their documents at once
    for (const user of users) {
      // Update createdBy
      await db.collection('rows').updateMany(
        { createdBy: user._id },
        { $set: { createdBy: user.email } }
      );
      
      // Update updatedBy
      await db.collection('rows').updateMany(
        { updatedBy: user._id },
        { $set: { updatedBy: user.email } }
      );
    }

    // Update workbooks collection - for each user update all their documents at once
    for (const user of users) {
      // Update createdBy
      await db.collection('workbooks').updateMany(
        { createdBy: user._id },
        { $set: { createdBy: user.email } }
      );
      
      // Update updatedBy
      await db.collection('workbooks').updateMany(
        { updatedBy: user._id },
        { $set: { updatedBy: user.email } }
      );
    }
  },

  /**
   * @param {import('mongodb').Db} db
   * @param {import('mongodb').MongoClient} client
   */
  async down(db, client) {
    // Get all users for reverse lookup
    const users = await db.collection('users').find({}).toArray();

    // Revert rows collection - for each user update all their documents at once
    for (const user of users) {
      // Revert createdBy
      await db.collection('rows').updateMany(
        { createdBy: user.email },
        { $set: { createdBy: user._id } }
      );
      
      // Revert updatedBy
      await db.collection('rows').updateMany(
        { updatedBy: user.email },
        { $set: { updatedBy: user._id } }
      );
    }

    // Revert workbooks collection - for each user update all their documents at once
    for (const user of users) {
      // Revert createdBy
      await db.collection('workbooks').updateMany(
        { createdBy: user.email },
        { $set: { createdBy: user._id } }
      );
      
      // Revert updatedBy
      await db.collection('workbooks').updateMany(
        { updatedBy: user.email },
        { $set: { updatedBy: user._id } }
      );
    }
  }
}
