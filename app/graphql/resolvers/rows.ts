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
        let query: any = { sheetId }
        // Se l'utente ha un permesso con filtro, applicalo
        if (!user.is_admin && sheet.permissions && Array.isArray(sheet.permissions)) {
            const perm = sheet.permissions.find(p =>
                (p.user_id && p.user_id.equals(user._id)) ||
                (p.user_email && p.user_email === user.email)
            )
            console.log('Permesso trovato:', perm)
            if (perm && perm.filter_field && perm.filter_value) {
                console.log('Filtro applicato:', perm.filter_field, perm.filter_value)
                query[`data.${perm.filter_field}`] = perm.filter_value
            } else {
                console.log('Nessun filtro applicato per questo utente')
            }
        } else {
            console.log('Utente admin o nessun filtro nei permissions')
        }
        console.log('Query finale:', query)
        const results = await rows.find(query).toArray()
        return results
    }

