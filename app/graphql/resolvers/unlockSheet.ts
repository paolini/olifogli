import { getSheetsCollection } from '@/app/lib/mongodb'
import { Context } from '../types'
import { get_authenticated_user, check_user_is_sheet_admin } from './utils'
import { ObjectId } from 'mongodb'

export default async function unlockSheet(_: unknown, args: { _id: ObjectId }, context: Context): Promise<boolean> {
  const user = await get_authenticated_user(context)
  
  const sheets = await getSheetsCollection()
  const sheet = await sheets.findOne({ _id: args._id })
  
  if (!sheet) throw new Error('Sheet not found')

  // Only the sheet owner or system admins can unlock a sheet
  if (!user.isAdmin && sheet.ownerId?.toString() !== user._id?.toString()) {
    throw new Error('Only the sheet owner or system admins can unlock the sheet')
  }

  const res = await sheets.updateOne(
    { _id: args._id }, 
    { 
      $unset: { 
        locked: "", 
        lockedBy: "", 
        lockedOn: "" 
      } 
    }
  )
  
  if (!res.acknowledged) throw new Error('unlock failed')
  return true
}
