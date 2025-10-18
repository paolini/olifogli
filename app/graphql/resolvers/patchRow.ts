import { getSheetsCollection, getRowsCollection } from '@/app/lib/mongodb'
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
    const schema = schemas[sheet.schema]
    if (row.updatedOn && row.updatedOn.getTime() !== updatedOn.getTime()) throw new Error(`La riga è stata modificata da qualcun altro`);
    data = schema.clean(data)
    const isValid = schema.isValid(data)
    const $set = {
        data,
        isValid,
        updatedOn: new Date(),
        updatedBy: user._id,
    }
    await rowsCollection.updateOne({ _id }, { $set })
    return await rowsCollection.findOne({ _id })
}

