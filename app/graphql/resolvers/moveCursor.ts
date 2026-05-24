import { ObjectId } from 'bson'
import { Context } from '../types'
import { TOPICS } from '../../lib/pubsub'
import { get_authenticated_user } from './utils'

export default async function moveCursor(
  _: unknown,
  { sheetId, lineKey, fieldName, tabId }: { sheetId: ObjectId, lineKey?: string | null, fieldName?: string | null, tabId: string },
  context: Context
) {
  const user = await get_authenticated_user(context)
  context.pubsub.publish(TOPICS.CURSOR_CHANGED(sheetId.toString()), {
    cursorChanged: { email: user.email, lineKey: lineKey ?? null, fieldName: fieldName ?? null, tabId }
  })
  return true
}
