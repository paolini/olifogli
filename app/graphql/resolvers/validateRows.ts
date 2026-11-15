import { getSheetsCollection, getRowsCollection, getWorkbooksCollection, withTransaction } from '@/app/lib/mongodb'
import { TOPICS, workbookUpdatedPayload } from '@/app/lib/pubsub'
import { Context } from '../types'
import { schemas } from '@/app/lib/schema'
import { MutationValidateRowsArgs } from '../generated'

import { get_authenticated_user, check_admin } from './utils'
import { rowCounters } from './rowTrash'

// Recompute validation and derived data of every row of a sheet (admin only).
export default async function validateRows(_: unknown, {sheetId}: MutationValidateRowsArgs, context: Context) {
    const user = await get_authenticated_user(context)
    check_admin(user)
    const sheetsCollection = await getSheetsCollection();
    const rowsCollection = await getRowsCollection();
    const sheet = await sheetsCollection.findOne({_id: sheetId})
    if (!sheet) throw new Error("sheet not found")

    const workbooksCollection = await getWorkbooksCollection()
    const workbook = await workbooksCollection.findOne({_id: sheet.workbookId})
    if (!workbook) throw new Error('Workbook not found for sheet')

    const schema = schemas[sheet.schema]
    const validationContext = schema.validationContext(sheet.commonData, workbook.commonData)

    // Rows are read inside the transaction, so the counters are computed from the
    // rows actually written; one bulkWrite keeps the transaction short.
    const updateCount = await withTransaction(async (session) => {
        const objectRows = await rowsCollection.find({ sheetId }, { session }).toArray()
        const totals = { nRows: 0, nValidRows: 0, nSyncedRows: 0, anomalies: 0 }
        const updates = []
        for (const row of objectRows) {
            const derivedData = await schema.computeDerivedData(schema.clean(row.data), validationContext)
            const counters = rowCounters({ ...row, ...derivedData })
            totals.nRows += counters.nRows
            totals.nValidRows += counters.nValidRows
            totals.nSyncedRows += counters.nSyncedRows
            totals.anomalies += counters.anomalies
            updates.push({ updateOne: { filter: { _id: row._id }, update: { $set: { ...derivedData } } } })
        }
        if (updates.length > 0) await rowsCollection.bulkWrite(updates, { session })

        // Counters are set from the recomputed rows, which also fixes any drift.
        await sheetsCollection.updateOne(
            { _id: sheetId },
            { $set: { ...totals, updatedAt: new Date() } },
            { session }
        )
        return objectRows.length
    })

    // Clients refetch the rows when they receive sheetUpdated.
    context.pubsub?.publish(TOPICS.SHEET_UPDATED(sheetId.toString()), { sheetUpdated: await sheetsCollection.findOne({ _id: sheetId }) })
    context.pubsub?.publish(TOPICS.WORKBOOK_UPDATED(sheet.workbookId.toString()), workbookUpdatedPayload(sheet))
    return updateCount
}
