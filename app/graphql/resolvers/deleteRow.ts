import { getSheetsCollection, getRowsCollection, getSheetPermissions } from '@/app/lib/mongodb'
import { ObjectId } from 'mongodb'
import { Context } from '../types'

import { get_authenticated_user, check_user_can_edit_sheet, check_row_permission } from './utils'

export default async function deleteRow (_: unknown, { _id }: { _id: ObjectId }, context: Context) {
    const user = await get_authenticated_user(context)
    const rowsCollection = await getRowsCollection()
    const row = await rowsCollection.findOne({ _id })
    if (!row) throw new Error('Row not found')
    const sheetsCollection = await getSheetsCollection()
    const sheet = await sheetsCollection.findOne({_id: row.sheetId})
    if (!sheet) throw Error('foglio inesistente')
    const userPermissions = await getSheetPermissions(sheet._id, user)
    await check_user_can_edit_sheet(user,sheet, userPermissions)
    check_row_permission(user, row.data, userPermissions)
    await rowsCollection.deleteOne({ _id });
    return _id;
}
