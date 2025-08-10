import { getSheetsCollection, getRowsCollection } from '@/app/lib/mongodb'
import { ObjectId } from 'mongodb'
import { Context } from '../types'

import { get_authenticated_user, check_user_can_edit_sheet } from './utils'

export default async function deleteRow (_: unknown, { _id }: { _id: ObjectId }, context: Context) {
    const user = await get_authenticated_user(context)
    const rowsCollection = await getRowsCollection()
    const row = await rowsCollection.findOne({ _id })
    if (!row) throw new Error('Row not found')
    const sheetsCollection = await getSheetsCollection()
    const sheet = await sheetsCollection.findOne({_id: row.sheetId})
    if (!sheet) throw Error('foglio inesistente')
    await check_user_can_edit_sheet(user,sheet)
    const collection = await getRowsCollection() 
    await collection.deleteOne({ _id });
    return _id;
}
