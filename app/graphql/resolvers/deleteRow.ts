import { getSheetsCollection, getRowsCollection, getDb, withTransaction, getWorkbooksCollection } from '@/app/lib/mongodb'
import { ObjectId } from 'mongodb'
import { Context } from '../types'

import { get_authenticated_user, check_user_can_edit_rows } from './utils'
import { schemas } from '@/app/lib/schema'
import { TOPICS } from '@/app/lib/pubsub'

export default async function deleteRow(_: unknown, {_id}: {
    _id: ObjectId}, context: Context) {
    const user = await get_authenticated_user(context)
    const rowsCollection = await getRowsCollection();
    const row = await rowsCollection.findOne({ _id });
    if (!row) throw new Error('Row not found');
    const sheetsCollection = await getSheetsCollection();
    const sheet = await sheetsCollection.findOne({_id: row.sheetId})
    check_user_can_edit_rows(user,sheet)
        
    // calcola decrementi nValidRows e anomalies
    const nRows = -1
    const nValidRows = -((row.error === '' || !row.error) ? 1 : 0)
    const anomalies = -(row.anomalies || 0)

    // Usa una transazione per garantire la consistenza tra row e sheet
    await withTransaction(async (session) => {
        const db = await getDb();
        const deletedRows = db.collection('deleted_rows');
        
        // Sposta la riga in deleted_rows con deletedOn e deletedBy
        await deletedRows.insertOne(
            { ...row, deletedOn: new Date(), deletedBy: user.email },
            { session }
        )
        
        // Elimina la riga
        await rowsCollection.deleteOne({ _id }, { session });
        
        await sheetsCollection.updateOne(
            { _id: row.sheetId },
            { 
                $inc: { nRows, nValidRows, anomalies },
                $set: { updatedAt: new Date() }
            },
            { session }
        )
    })
    
    context.pubsub?.publish(TOPICS.ROWS_DELETED(row.sheetId.toString()), {
        rowsDeleted: [row._id]
    })
    if (sheet) {
        context.pubsub?.publish(TOPICS.WORKBOOK_UPDATED(sheet.workbookId.toString()), {
            workbookUpdated: true,
            _allowedEmails: (sheet.permissions ?? []).map((p: { email: string }) => p.email),
        })
    }

    return _id;
}
