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
        const userPermissions = await getSheetPermissions(sheetId, user)
        check_user_can_edit_sheet(user, sheet, userPermissions)
        const rows = await getRowsCollection()
        const $match = permission_filter(sheet, userPermissions, user)
        const results = await rows.find({sheetId, ...$match}).toArray()
        return results
    }

function permission_filter(sheet: Sheet, userPermissions: SheetPermission[], user: User) {
    if (user.is_admin) return {}
    if (user._id.equals(sheet.owner_id)) return {}
    if (!userPermissions) return {}
    const perms: [string,string][] = userPermissions.filter(p => p.filter_field).map(p => [p.filter_field || '', p.filter_value || '' ])
    if (perms.length === 0) return {}
    if (perms.length === 1) {
        const p = perms[0]
        return {[`data.${p[0]}`]: p[1]}
    }
    const $or = perms.map(p => ({ [`data.${p[0]}`]: p[1] }))
    return { $or }
}

