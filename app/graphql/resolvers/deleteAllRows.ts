import { getSheetsCollection, getRowsCollection, getDb } from '@/app/lib/mongodb'
import { ObjectId } from 'mongodb'
import { Context } from '../types'

import { get_authenticated_user, check_user_can_edit_sheet } from './utils'

export default async function deleteAllRows (_: unknown, { sheetId }: { sheetId: ObjectId }, context: Context) {
    const user = await get_authenticated_user(context)
    const sheetsCollection = await getSheetsCollection()
    const sheet = await sheetsCollection.findOne({_id: sheetId})
    if (!sheet) throw new Error('Sheet not found')
    check_user_can_edit_sheet(user, sheet)
    
    const rowsCollection = await getRowsCollection()
    const rows = await rowsCollection.find({ sheetId }).toArray()
    
    // Sposta tutte le righe in deleted_rows con deletedAt e deletedBy
    if (rows.length > 0) {
        const db = await getDb()
        const deletedRows = db.collection('deleted_rows')
        const rowsToDelete = rows.map(row => ({ 
            ...row, 
            deletedOn: new Date(), 
            deletedBy: user.email 
        }))
        await deletedRows.insertMany(rowsToDelete)
        await rowsCollection.deleteMany({ sheetId })
    }
    
    return rows.length
}
