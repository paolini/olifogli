import { ObjectId } from 'mongodb'
import { getSheetsCollection } from '@/app/lib/mongodb'
import { pubsub } from '@/app/lib/pubsub'
import { Context } from '../types'
import { check_user_can_view_sheet, get_authenticated_user } from './utils'

// Use the same read permissions as sheet queries, including for read-only users.
export default function sheetSubscription<T>(topic: (sheetId: string) => string) {
    return async (_: unknown, { sheetId }: { sheetId: ObjectId }, context: Context) => {
        async function authorize() {
            const user = await get_authenticated_user(context)
            const sheets = await getSheetsCollection()
            const sheet = await sheets.findOne({ _id: sheetId })
            check_user_can_view_sheet(user, sheet)
        }

        // Reject before opening a Redis subscription or exposing any event.
        await authorize()
        const source = pubsub.asyncIterator<T>(topic(sheetId.toString()))
        let closed = false
        const iterator: AsyncIterableIterator<T> = {
            async next() {
                if (closed) return { done: true, value: undefined }
                try {
                    const result = await source.next()
                    if (closed || result.done) return { done: true, value: undefined }
                    // Re-read permissions so revocation also blocks queued events.
                    await authorize()
                    if (closed) return { done: true, value: undefined }
                    return result
                } catch (error) {
                    try { await iterator.return!() } finally { throw error }
                }
            },
            async return() {
                if (!closed) {
                    closed = true
                    await source.return()
                }
                return { done: true, value: undefined }
            },
            async throw(error) {
                try { await iterator.return!() } finally { throw error }
            },
            [Symbol.asyncIterator]() { return this },
        }
        return iterator
    }
}
