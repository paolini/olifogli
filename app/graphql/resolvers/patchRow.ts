import { getSheetsCollection, getRowsCollection, getWorkbooksCollection, withTransaction } from '@/app/lib/mongodb'
import { ObjectId } from 'mongodb'

import { Context } from '../types'
import { schemas } from '@/app/lib/schema'
import { Data } from '@/app/lib/models'
import { get_authenticated_user, check_user_can_edit_rows } from './utils'
import { TOPICS } from '../../lib/pubsub'

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

    if (row?.olimanager?.participantId && !user.isAdmin) {
        ["name","surname","birthDate","classYear","classSection"].forEach(field => {
            if (data[field]) {
                throw new Error(`Non è possibile modificare il campo ${field} di una riga importata da Olimanager`);
            }
        });
    }
    
    const schema = schemas[sheet.schema]
    if (row.updatedOn && row.updatedOn.getTime() !== updatedOn.getTime()) {
        throw new Error(`La riga è stata modificata da qualcun altro`);
    }

    // if the row is encrypted, disallow changing sensitive fields
    const sensitiveFields = [...schema.fields_sensitive_names, ...schema.fields_sensitive_dates]
    if (row.encrypted_data) {
        for (const f of sensitiveFields) {
            if (data[f] !== undefined && data[f] !== (row.data && row.data[f])) {
                throw new Error(`Non è possibile modificare il campo sensibile ${f} su una riga criptata`)
            }
        }
    }

    data = {...row.data, ...data} // mantiene i campi non modificati
    data = schema.clean(data)
    const validationContext = schema.validationContext(sheet.commonData, workbook.commonData)
    const derived_data = await schema.computeDerivedData(data, validationContext)
    
    // calcola l'incremento di nValid e anomalies:
    const nValidRows = (derived_data.error === '' ? 1 : 0) - (row.error === '' ? 1 : 0)
    const anomalies = derived_data.anomalies - row.anomalies
    
    // Usa una transazione per garantire la consistenza
    const updatedRow = await withTransaction(async (session) => {
        const $set = {
            ...derived_data,
            updatedOn: new Date(),
            updatedBy: user.email,
        }
        await rowsCollection.updateOne({ _id }, { $set }, { session })
                
        // Anche se la validità non cambia, aggiorna updatedAt perché la riga è stata modificata
        await sheetsCollection.updateOne(
            { _id: row.sheetId },
            { 
                $set: { updatedAt: new Date() },
                $inc: { nValidRows, anomalies }, 
            },
            { session }
        )
        
        const updatedRow = await rowsCollection.findOne({ _id }, { session })
        if (!updatedRow) throw new Error('Row not found after update')
        return updatedRow
    })
    
    context.pubsub?.publish(TOPICS.ROW_CHANGED(row.sheetId.toString()), {
        rowChanged: updatedRow
    })
    context.pubsub?.publish(TOPICS.WORKBOOK_UPDATED(sheet.workbookId.toString()), {
        workbookUpdated: true,
        _allowedEmails: (sheet.permissions ?? []).map((p: { email: string }) => p.email),
    })

    return updatedRow
}
