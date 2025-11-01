import { getSheetsCollection, getRowsCollection, getDb, withTransaction } from '@/app/lib/mongodb'
import { ObjectId } from 'mongodb'
import { Context } from '../types'

import { get_authenticated_user, check_user_can_edit_rows } from './utils'

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
    const sheetsCollection = await getSheetsCollection();
    const sheetIds = [...new Set(rows.map(row => row.sheetId.toString()))];
    
    for (const sheetId of sheetIds) {
        const sheet = await sheetsCollection.findOne({_id: new ObjectId(sheetId)});
        check_user_can_edit_rows(user, sheet);
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
            const nRows = -sheetRows.length
            const nValidRows = -sheetRows.filter(r => r.error === '' || !r.error).length
            
            await sheetsCollection.updateOne(
                { _id: new ObjectId(sheetIdStr) },
                { $inc: { nRows, nValidRows } },
                { session }
            )
        }
    })
    
    return rows.length;
}
