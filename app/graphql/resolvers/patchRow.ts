import { getSheetsCollection, getRowsCollection, getWorkbooksCollection } from '@/app/lib/mongodb'
import { ObjectId } from 'mongodb'

import { Context } from '../types'
import { schemas } from '@/app/lib/schema'
import { Data } from '@/app/lib/models'
import { get_authenticated_user, check_user_can_edit_rows } from './utils'

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

    const schema = schemas[sheet.schema]
    if (row.updatedOn && row.updatedOn.getTime() !== updatedOn.getTime()) throw new Error(`La riga è stata modificata da qualcun altro`);
    data = schema.clean(data)
    const derived_data = await schema.computeDerivedData(data, sheet.commonData, workbook.commonData)
    const $set = {
        ...derived_data,
        updatedOn: new Date(),
        updatedBy: user._id,
    }
    await rowsCollection.updateOne({ _id }, { $set })
    const updatedRow = await rowsCollection.findOne({ _id })
    if (!updatedRow) throw new Error('Row not found after update')
    return updatedRow
}

