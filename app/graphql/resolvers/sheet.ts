import { ObjectId } from 'bson'

import { Context } from '../types'
import { get_authenticated_user, check_user_can_edit_sheet } from './utils'
import { getSheetsCollection, getSheetPermissions } from '@/app/lib/mongodb'
import { Sheet } from '@/app/lib/models'

export default async function sheet (_: unknown, { sheetId }: { sheetId: ObjectId }, context: Context) {
  const user = await get_authenticated_user(context)
  const collection = await getSheetsCollection()
  const sheet = await collection.findOne({_id: sheetId})
  if (!sheet) throw Error('foglio inesistente')
  // Ottieni direttamente le permissions filtrate per utente
  const userPermissions = await getSheetPermissions(sheetId, user)
  check_user_can_edit_sheet(user, sheet, userPermissions)
  return sheet      
}
