import { getSheetsCollection } from '@/app/lib/mongodb'
import { Context } from '../types'
import { get_authenticated_user, check_user_is_sheet_admin } from './utils'
import { ObjectId } from 'mongodb'

export default async function lockSheet(_: unknown, args: { _id: ObjectId }, context: Context): Promise<boolean> {
  const user = await get_authenticated_user(context)
  
  
  const sheets = await getSheetsCollection()
  const sheet = await sheets.findOne({ _id: args._id })
  
  if (!sheet) throw new Error('Sheet not found')

  // Only the sheet owner or system admins can lock a sheet
  if (!user.isAdmin && sheet.ownerId?.toString() !== user._id?.toString()) {
    throw new Error('Only the sheet owner or system admins can lock the sheet')
  }

  const res = await sheets.updateOne(
    { _id: args._id }, 
    { 
      $set: { 
        locked: true, 
        lockedBy: user.email, 
        lockedOn: new Date() 
      } 
    }
  )
  
  if (!res.acknowledged) throw new Error('lock failed')
  return true
}
