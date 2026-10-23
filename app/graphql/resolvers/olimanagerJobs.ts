import { getOlimanagerJobAccess } from '@/app/lib/olimanager'
import { protectJobAccess } from '@/app/lib/olimanagerJobCredentials'
import { ObjectId } from 'mongodb'
import { getDb, withTransaction, getOlimanagerJobsCollection, getOlimanagerJobItemsCollection } from '@/app/lib/mongodb'
import { queueOlimanagerCheck, resumeOlimanagerCheck as resumeJob } from '@/app/lib/olimanagerJobs'
import { check_admin, get_authenticated_user } from './utils'
import type { Context } from '../types'

export async function requestOlimanagerCheck(_: unknown, targets: { rowIds?: ObjectId[] | null, sheetIds?: ObjectId[] | null }, context: Context) {
    const user = await get_authenticated_user(context)
    check_admin(user)
    const endpoint = process.env.OLIMANAGER_GRAPHQL_ENDPOINT
    if (!endpoint) throw new Error('Configurare OLIMANAGER_GRAPHQL_ENDPOINT prima di accodare il lavoro.')
    if (!context.req) throw new Error('La verifica remota richiede una sessione OAuth HTTP.')
    const access = await getOlimanagerJobAccess(context.req)
    return queueOlimanagerCheck(await getDb(), withTransaction, user, targets, endpoint, job => protectJobAccess(job, access))
}

export async function olimanagerJobs(_: unknown, { sheetIds }: { sheetIds?: ObjectId[] | null }, context: Context) {
    check_admin(await get_authenticated_user(context))
    if (sheetIds && !sheetIds.length) return []
    const jobs = await getOlimanagerJobsCollection()
    return jobs.find(sheetIds?.length ? { affectedSheetIds: { $in: sheetIds } } : {}).sort({ createdAt: -1 }).limit(20).toArray()
}

export async function olimanagerJobItems(_: unknown, { jobId, after, failedOnly, limit }: {
    jobId: ObjectId, after?: ObjectId | null, failedOnly?: boolean | null, limit?: number | null,
}, context: Context) {
    check_admin(await get_authenticated_user(context))
    const items = await getOlimanagerJobItemsCollection()
    return items.find({ jobId, ...(failedOnly ? { status: 'failed' as const } : {}), ...(after ? { _id: { $gt: after } } : {}) })
        .sort({ _id: 1 }).limit(Math.min(200, Math.max(1, limit ?? 100))).toArray()
}

export async function resumeOlimanagerCheck(_: unknown, { jobId }: { jobId: ObjectId }, context: Context) {
    const user = await get_authenticated_user(context)
    check_admin(user)
    if (!context.req) throw new Error('La ripresa richiede una sessione OAuth HTTP.')
    const endpoint = process.env.OLIMANAGER_GRAPHQL_ENDPOINT
    if (!endpoint) throw new Error('Configurare OLIMANAGER_GRAPHQL_ENDPOINT.')
    const access = await getOlimanagerJobAccess(context.req)
    return resumeJob(await getDb(), withTransaction, user, jobId, job => protectJobAccess(job, access), endpoint)
}
