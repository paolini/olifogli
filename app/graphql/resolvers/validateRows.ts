import { getSheetsCollection, getRowsCollection, getWorkbooksCollection, withTransaction } from '@/app/lib/mongodb'
import { Context } from '../types'
import { schemas } from '@/app/lib/schema'
import { MutationValidateRowsArgs } from '../generated'

import { get_authenticated_user, check_user_can_edit_rows } from './utils'

export default async function validateRows(_: unknown, {sheetId}: MutationValidateRowsArgs, context: Context) {
    const user = await get_authenticated_user(context)
    if (!user.isAdmin) throw new Error("only admins can add rows in this way")
    const sheetsCollection = await getSheetsCollection();
    const rowsCollection = await getRowsCollection();
    const sheet = await sheetsCollection.findOne({_id: sheetId})
    if (!sheet) throw new Error("sheet not found")
    
    const workbooksCollection = await getWorkbooksCollection()
    const workbook = await workbooksCollection.findOne({_id: sheet.workbookId})
    if (!workbook) throw new Error('Workbook not found for sheet')
    
    const schema = schemas[sheet.schema]
    const objectRows = await rowsCollection.find({sheetId}).toArray()
    
    // Usa una transazione per garantire la consistenza
    const updateCount = await withTransaction(async (session) => {
        let count = 0
        let validityChanges = 0 // Conteggio dei cambi di validità
        
        for (const row of objectRows) {
            const wasValid = row.error === '' || !row.error
            
            const cleanedData = schema.clean(row.data)
            const derivedData = await schema.computeDerivedData(cleanedData, sheet.commonData, workbook.commonData)
            
            const isValid = derivedData.error === '' || !derivedData.error
            
            // Aggiorna la riga
            await rowsCollection.updateOne(
                { _id: row._id },
                {
                    $set: {
                        ...derivedData,
                    }
                },
                { session }
            )
            count++
            
            // Traccia il cambio di validità
            if (wasValid && !isValid) {
                validityChanges-- // Diventata invalida
            } else if (!wasValid && isValid) {
                validityChanges++ // Diventata valida
            }
        }
        
        // Aggiorna nValidRows dello sheet se ci sono stati cambiamenti
        if (validityChanges !== 0) {
            await sheetsCollection.updateOne(
                { _id: sheetId },
                { $inc: { nValidRows: validityChanges } },
                { session }
            )
        }
        
        return count
    })
    
    return updateCount
}
