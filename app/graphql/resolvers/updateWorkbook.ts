import { getWorkbooksCollection } from '@/app/lib/mongodb'
import { Context } from '../types'
import { get_authenticated_user, check_admin } from './utils'
import { MutationUpdateWorkbookArgs } from '../generated'

export default async function updateWorkbook(_: unknown, args: MutationUpdateWorkbookArgs, context: Context): Promise<boolean> {
  const user = await get_authenticated_user(context)
  check_admin(user)
  const workbooks = await getWorkbooksCollection()
  const workbook = await workbooks.findOne({ _id: args._id })
  if (!workbook) throw new Error('Workbook not found')

  const update: Record<string, unknown> = {}
  if (typeof args.name === 'string') update.name = args.name
  if (args.commonData && typeof args.commonData === 'object') update.commonData = args.commonData

  if (Object.keys(update).length === 0) return true

  update.updatedOn = new Date()
  update.updatedBy = user.email

  const res = await workbooks.updateOne({ _id: args._id }, { $set: update })
  if (!res.acknowledged) throw new Error('update failed')
  return true
}
