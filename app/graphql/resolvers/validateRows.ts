import { getSheetsCollection, getRowsCollection } from '@/app/lib/mongodb'
import { Context } from '../types'
import { schemas } from '@/app/lib/schema'
import { MutationValidateRowsArgs } from '../generated'

import { get_authenticated_user, check_user_can_edit_rows } from './utils'

export default async function validateRows(_: unknown, {sheetId}: MutationValidateRowsArgs, context: Context) {
    const user = await get_authenticated_user(context)
    if (!user.isAdmin) throw new Error("only admins can add rows in this way")
    const sheetsCollection = await getSheetsCollection();
    const rowsCollection = await getRowsCollection();
    const sheet = await sheetsCollection.findOne({_id: sheetId})
    if (!sheet) throw new Error("sheet not found")
    const schema = schemas[sheet.schema]
    const objectRows = await rowsCollection.find({sheetId}).toArray()
    
    let updateCount = 0
    for (const row of objectRows) {
        const cleanedData = schema.clean(row.data)
        const derivedData = schema.computeDerivedData(cleanedData)
        
        await rowsCollection.updateOne(
            { _id: row._id },
            {
                $set: {
                    ...derivedData,
                }
            }
        )
        updateCount++
    }
    return updateCount
}
