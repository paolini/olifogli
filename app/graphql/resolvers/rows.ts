import { ObjectId } from 'bson'

import { Context } from '../types'
import { get_authenticated_user, check_user_can_edit_sheet } from './utils'
import { getSheetsCollection, getRowsCollection } from '@/app/lib/mongodb'

export default async function rows (_: unknown, { sheetId }: { sheetId: ObjectId }, context: Context) {
        const user = await get_authenticated_user(context)
        const sheets = await getSheetsCollection()
        const sheet = await sheets.findOne({_id: sheetId })
        check_user_can_edit_sheet(user, sheet)
        const rows = await getRowsCollection()
        const results = await rows.find({sheetId}).toArray()
        return results
    }

