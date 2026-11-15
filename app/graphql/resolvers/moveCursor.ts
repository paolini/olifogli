import { ObjectId } from 'bson'
import { Context } from '../types'
import { getSheetsCollection } from '../../lib/mongodb'
import { TOPICS } from '../../lib/pubsub'
import { redis, CURSOR_KEY, CURSOR_FIELD } from '../../lib/redis'
import { check_user_can_view_sheet, get_authenticated_user } from './utils'

export default async function moveCursor(
  _: unknown,
  { sheetId, lineKey, fieldName, tabId }: { sheetId: ObjectId, lineKey?: string | null, fieldName?: string | null, tabId: string },
  context: Context
) {
  const user = await get_authenticated_user(context)
  const sheets = await getSheetsCollection()
  check_user_can_view_sheet(user, await sheets.findOne({ _id: sheetId }))
  const cursorData = { email: user.email, lineKey: lineKey ?? null, fieldName: fieldName ?? null, tabId }
  context.pubsub?.publish(TOPICS.CURSOR_CHANGED(sheetId.toString()), {
    cursorChanged: cursorData
  })
  // Mantieni lo stato corrente dei cursori per i nuovi client.
  // Il campo include l'utente: nessuno può sovrascrivere il cursore di un altro.
  const field = CURSOR_FIELD(user._id.toString(), tabId)
  if (lineKey == null && fieldName == null) {
    await redis.hdel(CURSOR_KEY(sheetId.toString()), field)
  } else {
    await redis.hset(CURSOR_KEY(sheetId.toString()), field, JSON.stringify(cursorData))
  }
  return true
}
