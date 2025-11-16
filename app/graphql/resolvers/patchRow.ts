import { getSheetsCollection, getRowsCollection, getWorkbooksCollection, withTransaction } from '@/app/lib/mongodb'
import { ObjectId } from 'mongodb'

import { Context } from '../types'
import { schemas } from '@/app/lib/schema'
import { Data } from '@/app/lib/models'
import { get_authenticated_user, check_user_can_edit_rows } from './utils'

export default async function patchRow(_: unknown, {_id, updatedOn, data}: {
    _id: ObjectId,
    updatedOn: Date,
    data: Data }, context: Context) {
    const user = await get_authenticated_user(context)
    const rowsCollection = await getRowsCollection();
    const row = await rowsCollection.findOne({ _id });
    if (!row) throw new Error('Row not found');
    const sheetsCollection = await getSheetsCollection();
    const sheet = await sheetsCollection.findOne({_id: row.sheetId})
    check_user_can_edit_rows(user,sheet)

    const workbooksCollection = await getWorkbooksCollection()
    const workbook = await workbooksCollection.findOne({_id: sheet.workbookId})
    if (!workbook) throw new Error('Workbook not found for sheet')

    const schema = schemas[sheet.schema]
    if (row.updatedOn && row.updatedOn.getTime() !== updatedOn.getTime()) {
        throw new Error(`La riga è stata modificata da qualcun altro`);
    }
    data = {...row.data, ...data} // mantiene i campi non modificati
    data = schema.clean(data)
    const derived_data = await schema.computeDerivedData(data, sheet.commonData, workbook.commonData)
    
    // Determina se la validità è cambiata
    const wasValid = row.error === '' || !row.error
    const isValid = derived_data.error === '' || !derived_data.error
    
    // Usa una transazione per garantire la consistenza
    const updatedRow = await withTransaction(async (session) => {
        const $set = {
            ...derived_data,
            updatedOn: new Date(),
            updatedBy: user.email,
        }
        await rowsCollection.updateOne({ _id }, { $set }, { session })
        
        // Aggiorna nValidRows dello sheet se la validità è cambiata
        if (wasValid && !isValid) {
            // La riga è diventata invalida
            await sheetsCollection.updateOne(
                { _id: row.sheetId },
                { $inc: { nValidRows: -1 } },
                { session }
            )
        } else if (!wasValid && isValid) {
            // La riga è diventata valida
            await sheetsCollection.updateOne(
                { _id: row.sheetId },
                { $inc: { nValidRows: 1 } },
                { session }
            )
        }
        
        const updatedRow = await rowsCollection.findOne({ _id }, { session })
        if (!updatedRow) throw new Error('Row not found after update')
        return updatedRow
    })
    
    return updatedRow
}

