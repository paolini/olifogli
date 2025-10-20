import { getSheetsCollection } from '@/app/lib/mongodb'
import { Context } from '../types'
import { get_authenticated_user, check_admin, check_user_can_update_sheet } from './utils'
import { MutationUpdateSheetArgs } from '../generated'

export default async function updateSheet(_: unknown, args: MutationUpdateSheetArgs, context: Context): Promise<boolean> {
  const user = await get_authenticated_user(context)
  const sheets = await getSheetsCollection()
  const sheet = await sheets.findOne({ _id: args._id })
  
  check_user_can_update_sheet(user, sheet, args)

  const update: Record<string, unknown> = {}
  if (typeof args.name === 'string') update.name = args.name
  if (typeof args.schema === 'string') update.schema = args.schema
  if (args.permissions && Array.isArray(args.permissions)) {
    update.permissions = args.permissions.map(p => ({
      email: p.email || undefined,
      userId: p.userId || undefined,
      role: p.role as 'admin' | 'editor' | 'view'
    }))
  }
  if (args.commonData && typeof args.commonData === 'object') update.commonData = args.commonData

  if (Object.keys(update).length === 0) return true

  const res = await sheets.updateOne({ _id: args._id }, { $set: update })
  if (!res.acknowledged) throw new Error('update failed')
  return true
}
