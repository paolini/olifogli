import { getSheetsCollection, getRowsCollection } from '@/app/lib/mongodb'
import { ObjectId } from 'mongodb'
import { Context } from '../types'
import { schemas } from '@/app/lib/schema'
import { Data } from '@/app/lib/models'

import { get_authenticated_user, check_user_can_edit_sheet } from './utils'

export default async function addRow(_: unknown, {sheetId, data}: {sheetId: ObjectId, data: Data}, context: Context) {
    const user = await get_authenticated_user(context)
    const sheetsCollection = await getSheetsCollection()
    const sheet = await sheetsCollection.findOne({_id: sheetId})
    check_user_can_edit_sheet(user, sheet)
    const schema = schemas[sheet.schema]
    const createdOn = new Date()
    const updatedOn = createdOn
    const createdBy = user._id
    const updatedBy = user._id
    // TODO: check if user can write to sheetId
    data = schema.clean(data)
    const isValid = schema.isValid(data) // TODO compute this!
    const rowsCollection = await getRowsCollection()
    const result = await rowsCollection.insertOne({ 
    data, 
    sheetId, 
    isValid, 
    updatedOn, updatedBy, createdOn, createdBy,
    })
    return await rowsCollection.findOne({ _id: result.insertedId });
}
