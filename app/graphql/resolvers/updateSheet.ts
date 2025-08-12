import { getSheetsCollection } from '@/app/lib/mongodb'
import { Context } from '../types'
import { get_authenticated_user, check_user_can_edit_sheet, check_admin } from './utils'
import { MutationUpdateSheetArgs } from '../generated'

export default async function updateSheet(_: unknown, args: MutationUpdateSheetArgs, context: Context): Promise<boolean> {
  const user = await get_authenticated_user(context)
  // Admins can update any; owners can update their own; others blocked by check_user_can_edit_sheet
  const sheets = await getSheetsCollection()
  const sheet = await sheets.findOne({ _id: args._id })
  check_user_can_edit_sheet(user, sheet as any)

  const update: Record<string, unknown> = {}
  if (typeof args.name === 'string') update.name = args.name
  if (typeof args.schema === 'string') update.schema = args.schema
  if (Array.isArray(args.permittedEmails)) update.permittedEmails = Array.from(new Set(args.permittedEmails.map(e => e.trim()).filter(Boolean)))
  if (Array.isArray(args.permittedIds)) update.permittedIds = args.permittedIds
  if (args.commonData && typeof args.commonData === 'object') update.commonData = args.commonData

  if (Object.keys(update).length === 0) return true

  const res = await sheets.updateOne({ _id: args._id }, { $set: update })
  if (!res.acknowledged) throw new Error('update failed')
  return true
}
