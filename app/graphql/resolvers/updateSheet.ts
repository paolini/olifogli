import { UserInputError, ForbiddenError } from 'apollo-server-errors'
import { getSheetsCollection } from '@/app/lib/mongodb'
import { schemas } from '@/app/lib/schema'
import { Context } from '../types'
import { get_authenticated_user, check_admin, check_user_can_update_sheet, parse_sheet_permissions } from './utils'
import { MutationUpdateSheetArgs } from '../generated'
import { TOPICS, workbookUpdatedPayload } from '@/app/lib/pubsub'

export default async function updateSheet(_: unknown, args: MutationUpdateSheetArgs, context: Context): Promise<boolean> {
  const user = await get_authenticated_user(context)
  const sheets = await getSheetsCollection()
  const sheet = await sheets.findOne({ _id: args._id })
  
  check_user_can_update_sheet(user, sheet, args)

  const update: Record<string, unknown> = {}

  // Finalized or closed sheets keep their definition; only system admins may change it.
  const changesDefinition = typeof args.name === 'string' || typeof args.schema === 'string'
  if (changesDefinition && (sheet.locked || sheet.closed) && !user.isAdmin) {
    throw new ForbiddenError('il foglio è chiuso o finalizzato: nome e schema non possono essere modificati')
  }
  if (typeof args.name === 'string') update.name = args.name
  if (typeof args.schema === 'string') {
    if (!Object.hasOwn(schemas, args.schema)) throw new UserInputError('schema sconosciuto')
    update.schema = args.schema
  }

  if (args.permissions && Array.isArray(args.permissions)) {
    update.permissions = parse_sheet_permissions(args.permissions)
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
    context.pubsub?.publish(TOPICS.SHEET_UPDATED(updatedSheet._id.toString()), { sheetUpdated: updatedSheet });
    context.pubsub?.publish(TOPICS.WORKBOOK_UPDATED(updatedSheet.workbookId.toString()), workbookUpdatedPayload(updatedSheet));
  }
  return true
}
