import { ClientSession, Filter, ObjectId } from 'mongodb'
import { getDb, getRowsCollection, getSheetsCollection } from '@/app/lib/mongodb'
import { Row, Sheet } from '@/app/lib/models'

// Contributions of a row to the denormalized counters of its sheet.
export function rowCounters(row: Pick<Row, 'error' | 'anomalies' | 'olimanager'>) {
    return {
        nRows: 1,
        nValidRows: !row.error ? 1 : 0,
        nSyncedRows: row.olimanager?.resultsUpdatedOn ? 1 : 0,
        anomalies: row.anomalies || 0,
    }
}

/**
 * Moves the rows matching `filter` to `deleted_rows` and updates the counters
 * of their sheets. Must run inside the caller's transaction: the rows are read
 * with the same session, so the copy, the deletion and the counters refer to
 * the same rows even if others are added or changed concurrently.
 * Returns the deleted rows.
 */
export async function moveRowsToTrash(filter: Filter<Row>, deletedBy: string, session: ClientSession): Promise<Row[]> {
    const rows = await getRowsCollection()
    const found = await rows.find(filter, { session }).toArray()
    if (found.length === 0) return []

    const deletedOn = new Date()
    const trash = (await getDb()).collection<Row & { deletedOn: Date, deletedBy: string }>('deleted_rows')
    await trash.bulkWrite(found.map(row => ({ replaceOne: {
        filter: { _id: row._id },
        replacement: { ...row, deletedOn, deletedBy },
        upsert: true,
    } })), { session })
    await rows.deleteMany({ _id: { $in: found.map(row => row._id) } }, { session })

    const bySheet = new Map<string, { nRows: number, nValidRows: number, nSyncedRows: number, anomalies: number }>()
    for (const row of found) {
        const total = bySheet.get(row.sheetId.toString()) ?? { nRows: 0, nValidRows: 0, nSyncedRows: 0, anomalies: 0 }
        const counters = rowCounters(row)
        total.nRows += counters.nRows
        total.nValidRows += counters.nValidRows
        total.nSyncedRows += counters.nSyncedRows
        total.anomalies += counters.anomalies
        bySheet.set(row.sheetId.toString(), total)
    }
    const sheets = await getSheetsCollection()
    await sheets.bulkWrite([...bySheet].map(([sheetId, total]) => ({ updateOne: {
        filter: { _id: new ObjectId(sheetId) },
        update: {
            $inc: { nRows: -total.nRows, nValidRows: -total.nValidRows, nSyncedRows: -total.nSyncedRows, anomalies: -total.anomalies },
            $set: { updatedAt: deletedOn },
        },
    } })), { session })
    return found
}

/**
 * Deletes sheets with all their rows, copying both to deleted_rows and
 * deleted_sheets, inside the caller's transaction. Returns the deleted sheets.
 */
export async function moveSheetsToTrash(ids: ObjectId[], deletedBy: string, session: ClientSession): Promise<Sheet[]> {
    const sheets = await getSheetsCollection()
    const found = await sheets.find({ _id: { $in: ids } }, { session }).toArray()
    if (found.length === 0) return []
    const foundIds = found.map(sheet => sheet._id)
    await moveRowsToTrash({ sheetId: { $in: foundIds } }, deletedBy, session)

    const deletedOn = new Date()
    const trash = (await getDb()).collection<Sheet & { deletedOn: Date, deletedBy: string }>('deleted_sheets')
    await trash.bulkWrite(found.map(sheet => ({ replaceOne: {
        filter: { _id: sheet._id },
        replacement: { ...sheet, deletedOn, deletedBy },
        upsert: true,
    } })), { session })
    await sheets.deleteMany({ _id: { $in: foundIds } }, { session })
    return found
}
