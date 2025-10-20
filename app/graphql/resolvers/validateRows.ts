import { getSheetsCollection, getRowsCollection } from '@/app/lib/mongodb'
import { WithoutId } from 'mongodb'
import { Context } from '../types'
import { schemas } from '@/app/lib/schema'
import { Data, Row } from '@/app/lib/models'

import { get_authenticated_user, check_user_can_edit_rows } from './utils'
import { MutationAddRowsArgs } from '../generated'

export default async function validateRows(_: unknown, {sheetId}: MutationValidateRowsArgs, context: Context) {
    const user = await get_authenticated_user(context)
    if (!user.isAdmin) throw new Error("only admins can add rows in this way")
    const sheetsCollection = await getSheetsCollection();
    const rowsCollection = await getRowsCollection();
    const sheet = await sheetsCollection.findOne({_id: sheetId})
    if (!sheet) throw new Error("sheet not found")
    const schema = schemas[sheet.schema]
    const objectRows = await rowsCollection.find({sheetId}).toArray()
    const validatedRows: Row[] = objectRows
        .map(row => schema.clean(row.data))
        .map(data => ({
            ...schema.computeDerivedData(data),
            sheetId,
        }))
    const collection = await getRowsCollection()
    const res = await collection.insertMany(validatedRows)
    return res.insertedCount
}
