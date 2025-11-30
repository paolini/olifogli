import { getSheetsCollection, getRowsCollection, withTransaction, getWorkbooksCollection } from '@/app/lib/mongodb'
import { WithoutId } from 'mongodb'
import { Context } from '../types'
import { schemas } from '@/app/lib/schema'
import { Data, Row } from '@/app/lib/models'

import { get_authenticated_user, check_user_can_edit_rows } from './utils'
import { MutationAddRowsArgs } from '../generated'

export default async function addRows(_: unknown, {sheetId, columns, rows}: MutationAddRowsArgs, context: Context) {
    const user = await get_authenticated_user(context)
    const sheetsCollection = await getSheetsCollection();
    const sheet = await sheetsCollection.findOne({_id: sheetId})
    check_user_can_edit_rows(user, sheet)
    const schema = schemas[sheet.schema]
    const createdOn = new Date()
    const createdBy = user.email
    const updatedOn = createdOn
    const updatedBy = createdBy
    // Applica filtro permission: forza tutti i campi filterField ai rispettivi filterValue
    const objectRows = rows.map(row => {
        const obj = Object.fromEntries(columns.map((column,i)=>[column,row[i]]));
        return obj
    })

    const workbookCollection = await getWorkbooksCollection()
    const workbook = await workbookCollection.findOne({_id: sheet.workbookId})

    if (!workbook) throw new Error(`cannot find collection ${sheet.workbookId}`)

    const validatedRows: WithoutId<Row>[] = objectRows
        .map(row => schema.clean(row as Data))
        .map(data => ({
            ...schema.computeDerivedData(data,sheet.commonData,workbook.commonData),
            sheetId,
            createdBy,
            createdOn,
            updatedBy,
            updatedOn,
        }))
    
    // Usa una transazione per garantire la consistenza
    const insertedCount = await withTransaction(async (session) => {
        const collection = await getRowsCollection()
        const res = await collection.insertMany(validatedRows, { session })
        
        // Calcola quante righe valide sono state inserite
        const nValidRows = validatedRows.filter(r => r.error === '' || !r.error).length
        
        // Aggiorna i contatori dello sheet
        await sheetsCollection.updateOne(
            { _id: sheetId },
            { 
                $inc: { nRows: res.insertedCount, nValidRows },
                $set: { updatedAt: updatedOn }
            },
            { session }
        )
        
        return res.insertedCount
    })
    
    return insertedCount
}
