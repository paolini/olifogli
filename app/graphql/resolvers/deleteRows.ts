import { getSheetsCollection, getRowsCollection, getDb, withTransaction, getWorkbooksCollection } from '@/app/lib/mongodb'
import { ObjectId } from 'mongodb'
import { Context } from '../types'

import { get_authenticated_user, check_user_can_edit_rows } from './utils'
import { schemas } from '@/app/lib/schema'
import { TOPICS } from '@/app/lib/pubsub'

export default async function deleteRows(_: unknown, {ids}: {
    ids: ObjectId[]}, context: Context) {
    const user = await get_authenticated_user(context)
    const rowsCollection = await getRowsCollection();
    
    // Trova tutte le righe da eliminare
    const rows = await rowsCollection.find({ _id: { $in: ids } }).toArray();
    
    if (rows.length === 0) {
        return 0;
    }
    
    // Controlla i permessi per ogni sheet (potrebbero essere di sheet diversi)
    const workbooksCollection = await getWorkbooksCollection();
    const sheetsCollection = await getSheetsCollection();
    const sheetIds = [...new Set(rows.map(row => row.sheetId.toString()))];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sheetMap = new Map<string, any>();
    
    for (const sheetId of sheetIds) {
        const sheet = await sheetsCollection.findOne({_id: new ObjectId(sheetId)});
        check_user_can_edit_rows(user, sheet);
        sheetMap.set(sheetId, sheet);
    }
    
    // Usa una transazione per garantire la consistenza
    await withTransaction(async (session) => {
        const db = await getDb();
        const deletedRows = db.collection('deleted_rows');
        
        // Sposta le righe in deleted_rows con deletedOn e deletedBy
        const rowsWithDeletionInfo = rows.map(row => ({
            ...row,
            deletedOn: new Date(),
            deletedBy: user.email
        }));
        
        await deletedRows.insertMany(rowsWithDeletionInfo, { session });
        await rowsCollection.deleteMany({ _id: { $in: ids } }, { session });
        
        // Aggiorna i contatori per ogni sheet
        // Raggruppa le righe per sheetId
        const rowsBySheet = rows.reduce((acc, row) => {
            const key = row.sheetId.toString()
            if (!acc[key]) acc[key] = []
            acc[key].push(row)
            return acc
        }, {} as Record<string, typeof rows>)
        
        // Aggiorna ogni sheet
        for (const [sheetIdStr, sheetRows] of Object.entries(rowsBySheet)) {
            const sheet = await sheetsCollection.findOne({_id: new ObjectId(sheetIdStr)})
            if (!sheet) throw new Error(`Sheet not found with id ${sheetIdStr}`)
            const nRows = -sheetRows.length
            const nValidRows = -sheetRows.filter(r => r.error === '' || !r.error).length
            const anomalies = -sheetRows.reduce((acc, row) => { return acc + row.anomalies }, 0)

            await sheetsCollection.updateOne(
                { _id: new ObjectId(sheetIdStr) },
                { 
                    $inc: { nRows, nValidRows, anomalies },
                    $set: { updatedAt: new Date() }
                },
                { session }
            )
        }
    })
    
    for (const [sheetIdStr, sheetRows] of Object.entries(
        rows.reduce((acc, row) => { (acc[row.sheetId.toString()] ??= []).push(row._id); return acc }, {} as Record<string, typeof rows[0]['_id'][]>)
    )) {
        context.pubsub?.publish(TOPICS.ROWS_DELETED(sheetIdStr), {
            rowsDeleted: sheetRows
        })
    }
    for (const [sheetIdStr, sheet] of sheetMap.entries()) {
        if (!sheet) continue
        context.pubsub?.publish(TOPICS.WORKBOOK_UPDATED(sheet.workbookId.toString()), {
            workbookUpdated: true,
            _allowedEmails: (sheet.permissions ?? []).map((p: { email: string }) => p.email),
        })
    }

    return rows.length;
}
