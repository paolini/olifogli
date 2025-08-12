import { getSheetsCollection, getRowsCollection } from '@/app/lib/mongodb'
import { Context } from '../types'
import { schemas } from '@/app/lib/schema'

import { get_authenticated_user, check_user_can_edit_sheet } from './utils'
import { MutationAddRowArgs } from '../generated'

export default async function addRow(_: unknown, args: MutationAddRowArgs, context: Context) {
    const user = await get_authenticated_user(context)
    const sheetsCollection = await getSheetsCollection()
    const sheet = await sheetsCollection.findOne({_id: args.sheetId})
    check_user_can_edit_sheet(user, sheet)
    const schema = schemas[sheet.schema]
    const createdOn = new Date()
    const updatedOn = createdOn
    const createdBy = user._id
    const updatedBy = user._id
    const data = schema.clean(args.data)
    const isValid = schema.isValid(data) // TODO compute this!
    const rowsCollection = await getRowsCollection()

    const result = await rowsCollection.insertOne({ 
        data, 
        sheetId: args.sheetId, 
        isValid, 
        updatedOn, 
        updatedBy, 
        createdOn, 
        createdBy
    })
    return await rowsCollection.findOne({ _id: result.insertedId });
}
