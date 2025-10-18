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

  const res = await sheets.updateOne(
    { _id: args._id }, 
    { 
      $unset: { 
        closed: "", 
        closedBy: "", 
        closedOn: "" 
      } 
    }
  )
  
  if (!res.acknowledged) throw new Error('open failed')
  return true
}
