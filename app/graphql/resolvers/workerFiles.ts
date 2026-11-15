import { ObjectId } from 'mongodb'
import { getScanJobsCollection, getScanSheetJobsCollection, getSheetsCollection } from '@/app/lib/mongodb'
import { deleteWorkerFile, listWorkerFiles, type WorkerFile, type WorkerFileKind } from '@/app/lib/workerFiles'
import { check_admin, get_authenticated_user } from './utils'
import type { Context } from '../types'

type JobInfo = { sheetId: ObjectId, status: string | null, timestamp: Date | null }

const groupKey = (kind: string, jobId: string | null) => `${kind}:${jobId ?? ''}`

async function jobInfo(kind: WorkerFileKind, ids: ObjectId[]): Promise<Map<string, JobInfo>> {
    const info = new Map<string, JobInfo>()
    if (ids.length === 0) return info
    if (kind === 'scan') {
        const jobs = await (await getScanJobsCollection())
            .find({ _id: { $in: ids } }, { projection: { sheetId: 1, timestamp: 1, messages: { $slice: -1 } } })
            .toArray()
        for (const job of jobs) info.set(job._id.toString(), {
            sheetId: job.sheetId, status: job.messages?.[0]?.status ?? null, timestamp: job.timestamp ?? null,
        })
    } else {
        const jobs = await (await getScanSheetJobsCollection())
            .find({ _id: { $in: ids } }, { projection: { sheetId: 1, timestamp: 1, status: 1 } })
            .toArray()
        for (const job of jobs) info.set(job._id.toString(), {
            sheetId: job.sheetId, status: job.status ?? null, timestamp: job.timestamp ?? null,
        })
    }
    return info
}

export async function workerFiles(_: unknown, _args: unknown, context: Context) {
    check_admin(await get_authenticated_user(context))
    const { areas, files } = await listWorkerFiles()

    const groups = new Map<string, { kind: WorkerFileKind, jobId: string | null, files: WorkerFile[] }>()
    for (const file of files) {
        const key = groupKey(file.kind, file.jobId)
        if (!groups.has(key)) groups.set(key, { kind: file.kind, jobId: file.jobId, files: [] })
        groups.get(key)!.files.push(file)
    }

    const jobIds = (kind: WorkerFileKind) => [...groups.values()]
        .filter(group => group.kind === kind && group.jobId)
        .map(group => new ObjectId(group.jobId!))
    const jobs = new Map([...await jobInfo('scan', jobIds('scan'))].map(([id, job]) => [groupKey('scan', id), job]))
    for (const [id, job] of await jobInfo('sheet', jobIds('sheet'))) jobs.set(groupKey('sheet', id), job)

    const sheetIds = [...new Map([...jobs.values()].map(job => [job.sheetId.toString(), job.sheetId])).values()]
    const sheets = sheetIds.length
        ? await (await getSheetsCollection()).find({ _id: { $in: sheetIds } }, { projection: { name: 1 } }).toArray()
        : []
    const sheetNames = new Map(sheets.map(sheet => [sheet._id.toString(), sheet.name]))

    return {
        areas: areas.map(({ area, label, kind, available }) => ({ area, label, kind, available })),
        groups: [...groups.entries()].map(([key, group]) => {
            const job = jobs.get(key)
            return {
                kind: group.kind,
                jobId: group.jobId ? new ObjectId(group.jobId) : null,
                jobExists: !!job,
                sheetId: job?.sheetId ?? null,
                sheetName: job ? sheetNames.get(job.sheetId.toString()) ?? null : null,
                status: job?.status ?? null,
                timestamp: job?.timestamp ?? null,
                fileCount: group.files.length,
                totalSize: group.files.reduce((total, file) => total + file.size, 0),
                folders: [...new Set(group.files.map(file => file.folder))],
                lastModified: new Date(Math.max(...group.files.map(file => file.modifiedAt.getTime()))),
            }
        }).sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime()),
    }
}

async function groupFiles(kind: string, jobId: ObjectId | null | undefined) {
    const { files } = await listWorkerFiles()
    const id = jobId ? jobId.toString() : null
    return files.filter(file => file.kind === kind && file.jobId === id)
}

export async function workerFileGroupFiles(_: unknown, { kind, jobId }: { kind: string, jobId?: ObjectId | null }, context: Context) {
    check_admin(await get_authenticated_user(context))
    return (await groupFiles(kind, jobId))
        .map(({ area, path, folder, size, modifiedAt }) => ({ area, path, folder, size, modifiedAt }))
        .sort((a, b) => a.area.localeCompare(b.area) || a.path.localeCompare(b.path))
}

async function deleteAll(files: { area: string, path: string }[]) {
    let deleted = 0
    const failed: { area: string, path: string, reason: string }[] = []
    for (const { area, path } of files) {
        const outcome = await deleteWorkerFile(area, path)
        if (outcome === 'deleted') deleted++
        else failed.push({ area, path, reason: outcome })
    }
    return { deleted, failed }
}

export async function deleteWorkerFiles(_: unknown, { files }: { files: { area: string, path: string }[] }, context: Context) {
    check_admin(await get_authenticated_user(context))
    return deleteAll(files)
}

export async function deleteWorkerFileGroup(_: unknown, { kind, jobId }: { kind: string, jobId?: ObjectId | null }, context: Context) {
    check_admin(await get_authenticated_user(context))
    return deleteAll(await groupFiles(kind, jobId))
}
