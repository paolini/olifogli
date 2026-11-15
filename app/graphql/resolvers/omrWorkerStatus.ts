import { getDb } from '@/app/lib/mongodb'
import { getOmrWorkerStatus } from '@/app/lib/omrWorkers'
import { get_authenticated_user } from './utils'
import type { Context } from '../types'

// Shown next to scan uploads and sheet generation, so any logged-in user may read it.
export default async function omrWorkerStatus(_: unknown, _args: unknown, context: Context) {
    await get_authenticated_user(context)
    return getOmrWorkerStatus(await getDb())
}
