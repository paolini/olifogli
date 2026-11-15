import { appLog } from '@/app/lib/appLog'
import { withTransaction } from '@/app/lib/mongodb'
import { TOPICS, workbookUpdatedPayload } from '@/app/lib/pubsub'
import { Context } from '../types'

import { get_authenticated_user, check_admin } from './utils'
import { MutationDeleteSheetArgs } from '../generated'
import { moveSheetsToTrash } from './rowTrash'

// Same as deleteSheets for one sheet: rows are moved to deleted_rows too,
// instead of being left in `rows` without their sheet.
export default async function deleteSheet (_: unknown, { _id }: MutationDeleteSheetArgs, context: Context) {
    const user = await get_authenticated_user(context)
    check_admin(user)
    const [sheet] = await withTransaction(session => moveSheetsToTrash([_id], user.email, session))
    if (sheet) context.pubsub?.publish(TOPICS.WORKBOOK_UPDATED(sheet.workbookId.toString()), workbookUpdatedPayload(sheet))
    appLog('sheet.deleted', { sheetId: _id.toString() }, { userId: user._id })
    return true
}
