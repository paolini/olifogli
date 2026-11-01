import { ObjectId } from 'mongodb'
import { getSheetsCollection } from '@/app/lib/mongodb'
import { pubsub } from '@/app/lib/pubsub'
import { Context } from '../types'
import { check_user_can_view_sheet, get_authenticated_user } from './utils'

// Use the same read permissions as sheet queries, including for read-only users.
export default function sheetSubscription<T>(topic: (sheetId: string) => string, initialValue?: T) {
    return async (_: unknown, { sheetId }: { sheetId: ObjectId }, context: Context) => {
        const user = await get_authenticated_user(context)
        const sheets = await getSheetsCollection()
        const sheet = await sheets.findOne({ _id: sheetId })
        check_user_can_view_sheet(user, sheet)

        // Permissions are checked only at subscription start. To enforce revocations
        // on existing subscriptions, restart every WebSocket server instance.
        const source = pubsub.asyncIterator<T>(topic(sheetId.toString()))
        if (initialValue === undefined) return source
        let initial = true
        return {
            next() {
                // Also refresh on reconnect, when worker updates may have been missed.
                if (initial) {
                    initial = false
                    return Promise.resolve({ done: false as const, value: initialValue })
                }
                return source.next()
            },
            async return() {
                await source.return?.()
                return { done: true as const, value: undefined }
            },
            [Symbol.asyncIterator]() { return this },
        }
    }
}
