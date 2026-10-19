import { getSheetsCollection } from '@/app/lib/mongodb'
import { Context } from '../types'
import { get_authenticated_user, check_user_is_sheet_admin } from './utils'
import { ObjectId } from 'mongodb'

export default async function openSheet(_: unknown, args: { _id: ObjectId }, context: Context): Promise<boolean> {
  const user = await get_authenticated_user(context)
  const sheets = await getSheetsCollection()
  const sheet = await sheets.findOne({ _id: args._id })
  
  if (!sheet) throw new Error('Sheet not found')
  
  if (sheet.locked) {
    if (!user.isAdmin && sheet.ownerId?.toString() !== user._id?.toString()) {
      throw new Error('Only the sheet owner or system admins can open the sheet')
    }
  } else {
      // Only sheet admins can open a sheet
      check_user_is_sheet_admin(user, sheet)
  }

  if (sheet.olimanagerJobId) throw new Error("Un lavoro Olimanager è attivo su questo foglio: attendere il completamento prima di riaprirlo.")

  const res = await sheets.updateOne(
    { _id: args._id, olimanagerJobId: { $exists: false } },
    { 
      $unset: { 
        closed: "", 
        closedBy: "", 
        closedOn: "" 
      } 
    }
  )
  
  if (!res.acknowledged || res.matchedCount === 0) throw new Error('Impossibile riaprire il foglio: un lavoro Olimanager potrebbe essere appena iniziato.')
  return true
}
