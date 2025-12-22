import { getSheetsCollection, getRowsCollection, getWorkbooksCollection, withTransaction } from '@/app/lib/mongodb'
import { ObjectId } from 'mongodb'

import { Context } from '../types'
import { schemas } from '@/app/lib/schema'
import { get_authenticated_user, check_user_can_edit_rows, check_user_can_view_sheet } from './utils'

export default async function toggleSelection(_: unknown, {rowId, label}: {
    rowId: ObjectId,
    label: string }, context: Context) {
    const user = await get_authenticated_user(context)
    const rowsCollection = await getRowsCollection();
    const row = await rowsCollection.findOne({ _id: rowId });
    if (!row) throw new Error('Row not found');
    const sheetsCollection = await getSheetsCollection();
    const sheet = await sheetsCollection.findOne({_id: row.sheetId})
    check_user_can_view_sheet(user,sheet)

    const workbook = await getWorkbooksCollection().then(c => c.findOne({_id: sheet.workbookId}))
    if (!workbook) throw new Error('Workbook not found for sheet')

    const schema = schemas[sheet.schema]
    // Verifica che la label sia valida per lo schema
    if (!schema.selections.some(s => s.label === label)) {
        throw new Error(`Selezione "${label}" non valida per lo schema "${sheet.schema}"`)
    }

    // Toggle selezione
    const currentSelections = row.selections || [];
    const existingIndex = currentSelections.findIndex(s => s.label === label);
    let newSelections: typeof currentSelections;
    if (existingIndex >= 0) {
        // Rimuovi
        newSelections = currentSelections.filter(s => s.label !== label);
    } else {
        // Aggiungi
        newSelections = [...currentSelections, {
            label,
            selected_by: user.email,
            timestamp: new Date()
        }];
    }
    
    // Usa una transazione per garantire la consistenza
    const updatedRow = await withTransaction(async (session) => {
        const $set = {
            selections: newSelections,
            updatedOn: new Date(),
            updatedBy: user.email,
        }
        await rowsCollection.updateOne({ _id: rowId }, { $set }, { session })
                
        // Aggiorna updatedAt del sheet
        await sheetsCollection.updateOne(
            { _id: row.sheetId },
            { $set: { updatedAt: new Date() } },
            { session }
        )
        
        return await rowsCollection.findOne({ _id: rowId }, { session })
    })

    return updatedRow
}