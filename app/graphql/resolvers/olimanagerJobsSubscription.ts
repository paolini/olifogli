import { pubsub, TOPICS } from '@/app/lib/pubsub'
import { check_admin, get_authenticated_user } from './utils'
import type { Context } from '../types'

// Only an invalidation signal leaves the server; job data is fetched over HTTP.
export default async function olimanagerJobsSubscription(_: unknown, _args: unknown, context: Context) {
    check_admin(await get_authenticated_user(context))
    const source = pubsub.asyncIterator<{ olimanagerJobsUpdated: boolean }>(TOPICS.OLIMANAGER_JOBS_UPDATED)
    let initial = true
    const iterator: AsyncIterableIterator<{ olimanagerJobsUpdated: boolean }> = {
        async next() {
            // Refresh after subscribing/reconnecting, to recover missed changes.
            if (initial) {
                initial = false
                return { done: false, value: { olimanagerJobsUpdated: false } }
            }
            try {
                const event = await source.next()
                if (event.done) return { done: true, value: undefined }
                check_admin(await get_authenticated_user(context))
                return { done: false, value: event.value }
            } catch (error) {
                await source.return?.()
                throw error
            }
        },
        async return() {
            // Delegate immediately even when next() is waiting for a Redis event.
            await source.return?.()
            return { done: true, value: undefined }
        },
        [Symbol.asyncIterator]() { return this },
    }
    return iterator
}
