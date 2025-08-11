import { ObjectId } from 'bson'

import { Context } from '../types'
import { get_authenticated_user, check_user_can_edit_sheet } from './utils'
import { getSheetsCollection, getRowsCollection } from '@/app/lib/mongodb'
import { Sheet, User } from '@/app/lib/models'
import { QueryRowsArgs } from '../generated'

export default async function rows (_: unknown, { sheetId }: QueryRowsArgs, context: Context) {
        const user = await get_authenticated_user(context)
        const sheets = await getSheetsCollection()
        const sheet = await sheets.findOne({_id: sheetId })
        if (!sheet) throw Error(`Foglio non trovato: ${sheetId}`)
        check_user_can_edit_sheet(user, sheet)
        const rows = await getRowsCollection()
        const query = filter_query(sheet,user)
        const results = await rows.find({sheetId, ...query}).toArray()
        console.log(JSON.stringify(results, null, 2))
        return results
    }

function filter_query(sheet: Sheet, user: User) {
    if (user.isAdmin) return {}
    if (user._id.equals(sheet.ownerId)) return {}
    if (!sheet.permissions || !Array.isArray(sheet.permissions)) return {}
    return Object.fromEntries(sheet.permissions
            .filter(p =>
                (   (p.userId && p.userId.equals(user._id)) 
                    ||  (p.userEmail && p.userEmail === user.email)
                ) && p.filterField && p.filterValue)
            .map(perm => ([`data.${perm.filterField}`, perm.filterValue as string]))
        )
}

