import { getSheetsCollection } from '@/app/lib/mongodb'
import { Context } from '../types'
import { get_authenticated_user, check_admin, check_user_can_update_sheet } from './utils'
import { MutationUpdateSheetArgs } from '../generated'
import { TOPICS } from '@/app/lib/pubsub'

export default async function updateSheet(_: unknown, args: MutationUpdateSheetArgs, context: Context): Promise<boolean> {
  const user = await get_authenticated_user(context)
  const sheets = await getSheetsCollection()
  const sheet = await sheets.findOne({ _id: args._id })
  
  check_user_can_update_sheet(user, sheet, args)

  const update: Record<string, unknown> = {}
  
  if (typeof args.name === 'string') update.name = args.name
  if (typeof args.schema === 'string') update.schema = args.schema
  if (typeof args.nRows === 'number') update.nRows = args.nRows
  if (typeof args.nValidRows === 'number') update.nValidRows = args.nValidRows
  if (typeof args.nSyncedRows === 'number') update.nSyncedRows = args.nSyncedRows
  if (typeof args.anomalies === 'number') update.anomalies = args.anomalies
  
  if (args.permissions && Array.isArray(args.permissions)) {
    update.permissions = args.permissions.map(p => ({
      email: p.email,
      role: p.role as 'admin' | 'editor' | 'view'
    }))
  }
  if (args.commonData && typeof args.commonData === 'object') {
    check_admin(user)
    update.commonData = args.commonData
  }
  
  if (Object.keys(update).length === 0) return true
  
  // Sempre aggiorna updatedAt quando il sheet viene modificato
  update.updatedAt = new Date()

  const res = await sheets.updateOne({ _id: args._id }, { $set: update })
  if (!res.acknowledged) throw new Error('update failed')

  // Fetch the updated sheet to publish the full payload
  const updatedSheet = await sheets.findOne({ _id: args._id });
  if (updatedSheet) {
    context.pubsub.publish(TOPICS.SHEET_UPDATED(updatedSheet._id.toString()), { sheetUpdated: updatedSheet });
  }
  return true
}
