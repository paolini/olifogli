import { getSheetsCollection, getRowsCollection, getWorkbooksCollection } from '@/app/lib/mongodb'
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
    const createdBy = user._id
    const updatedBy = user._id    
    let data = schema.clean(args.data)
    const derivedData = await schema.computeDerivedData(data, sheet.commonData, workbook.commonData)
    data = derivedData.data
    const error = derivedData.error || ''
    const rowsCollection = await getRowsCollection()
    const result = await rowsCollection.insertOne({ 
        data, 
        sheetId: args.sheetId, 
        error,
        updatedOn, 
        updatedBy, 
        createdOn, 
        createdBy
    })
    const row = await rowsCollection.findOne({ _id: result.insertedId })
    if (!row) throw new Error('Row not found after creation')
    return row
}
