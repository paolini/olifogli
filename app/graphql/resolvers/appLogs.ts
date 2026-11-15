import { ObjectId } from 'mongodb'
import { getUsersCollection } from '@/app/lib/mongodb'
import { pubsub, TOPICS } from '@/app/lib/pubsub'
import { listAppLogDays, readAppLog } from '@/app/lib/appLogReader'
import type { AppLogEntry } from '@/app/lib/appLog'
import { check_admin, get_authenticated_user } from './utils'
import type { Context } from '../types'

const DEFAULT_LIMIT = 500
// Admin rights are checked again on new events at most this often.
const RECHECK_MS = 30_000

async function emails(userIds: (string | undefined)[]): Promise<Map<string, string>> {
    const ids = [...new Set(userIds.filter((id): id is string => !!id && ObjectId.isValid(id)))]
    if (!ids.length) return new Map()
    const users = await (await getUsersCollection())
        .find({ _id: { $in: ids.map(id => new ObjectId(id)) } }, { projection: { email: 1 } }).toArray()
    return new Map(users.map(user => [user._id.toString(), user.email]))
}

function toGraphQL(entry: AppLogEntry, userEmails: Map<string, string>) {
    const { timestamp, level, source, event, userId, ...data } = entry
    return {
        timestamp, level: level ?? 'info', source: source ?? '', event, userId: userId ?? null,
        // The JSON scalar is typed as the global JSON object by codegen.
        userEmail: userId ? userEmails.get(userId) ?? null : null, data: data as unknown as JSON,
    }
}

export async function appLogs(_: unknown, { day, limit }: { day?: string | null, limit?: number | null }, context: Context) {
    check_admin(await get_authenticated_user(context))
    const directory = process.env.LOG_DIR
    if (!directory) return { available: false, days: [], day: null, entries: [], truncated: false }
    const days = await listAppLogDays(directory)
    const selected = day ?? days[0] ?? null
    if (!selected) return { available: true, days, day: null, entries: [], truncated: false }
    const { entries, truncated } = await readAppLog(directory, selected, limit ?? DEFAULT_LIMIT)
    const userEmails = await emails(entries.map(entry => entry.userId))
    return { available: true, days, day: selected, entries: entries.map(entry => toGraphQL(entry, userEmails)), truncated }
}

export async function appLogAddedSubscription(_: unknown, _args: unknown, context: Context) {
    check_admin(await get_authenticated_user(context))
    const source = pubsub.asyncIterator<{ appLogAdded: AppLogEntry }>(TOPICS.APP_LOG)
    const userEmails = new Map<string, string>()
    let checkedAt = Date.now()
    const iterator: AsyncIterableIterator<{ appLogAdded: ReturnType<typeof toGraphQL> }> = {
        async next() {
            try {
                const event = await source.next()
                if (event.done) return { done: true, value: undefined }
                if (Date.now() - checkedAt > RECHECK_MS) {
                    check_admin(await get_authenticated_user(context))
                    checkedAt = Date.now()
                }
                const entry = event.value.appLogAdded
                if (entry.userId && !userEmails.has(entry.userId)) {
                    if (userEmails.size >= 1000) userEmails.clear()
                    for (const [id, email] of await emails([entry.userId])) userEmails.set(id, email)
                }
                return { done: false, value: { appLogAdded: toGraphQL(entry, userEmails) } }
            } catch (error) {
                await source.return?.()
                throw error
            }
        },
        async return() {
            await source.return?.()
            return { done: true, value: undefined }
        },
        [Symbol.asyncIterator]() { return this },
    }
    return iterator
}
