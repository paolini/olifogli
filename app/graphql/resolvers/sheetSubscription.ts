import { ObjectId } from 'mongodb'
import { getSheetsCollection } from '@/app/lib/mongodb'
import { pubsub } from '@/app/lib/pubsub'
import { Context } from '../types'
import { check_user_can_view_sheet, get_authenticated_user } from './utils'

// Revoked permissions stop live subscriptions within this interval.
export const SHEET_SUBSCRIPTION_RECHECK_MS = 30_000

// Use the same read permissions as sheet queries, including for read-only users.
export default function sheetSubscription<T>(topic: (sheetId: string) => string, initialValue?: T) {
    return async (_: unknown, { sheetId }: { sheetId: ObjectId }, context: Context) => {
        async function authorize() {
            const user = await get_authenticated_user(context)
            const sheets = await getSheetsCollection()
            check_user_can_view_sheet(user, await sheets.findOne({ _id: sheetId }))
        }
        await authorize()
        let checkedAt = Date.now()

        // Permissions (and the user's global roles) are checked again before delivering
        // an event when the last check is older than SHEET_SUBSCRIPTION_RECHECK_MS.
        // On failure the subscription ends with the error (fail closed).
        const source = pubsub.asyncIterator<T>(topic(sheetId.toString()))
        let initial = initialValue !== undefined
        const close = async () => {
            await source.return?.()
            return { done: true as const, value: undefined }
        }
        return {
            async next(): Promise<IteratorResult<T>> {
                // Also refresh on reconnect, when worker updates may have been missed.
                if (initial) {
                    initial = false
                    return { done: false as const, value: initialValue as T }
                }
                const result = await source.next()
                if (result.done) return result
                if (Date.now() - checkedAt >= SHEET_SUBSCRIPTION_RECHECK_MS) {
                    try {
                        await authorize()
                    } catch (error) {
                        await source.return?.()
                        throw error
                    }
                    checkedAt = Date.now()
                }
                return result
            },
            return: close,
            [Symbol.asyncIterator]() { return this },
        }
    }
}
