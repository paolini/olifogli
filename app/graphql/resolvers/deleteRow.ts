import { getSheetsCollection, getRowsCollection, getDb } from '@/app/lib/mongodb'
import { ObjectId } from 'mongodb'
import { Context } from '../types'

import { get_authenticated_user, check_user_can_edit_sheet } from './utils'

export default async function deleteRow (_: unknown, { _id }: { _id: ObjectId }, context: Context) {
    const user = await get_authenticated_user(context)
    const rowsCollection = await getRowsCollection()
    const row = await rowsCollection.findOne({ _id })
    if (!row) throw new Error('Row not found')
    const sheetsCollection = await getSheetsCollection()
    const sheet = await sheetsCollection.findOne({_id: row.sheetId})
    check_user_can_edit_sheet(user,sheet)
    // Sposta la riga in deleted_rows con deletedAt e deletedBy
    const db = await getDb();
    const deletedRows = db.collection('deleted_rows');
    await deletedRows.insertOne({ ...row, deletedOn: new Date(), deletedBy: user.email })
    await rowsCollection.deleteOne({ _id });
    return _id;
}
