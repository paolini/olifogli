import { appLog } from '@/app/lib/appLog'
import { getSheetsCollection, getRowsCollection, withTransaction } from '@/app/lib/mongodb'
import { ObjectId } from 'mongodb'
import { Context } from '../types'

import { get_authenticated_user, check_user_can_edit_rows } from './utils'
import { TOPICS, workbookUpdatedPayload } from '@/app/lib/pubsub'
import { moveRowsToTrash } from './rowTrash'

export default async function deleteRows(_: unknown, {ids}: {
    ids: ObjectId[]}, context: Context) {
    const user = await get_authenticated_user(context)
    const rowsCollection = await getRowsCollection();

    // Le righe possono appartenere a fogli diversi: controlla i permessi su ciascuno
    const sheetIds = await rowsCollection.distinct('sheetId', { _id: { $in: ids } }) as ObjectId[]
    if (sheetIds.length === 0) return 0
    const sheetsCollection = await getSheetsCollection();
    const sheets = await sheetsCollection.find({ _id: { $in: sheetIds } }).toArray()
    if (sheets.length !== sheetIds.length) throw new Error('foglio inesistente')
    for (const sheet of sheets) check_user_can_edit_rows(user, sheet)

    // Only rows of the checked sheets, read again inside the transaction.
    const deleted = await withTransaction(session => moveRowsToTrash(
        { _id: { $in: ids }, sheetId: { $in: sheetIds } }, user.email, session))

    for (const sheet of sheets) {
        const sheetRows = deleted.filter(row => row.sheetId.equals(sheet._id)).map(row => row._id)
        if (sheetRows.length === 0) continue
        context.pubsub?.publish(TOPICS.ROWS_DELETED(sheet._id.toString()), { rowsDeleted: sheetRows })
        context.pubsub?.publish(TOPICS.WORKBOOK_UPDATED(sheet.workbookId.toString()), workbookUpdatedPayload(sheet))
    }

    appLog('rows.deleted', { count: deleted.length, sheetIds: sheets.map(sheet => sheet._id.toString()) }, { userId: user._id })

    return deleted.length;
}
