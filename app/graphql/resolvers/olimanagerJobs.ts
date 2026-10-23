import { getOlimanagerJobAccess } from '@/app/lib/olimanager'
import { protectJobAccess } from '@/app/lib/olimanagerJobCredentials'
import { ObjectId } from 'mongodb'
import { getDb, withTransaction, getOlimanagerJobsCollection, getOlimanagerJobItemsCollection, getSheetsCollection, getRowsCollection } from '@/app/lib/mongodb'
import { queueOlimanagerJob, resumeOlimanagerCheck as resumeJob } from '@/app/lib/olimanagerJobs'
import { check_admin, get_authenticated_user } from './utils'
import type { OlimanagerJob } from '@/app/lib/models'
import type { Context } from '../types'

async function requestJob(targets: { rowIds?: ObjectId[] | null, sheetIds?: ObjectId[] | null }, context: Context, operation: OlimanagerJob['operation']) {
    const user = await get_authenticated_user(context)
    check_admin(user)
    const endpoint = process.env.OLIMANAGER_GRAPHQL_ENDPOINT
    if (!endpoint) throw new Error('Configurare OLIMANAGER_GRAPHQL_ENDPOINT prima di accodare il lavoro.')
    if (!context.req) throw new Error('Il lavoro Olimanager richiede una sessione OAuth HTTP.')
    const access = await getOlimanagerJobAccess(context.req)
    return queueOlimanagerJob(await getDb(), withTransaction, user, targets, endpoint, job => protectJobAccess(job, access), operation)
}

export async function requestOlimanagerCheck(_: unknown, targets: { rowIds?: ObjectId[] | null, sheetIds?: ObjectId[] | null }, context: Context) {
    return requestJob(targets, context, 'check_participants')
}

export async function requestOlimanagerMatch(_: unknown, targets: { rowIds?: ObjectId[] | null, sheetIds?: ObjectId[] | null }, context: Context) {
    return requestJob(targets, context, 'match_or_create_participants')
}

export async function requestOlimanagerResults(_: unknown, targets: { rowIds?: ObjectId[] | null, sheetIds?: ObjectId[] | null }, context: Context) {
    return requestJob(targets, context, 'update_results')
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
    const entries = await items.find({ jobId, ...(failedOnly ? { status: 'failed' as const } : {}), ...(after ? { _id: { $gt: after } } : {}) })
        .sort({ _id: 1 }).limit(Math.min(200, Math.max(1, limit ?? 100))).toArray()
    const sheetIds = [...new Map(entries.filter(item => item.sheetId).map(item => [item.sheetId!.toString(), item.sheetId!])).values()]
    const sheets = sheetIds.length ? await (await getSheetsCollection()).find({ _id: { $in: sheetIds } }, { projection: { name: 1 } }).toArray() : []
    const names = new Map(sheets.map(sheet => [sheet._id.toString(), sheet.name]))
    const rows = entries.length ? await (await getRowsCollection()).find({ _id: { $in: entries.map(item => item.rowId) } }, { projection: { 'data.surname': 1 } }).toArray() : []
    const surnames = new Map(rows.map(row => [row._id.toString(), row.data?.surname]))
    return entries.map(item => ({ ...item, sheetName: item.sheetId ? names.get(item.sheetId.toString()) : undefined,
        rowSurname: surnames.get(item.rowId.toString()),
    }))
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
