import { ObjectId } from 'bson'

import { Context } from '../types'
import { get_authenticated_user, check_user_can_edit_sheet } from './utils'
import { getSheetsCollection, getRowsCollection } from '@/app/lib/mongodb'
import { Sheet, User } from '@/app/lib/models'

export default async function rows (_: unknown, { sheetId }: { sheetId: ObjectId }, context: Context) {
        const user = await get_authenticated_user(context)
        const sheets = await getSheetsCollection()
        const sheet = await sheets.findOne({_id: sheetId })
        if (!sheet) throw Error(`Foglio non trovato: ${sheetId}`)
        check_user_can_edit_sheet(user, sheet)
        const rows = await getRowsCollection()
        const query = filter_query(sheet,user)
        const results = await rows.find({sheetId, ...query}).toArray()
        return results
    }

function filter_query(sheet: Sheet, user: User) {
    if (user.is_admin) return {}
    if (user._id.equals(sheet.owner_id)) return {}
    if (!sheet.permissions || !Array.isArray(sheet.permissions)) return {}
    return Object.fromEntries(sheet.permissions
            .filter(p =>
                (   (p.user_id && p.user_id.equals(user._id)) 
                    ||  (p.user_email && p.user_email === user.email)
                ) && p.filter_field && p.filter_value)
            .map(perm => ([`data.${perm.filter_field}`, perm.filter_value as string]))
        )
}

