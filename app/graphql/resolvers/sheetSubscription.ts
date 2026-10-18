import { ObjectId } from 'mongodb'
import { getSheetsCollection } from '@/app/lib/mongodb'
import { pubsub } from '@/app/lib/pubsub'
import { Context } from '../types'
import { check_user_can_view_sheet, get_authenticated_user } from './utils'

// Use the same read permissions as sheet queries, including for read-only users.
export default function sheetSubscription<T>(topic: (sheetId: string) => string) {
    return async (_: unknown, { sheetId }: { sheetId: ObjectId }, context: Context) => {
        const user = await get_authenticated_user(context)
        const sheets = await getSheetsCollection()
        const sheet = await sheets.findOne({ _id: sheetId })
        check_user_can_view_sheet(user, sheet)

        // Permissions are checked only at subscription start. To enforce revocations
        // on existing subscriptions, restart every WebSocket server instance.
        return pubsub.asyncIterator<T>(topic(sheetId.toString()))
    }
}
