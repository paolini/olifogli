import { getSheetsCollection, getRowsCollection, getDb } from '@/app/lib/mongodb'
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
    
    // Sposta le righe in deleted_rows con deletedOn e deletedBy
    const db = await getDb();
    const deletedRows = db.collection('deleted_rows');
    const rowsWithDeletionInfo = rows.map(row => ({
        ...row,
        deletedOn: new Date(),
        deletedBy: user.email
    }));
    
    await deletedRows.insertMany(rowsWithDeletionInfo);
    await rowsCollection.deleteMany({ _id: { $in: ids } });
    
    return rows.length;
}
