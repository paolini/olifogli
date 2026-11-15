import { ObjectId } from 'bson'
import { Context } from '../types'
import { getSheetsCollection } from '../../lib/mongodb'
import { redis, CURSOR_KEY } from '../../lib/redis'
import { check_user_can_view_sheet, get_authenticated_user } from './utils'

export default async function cursors(_: unknown, { sheetId }: { sheetId: ObjectId }, context: Context) {
  const user = await get_authenticated_user(context)
  const sheets = await getSheetsCollection()
  check_user_can_view_sheet(user, await sheets.findOne({ _id: sheetId }))
  const data = await redis.hgetall(CURSOR_KEY(sheetId.toString()))
  if (!data) return []
  return Object.values(data).map((v: string) => JSON.parse(v))
}
