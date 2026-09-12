import { ObjectId } from 'bson'
import { Context } from '../types'
import { TOPICS } from '../../lib/pubsub'
import { redis, CURSOR_KEY } from '../../lib/redis'
import { get_authenticated_user } from './utils'

export default async function moveCursor(
  _: unknown,
  { sheetId, lineKey, fieldName, tabId }: { sheetId: ObjectId, lineKey?: string | null, fieldName?: string | null, tabId: string },
  context: Context
) {
  const user = await get_authenticated_user(context)
  const cursorData = { email: user.email, lineKey: lineKey ?? null, fieldName: fieldName ?? null, tabId }
  context.pubsub?.publish(TOPICS.CURSOR_CHANGED(sheetId.toString()), {
    cursorChanged: cursorData
  })
  // Mantieni lo stato corrente dei cursori per i nuovi client
  if (lineKey == null && fieldName == null) {
    await redis.hdel(CURSOR_KEY(sheetId.toString()), tabId)
  } else {
    await redis.hset(CURSOR_KEY(sheetId.toString()), tabId, JSON.stringify(cursorData))
  }
  return true
}
