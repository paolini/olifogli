import { ObjectId } from 'mongodb'
import { UserInputError } from 'apollo-server-errors'
import { getRowsCollection, getSheetsCollection, withTransaction } from '@/app/lib/mongodb'
import { appLog } from '@/app/lib/appLog'
import { TOPICS } from '@/app/lib/pubsub'
import { Context } from '../types'
import { check_admin, get_authenticated_user } from './utils'

// Recompute the denormalized counters of a sheet from its rows (admin only).
export default async function recountSheet(_: unknown, { _id }: { _id: ObjectId }, context: Context): Promise<boolean> {
  const user = await get_authenticated_user(context)
  check_admin(user)
  const sheets = await getSheetsCollection()
  const rows = await getRowsCollection()
  await withTransaction(async (session) => {
    const sheet = await sheets.findOne({ _id }, { session })
    if (!sheet) throw new UserInputError('foglio inesistente')
    const [counts] = await rows.aggregate<{ nRows: number, nValidRows: number, nSyncedRows: number, anomalies: number }>([
      { $match: { sheetId: _id } },
      { $group: {
        _id: null,
        nRows: { $sum: 1 },
        nValidRows: { $sum: { $cond: [{ $eq: ['$error', ''] }, 1, 0] } },
        nSyncedRows: { $sum: { $cond: [{ $ifNull: ['$olimanager.resultsUpdatedOn', false] }, 1, 0] } },
        anomalies: { $sum: { $ifNull: ['$anomalies', 0] } },
      } },
    ], { session }).toArray()
    await sheets.updateOne({ _id }, { $set: {
      nRows: counts?.nRows ?? 0,
      nValidRows: counts?.nValidRows ?? 0,
      nSyncedRows: counts?.nSyncedRows ?? 0,
      anomalies: counts?.anomalies ?? 0,
      updatedAt: new Date(),
    } }, { session })
  })
  appLog('sheet.recounted', { sheetId: _id.toString() }, { userId: user._id })
  context.pubsub?.publish(TOPICS.SHEET_UPDATED(_id.toString()), { sheetUpdated: await sheets.findOne({ _id }) })
  return true
}
