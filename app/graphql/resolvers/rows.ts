import { ObjectId } from 'bson'

import { Context } from '../types'
import { get_authenticated_user, check_user_can_view_sheet } from './utils'
import { getSheetsCollection, getRowsCollection } from '@/app/lib/mongodb'
import { Sheet, User } from '@/app/lib/models'
import { QueryRowsArgs } from '../generated'

export default async function rows (_: unknown, { sheetId }: QueryRowsArgs, context: Context) {
        const user = await get_authenticated_user(context)
        const sheets = await getSheetsCollection()
        const sheet = await sheets.findOne({_id: sheetId })
        if (!sheet) throw Error(`Foglio non trovato: ${sheetId}`)
        check_user_can_view_sheet(user, sheet)
        const rows = await getRowsCollection()
        const results = await rows.find({sheetId}).toArray()
        return results
    }
