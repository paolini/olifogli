import { appLog } from '@/app/lib/appLog'
import { withTransaction } from '@/app/lib/mongodb'
import { TOPICS, workbookUpdatedPayload } from '@/app/lib/pubsub'
import { Context } from '../types'

import { get_authenticated_user, check_admin } from './utils'
import { MutationDeleteSheetsArgs } from '../generated'
import { moveSheetsToTrash } from './rowTrash'

export default async function deleteSheets (_: unknown, { ids }: MutationDeleteSheetsArgs, context: Context) {
    const user = await get_authenticated_user(context)
    check_admin(user)
    // Sheets and rows are copied to deleted_sheets/deleted_rows and deleted in
    // one transaction: a failure leaves everything as it was.
    const deleted = await withTransaction(session => moveSheetsToTrash(ids, user.email, session))
    for (const sheet of deleted) {
        context.pubsub?.publish(TOPICS.WORKBOOK_UPDATED(sheet.workbookId.toString()), workbookUpdatedPayload(sheet))
    }
    appLog('sheets.deleted', { count: deleted.length, sheetIds: deleted.map(sheet => sheet._id.toString()) }, { userId: user._id })
    return true
}
