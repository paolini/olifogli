import { appLog } from '@/app/lib/appLog'
import { getSheetsCollection, getRowsCollection, withTransaction } from '@/app/lib/mongodb'
import { ObjectId } from 'mongodb'
import { Context } from '../types'

import { get_authenticated_user, check_user_can_edit_rows } from './utils'
import { TOPICS, workbookUpdatedPayload } from '@/app/lib/pubsub'
import { moveRowsToTrash } from './rowTrash'

export default async function deleteRow(_: unknown, {_id}: {
    _id: ObjectId}, context: Context) {
    const user = await get_authenticated_user(context)
    const rowsCollection = await getRowsCollection();
    const row = await rowsCollection.findOne({ _id });
    if (!row) throw new Error('Row not found');
    const sheetsCollection = await getSheetsCollection();
    const sheet = await sheetsCollection.findOne({_id: row.sheetId})
    check_user_can_edit_rows(user,sheet)

    // Row copy, deletion and counters (including nSyncedRows) in one transaction.
    await withTransaction(session => moveRowsToTrash({ _id, sheetId: sheet._id }, user.email, session))

    context.pubsub?.publish(TOPICS.ROWS_DELETED(row.sheetId.toString()), {
        rowsDeleted: [row._id]
    })
    context.pubsub?.publish(TOPICS.WORKBOOK_UPDATED(sheet.workbookId.toString()), workbookUpdatedPayload(sheet))

    appLog('row.deleted', { rowId: _id.toString(), sheetId: row.sheetId.toString() }, { userId: user._id })

    return _id;
}
