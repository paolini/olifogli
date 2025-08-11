import { ObjectId } from 'bson'

import { Context } from '../types'
import { get_authenticated_user, check_user_can_edit_sheet } from './utils'
import { getSheetsCollection } from '@/app/lib/mongodb'
import { Sheet } from '@/app/lib/models'
import { QuerySheetArgs } from '../generated'

export default async function sheet (_: unknown, { sheetId }: QuerySheetArgs, context: Context) {
      const user = await get_authenticated_user(context)
      const collection = await getSheetsCollection()
      const sheet = await collection.findOne({_id: sheetId})
      if (!sheet) throw Error('foglio inesistente')
      check_user_can_edit_sheet(user, sheet)
      if (user.isAdmin) return sheet
      if (sheet.ownerId && sheet.ownerId.equals(user._id)) return sheet
      if (!sheet.permissions) return sheet
      if (!Array.isArray(sheet.permissions)) throw Error('permessi non validi')
      // Filtra i permessi per l'utente corrente se ha un permesso esplicito
      const permissions = sheet.permissions.filter(p => 
        (p.userId && p.userId.equals(user._id)) ||
        (p.userEmail && p.userEmail === user.email)
      )
      return { ...sheet, permissions }
    }
