import { appLog } from '@/app/lib/appLog'
import { getSheetsCollection, withTransaction } from '@/app/lib/mongodb'
import { ObjectId } from 'mongodb'
import { TOPICS, workbookUpdatedPayload } from '@/app/lib/pubsub'
import { Context } from '../types'

import { get_authenticated_user, check_user_can_edit_rows } from './utils'
import { moveRowsToTrash } from './rowTrash'

export default async function deleteAllRows (_: unknown, { sheetId }: { sheetId: ObjectId }, context: Context) {
    const user = await get_authenticated_user(context)
    const sheetsCollection = await getSheetsCollection()
    const sheet = await sheetsCollection.findOne({_id: sheetId})
    if (!sheet) throw new Error('Sheet not found')
    check_user_can_edit_rows(user, sheet)

    // The rows are read inside the transaction: a row added meanwhile is either
    // copied and deleted with the others or left untouched, never lost.
    const deleted = await withTransaction(session => moveRowsToTrash({ sheetId }, user.email, session))
    if (deleted.length === 0) return 0

    context.pubsub?.publish(TOPICS.ROWS_DELETED(sheetId.toString()), { rowsDeleted: deleted.map(row => row._id) })
    context.pubsub?.publish(TOPICS.WORKBOOK_UPDATED(sheet.workbookId.toString()), workbookUpdatedPayload(sheet))
    appLog('rows.deleted_all', { count: deleted.length, sheetId: sheetId.toString() }, { userId: user._id })
    return deleted.length
}
