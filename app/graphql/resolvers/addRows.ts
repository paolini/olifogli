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

    type Olimanager = {
        error: string,
        participantId?: string,
    }

    const objectRows: Array<{data: Record<string, string>, olimanager?: Olimanager}> = rows.map(row => {
        const data: Record<string, string> = {};
        let olimanager: Olimanager | undefined;
        columns.forEach((column, i) => {
            const value = row[i];
            if (column.startsWith('olimanager.')) {
                if (!olimanager) olimanager = {
                    error: ''
                };
                const field = column.substring('olimanager.'.length);
                if (field !== 'participantId') throw new Error(`invalid column: ${column}`);
                olimanager[field] = value;
            } else {
                if (column.startsWith('data.')) {
                    column = column.substring('data.'.length);
                }
                data[column] = value;
            }
        });
        return { data: data, olimanager };
    });

    const workbookCollection = await getWorkbooksCollection()
    const workbook = await workbookCollection.findOne({_id: sheet.workbookId})

    if (!workbook) throw new Error(`cannot find collection ${sheet.workbookId}`)

    const validatedRows: (WithoutId<Row>)[] = objectRows
        .map(({data, olimanager}) => {
            const validated = schema.clean(data as Data)
            const derived = schema.computeDerivedData(validated,sheet.commonData,workbook.commonData)
            return {
                data: derived.data,
                sheetId,
                createdBy,
                createdOn,
                updatedBy,
                updatedOn,
                error: derived.error,
                anomalies: derived.anomalies,
                ...olimanager?{olimanager}:{}
            }
        })
    
    // Calcola quante righe valide e quante anomalie sono state inserite
    const nValidRows = validatedRows.filter(r => r.error === '' || !r.error).length
    const anomalies = validatedRows.reduce((sum, r) => sum + r.anomalies, 0)

    // Usa una transazione per garantire la consistenza
    const insertedCount = await withTransaction(async (session) => {
        const collection = await getRowsCollection()
        const res = await collection.insertMany(validatedRows, { session })
        
        // Aggiorna i contatori dello sheet
        await sheetsCollection.updateOne(
            { _id: sheetId },
            { 
                $inc: { nRows: res.insertedCount, nValidRows, anomalies },
                $set: { updatedAt: updatedOn }
            },
            { session }
        )
        
        return res.insertedCount
    })
    
    return insertedCount
}
