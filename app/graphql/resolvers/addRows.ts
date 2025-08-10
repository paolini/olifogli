import { getSheetsCollection, getRowsCollection, getSheetPermissions } from '@/app/lib/mongodb'
import { ObjectId, WithoutId } from 'mongodb'
import { Context } from '../types'
import { schemas } from '@/app/lib/schema'
import { Data, Row } from '@/app/lib/models'

import { get_authenticated_user, check_user_can_edit_sheet, make_row_permission_filter, make_row_permission_checker } from './utils'

export default async function addRows(_: unknown, {sheetId, columns, rows}: { 
    sheetId: ObjectId,
    columns: string[],
    nAnswers: number,
    rows: string[][]
}, context: Context) {
    const user = await get_authenticated_user(context)
    const sheetsCollection = await getSheetsCollection();
    const sheet = await sheetsCollection.findOne({_id: sheetId})
    if (!sheet) throw Error('foglio inesistente')
    const userPermissions = await getSheetPermissions(sheetId, user)
    check_user_can_edit_sheet(user, sheet, userPermissions)
    const schema = schemas[sheet.schema]
    const createdOn = new Date()
    const createdBy = user._id
    const updatedOn = createdOn
    const updatedBy = createdBy
    // Applica filtro permission: forza tutti i campi filter_field ai rispettivi filter_value
    const checkRow = make_row_permission_checker(user, userPermissions)
    const objectRows = rows.map(row => {
        const obj = Object.fromEntries(columns.map((column,i)=>[column,row[i]]))
        checkRow(obj)
        return obj
    })
    const validatedRows: WithoutId<Row>[] = objectRows
        .map(row => schema.clean(row as Data))
        .map(data => ({
            data, 
            isValid: schema.isValid(data),
            sheetId,
            createdBy,
            createdOn,
            updatedBy,
            updatedOn,
        }))
    const collection = await getRowsCollection()
    const res = await collection.insertMany(validatedRows)
    return res.insertedCount
}
