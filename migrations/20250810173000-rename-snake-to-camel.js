// Rename snake_case fields to camelCase across collections
// - users: is_admin -> isAdmin
// - accounts: user_id -> userId
// - workbooks: owner_id -> ownerId
// - sheets: owner_id -> ownerId, workbook_id -> workbookId, permissions.* keys -> camelCase
// - scan_results: raw_data -> rawData

module.exports = {
  /**
   * @param {import('mongodb').Db} db
   * @param {import('mongodb').MongoClient} client
   */
  async up(db, client) {
    // users
    await db.collection('users').updateMany(
      { is_admin: { $exists: true } },
      { $rename: { 'is_admin': 'isAdmin' } }
    )

    // accounts
    await db.collection('accounts').updateMany(
      { user_id: { $exists: true } },
      { $rename: { 'user_id': 'userId' } }
    )

    // workbooks
    await db.collection('workbooks').updateMany(
      { owner_id: { $exists: true } },
      { $rename: { 'owner_id': 'ownerId' } }
    )

    // sheets top-level fields
    await db.collection('sheets').updateMany(
      { owner_id: { $exists: true } },
      { $rename: { 'owner_id': 'ownerId' } }
    )
    await db.collection('sheets').updateMany(
      { workbook_id: { $exists: true } },
      { $rename: { 'workbook_id': 'workbookId' } }
    )

    // sheets.permissions array: map keys to camelCase preserving any other fields
    await db.collection('sheets').updateMany(
      { permissions: { $exists: true, $type: 'array' } },
      [
        {
          $set: {
            permissions: {
              $map: {
                input: '$permissions',
                as: 'p',
                in: {
                  $let: {
                    vars: {
                      // remove old snake_case keys from each permission object
                      baseObj: {
                        $arrayToObject: {
                          $filter: {
                            input: { $objectToArray: '$$p' },
                            as: 'kv',
                            cond: {
                              $not: {
                                $in: [
                                  '$$kv.k',
                                  ['user_id', 'user_email', 'filter_field', 'filter_value']
                                ]
                              }
                            }
                          }
                        }
                      }
                    },
                    in: {
                      $mergeObjects: [
                        '$$baseObj',
                        {
                          userId: '$$p.user_id',
                          userEmail: '$$p.user_email',
                          filterField: '$$p.filter_field',
                          filterValue: '$$p.filter_value'
                        }
                      ]
                    }
                  }
                }
              }
            }
          }
        }
      ]
    )

    // scan_results
    await db.collection('scan_results').updateMany(
      { raw_data: { $exists: true } },
      { $rename: { 'raw_data': 'rawData' } }
    )
  },

  /**
   * @param {import('mongodb').Db} db
   * @param {import('mongodb').MongoClient} client
   */
  async down(db, client) {
    // Revert scan_results
    await db.collection('scan_results').updateMany(
      { rawData: { $exists: true } },
      { $rename: { 'rawData': 'raw_data' } }
    )

    // Revert sheets.permissions back to snake_case
    await db.collection('sheets').updateMany(
      { permissions: { $exists: true, $type: 'array' } },
      [
        {
          $set: {
            permissions: {
              $map: {
                input: '$permissions',
                as: 'p',
                in: {
                  $let: {
                    vars: {
                      baseObj: {
                        $arrayToObject: {
                          $filter: {
                            input: { $objectToArray: '$$p' },
                            as: 'kv',
                            cond: {
                              $not: {
                                $in: [
                                  '$$kv.k',
                                  ['userId', 'userEmail', 'filterField', 'filterValue']
                                ]
                              }
                            }
                          }
                        }
                      }
                    },
                    in: {
                      $mergeObjects: [
                        '$$baseObj',
                        {
                          user_id: '$$p.userId',
                          user_email: '$$p.userEmail',
                          filter_field: '$$p.filterField',
                          filter_value: '$$p.filterValue'
                        }
                      ]
                    }
                  }
                }
              }
            }
          }
        }
      ]
    )

    // Revert sheets top-level
    await db.collection('sheets').updateMany(
      { ownerId: { $exists: true } },
      { $rename: { 'ownerId': 'owner_id' } }
    )
    await db.collection('sheets').updateMany(
      { workbookId: { $exists: true } },
      { $rename: { 'workbookId': 'workbook_id' } }
    )

    // Revert workbooks
    await db.collection('workbooks').updateMany(
      { ownerId: { $exists: true } },
      { $rename: { 'ownerId': 'owner_id' } }
    )

    // Revert accounts
    await db.collection('accounts').updateMany(
      { userId: { $exists: true } },
      { $rename: { 'userId': 'user_id' } }
    )

    // Revert users
    await db.collection('users').updateMany(
      { isAdmin: { $exists: true } },
      { $rename: { 'isAdmin': 'is_admin' } }
    )
  }
}
