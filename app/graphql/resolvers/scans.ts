import { getSheetsCollection, getScansCollection } from '@/app/lib/mongodb'
import { ObjectId } from 'mongodb'
import { Context } from '../types'

import { get_authenticated_user, check_user_can_edit_sheet } from './utils'

export default async function scans (_: unknown, { sheetId }: { sheetId: ObjectId }, context: Context) {
    const user = await get_authenticated_user(context)
    const sheets = await getSheetsCollection()
    const sheet = await sheets.findOne({_id: sheetId })
    check_user_can_edit_sheet(user, sheet)
    const collection = await getScansCollection();
    const results = await collection.aggregate([
    { $match: { sheetId } },
    { $sort: { jobId: 1, timestamp: -1 } },
    { $group: {
        _id: "$jobId",
        lastScan: { $first: "$$ROOT" }
    }},
    { $replaceRoot: { newRoot: "$lastScan" } },
    { $sort: { timestamp: -1 } },
    ])
    return results.toArray();
}

