import { getSheetsCollection, getRowsCollection, getWorkbooksCollection, withTransaction } from '@/app/lib/mongodb'
import Redis from 'ioredis'
import { Context } from '../types'
import { schemas } from '@/app/lib/schema'

import { get_authenticated_user, check_user_can_edit_rows } from './utils'
import { MutationAddRowArgs } from '../generated'

export default async function addRow(_: unknown, args: MutationAddRowArgs, context: Context) {
    const user = await get_authenticated_user(context)
    const sheetsCollection = await getSheetsCollection()
    const sheet = await sheetsCollection.findOne({_id: args.sheetId})
    check_user_can_edit_rows(user, sheet)

    const workbooksCollection = await getWorkbooksCollection()
    const workbook = await workbooksCollection.findOne({_id: sheet.workbookId})
    if (!workbook) throw new Error('Workbook not found for sheet')

    const schema = schemas[sheet.schema]
    const createdOn = new Date()
    const updatedOn = createdOn
    const createdBy = user.email
    const updatedBy = user.email    
    let data = schema.clean(args.data)
    const validationContext = schema.validationContext(sheet.commonData, workbook.commonData)
    const derivedData = await schema.computeDerivedData(data, validationContext)
    data = derivedData.data
    const error = derivedData.error || ''
    const nValidRows = (error === '' ) ? 1 : 0
    const anomalies = derivedData.anomalies || 0
    
    // Usa una transazione per garantire la consistenza tra row e sheet
    const row = await withTransaction(async (session) => {
        const rowsCollection = await getRowsCollection()
        
        // Inserisci la nuova row
        const result = await rowsCollection.insertOne({ 
            data, 
            sheetId: args.sheetId, 
            error,
            anomalies,
            updatedOn, 
            updatedBy, 
            createdOn, 
            createdBy
        }, { session })
        
        // Incrementa nRows e, se la riga è valida, nValidRows, anomalies
        const updateFields = { 
            nRows: 1, 
            nValidRows, 
            anomalies
        }
        
        await sheetsCollection.updateOne(
            { _id: args.sheetId },
            { 
                $inc: updateFields,
                $set: { updatedAt: updatedOn }
            },
            { session }
        )
        
        // Recupera la row appena inserita
        const insertedRow = await rowsCollection.findOne({ _id: result.insertedId }, { session })
        if (!insertedRow) throw new Error('Row not found after creation')
        
        return insertedRow
    })
    
        // publish update to redis so SSE subscribers can be notified
        try {
            const r = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379')
            const channel = `sheet:${args.sheetId}:rows`
            const message = JSON.stringify({ type: 'rows.updated', channel, payload: { sheetId: args.sheetId, row: row }, timestamp: new Date().toISOString() })
            await r.publish(channel, message)
            r.quit()
        } catch (e) {
            console.error('Failed to publish redis event for addRow', e)
        }

        return row
}
