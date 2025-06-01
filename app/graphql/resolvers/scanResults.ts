import { getSheetsCollection, getScansCollection, getScanResultsCollection } from '@/app/lib/mongodb'
import { ObjectId } from 'mongodb'
import { Context } from '../types'

import { get_authenticated_user, check_user_can_edit_sheet } from './utils'

export default async function scanResults(_: unknown, { sheetId, jobId }: { sheetId: ObjectId, jobId: string }, context: Context) {
    const user = await get_authenticated_user(context)
    const sheets = await getSheetsCollection()
    const sheet = await sheets.findOne({_id: sheetId })
    check_user_can_edit_sheet(user, sheet)
    const collection = await getScanResultsCollection();
    const results = await collection.aggregate([
        { $match: { sheetId, jobId } },
    ])
    return results.toArray();
}

