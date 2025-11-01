import { getSheetsCollection, getRowsCollection, getDb, withTransaction } from '@/app/lib/mongodb'
import { ObjectId } from 'mongodb'
import { Context } from '../types'

import { get_authenticated_user, check_user_can_edit_rows } from './utils'

export default async function deleteRow(_: unknown, {_id}: {
    _id: ObjectId}, context: Context) {
    const user = await get_authenticated_user(context)
    const rowsCollection = await getRowsCollection();
    const row = await rowsCollection.findOne({ _id });
    if (!row) throw new Error('Row not found');
    const sheetsCollection = await getSheetsCollection();
    const sheet = await sheetsCollection.findOne({_id: row.sheetId})
    check_user_can_edit_rows(user,sheet)
    
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
        
        // Decrementa nRows e, se la riga era valida, nValidRows
        const updateFields: { nRows: number; nValidRows?: number } = { nRows: -1 }
        if (row.error === '' || !row.error) {
            updateFields.nValidRows = -1
        }
        
        await sheetsCollection.updateOne(
            { _id: row.sheetId },
            { $inc: updateFields },
            { session }
        )
    })
    
    return _id;
}
