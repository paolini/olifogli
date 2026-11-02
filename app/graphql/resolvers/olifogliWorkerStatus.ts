import { getDb } from '@/app/lib/mongodb'
import { getOlifogliWorkerStatus } from '@/app/lib/workerHeartbeat'
import { check_admin, get_authenticated_user } from './utils'
import type { Context } from '../types'

export default async function olifogliWorkerStatus(_: unknown, _args: unknown, context: Context) {
    check_admin(await get_authenticated_user(context))
    return getOlifogliWorkerStatus(await getDb())
}
