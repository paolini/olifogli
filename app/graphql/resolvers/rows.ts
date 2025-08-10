import { ObjectId } from 'bson'

import { Context } from '../types'
import { get_authenticated_user, check_user_can_edit_sheet } from './utils'
import { getSheetsCollection, getRowsCollection, getSheetPermissions } from '@/app/lib/mongodb'
import { Sheet, User, SheetPermission } from '@/app/lib/models'

export default async function rows (_: unknown, { sheetId }: { sheetId: ObjectId }, context: Context) {
        const user = await get_authenticated_user(context)
        const sheets = await getSheetsCollection()
        const sheet = await sheets.findOne({_id: sheetId })
        if (!sheet) throw Error(`Foglio non trovato: ${sheetId}`)
        await check_user_can_edit_sheet(user, sheet)
        const rows = await getRowsCollection()
        const permissions = await getSheetPermissions(sheetId)
        const query = filter_query(sheet, permissions, user)
        const results = await rows.find({sheetId, ...query}).toArray()
        return results
    }

function filter_query(sheet: Sheet, permissions: SheetPermission[], user: User) {
    if (user.is_admin) return {}
    if (user._id.equals(sheet.owner_id)) return {}
    if (!permissions || !Array.isArray(permissions)) return {}
    return Object.fromEntries(permissions
            .filter(p =>
                (   (p.user_id && p.user_id.equals(user._id)) 
                    ||  (p.user_email && p.user_email === user.email)
                ) && p.filter_field && p.filter_value)
            .map(perm => ([`data.${perm.filter_field}`, perm.filter_value as string]))
        )
}

