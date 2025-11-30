import { getSheetsCollection, getRowsCollection, getDb, withTransaction } from '@/app/lib/mongodb'
import { ObjectId } from 'mongodb'
import { Context } from '../types'

import { get_authenticated_user, check_user_can_edit_rows } from './utils'

export default async function deleteAllRows (_: unknown, { sheetId }: { sheetId: ObjectId }, context: Context) {
    const user = await get_authenticated_user(context)
    const sheetsCollection = await getSheetsCollection()
    const sheet = await sheetsCollection.findOne({_id: sheetId})
    if (!sheet) throw new Error('Sheet not found')
    check_user_can_edit_rows(user, sheet)
    
    const rowsCollection = await getRowsCollection()
    const rows = await rowsCollection.find({ sheetId }).toArray()
    
    if (rows.length === 0) {
        return 0
    }
    
    // Usa una transazione per garantire la consistenza
    await withTransaction(async (session) => {
        const db = await getDb()
        const deletedRows = db.collection('deleted_rows')
        
        // Sposta tutte le righe in deleted_rows con deletedOn e deletedBy
        const rowsToDelete = rows.map(row => ({ 
            ...row, 
            deletedOn: new Date(), 
            deletedBy: user.email 
        }))
        await deletedRows.insertMany(rowsToDelete, { session })
        await rowsCollection.deleteMany({ sheetId }, { session })
        
        // Conta le righe valide eliminate
        const nValidRows = rows.filter(r => r.error === '' || !r.error).length
        
        // Azzera i contatori dello sheet
        await sheetsCollection.updateOne(
            { _id: sheetId },
            { $set: { nRows: 0, nValidRows: 0, updatedAt: new Date() } },
            { session }
        )
    })
    
    return rows.length
}
