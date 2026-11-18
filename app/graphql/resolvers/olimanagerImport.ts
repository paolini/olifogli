import { getOlimanagerJobAccess } from '@/app/lib/olimanager'
import { protectJobAccess } from '@/app/lib/olimanagerJobCredentials'
import { getDb, withTransaction, getOlimanagerJobsCollection, getOlimanagerJobItemsCollection, getSheetsCollection, getWorkbooksCollection } from '@/app/lib/mongodb'
import { queueOlimanagerJob, confirmParticipantImport, cancelParticipantImport } from '@/app/lib/olimanagerJobs'
import { isParticipantImportSchema, SHEET_CONTEST_KEY } from '@/app/lib/olimanagerVenueSheetConfig'
import { check_admin, get_authenticated_user } from './utils'
import type { ObjectId } from 'mongodb'
import type { Context } from '../types'

export async function requestOlimanagerImport(_: unknown, { workbookId, schema, contestId }: { workbookId: ObjectId, schema: string, contestId: number }, context: Context) {
    const user = await get_authenticated_user(context)
    check_admin(user)
    if (!isParticipantImportSchema(schema)) throw new Error('Schema non gestito dall’importazione dei partecipanti.')
    if (!Number.isSafeInteger(contestId) || contestId <= 0) throw new Error('Seleziona un contest.')
    const endpoint = process.env.OLIMANAGER_GRAPHQL_ENDPOINT
    if (!endpoint) throw new Error('Configurare OLIMANAGER_GRAPHQL_ENDPOINT prima di accodare il lavoro.')
    if (!context.req) throw new Error('Il lavoro Olimanager richiede una sessione OAuth HTTP.')
    if (!await (await getWorkbooksCollection()).findOne({ _id: workbookId }, { projection: { _id: 1 } })) throw new Error('Raccoglitore non trovato.')
    const sheets = await (await getSheetsCollection()).find({ workbookId, schema, [`commonData.${SHEET_CONTEST_KEY}`]: String(contestId) },
        { projection: { _id: 1 } }).toArray()
    if (!sheets.length) throw new Error('Nessun foglio del raccoglitore ha questo schema e contest: crearli prima da Olimanager.')
    const access = await getOlimanagerJobAccess(context.req)
    return queueOlimanagerJob(await getDb(), withTransaction, user, { sheetIds: sheets.map(sheet => sheet._id) }, endpoint,
        job => protectJobAccess(job, access), 'import_participants', { workbookId, importSchema: schema, importContestId: contestId })
}

export async function confirmOlimanagerImport(_: unknown, { jobId }: { jobId: ObjectId }, context: Context) {
    const user = await get_authenticated_user(context)
    check_admin(user)
    return confirmParticipantImport(await getDb(), withTransaction, user, jobId)
}

export async function cancelOlimanagerImport(_: unknown, { jobId }: { jobId: ObjectId }, context: Context) {
    const user = await get_authenticated_user(context)
    check_admin(user)
    return cancelParticipantImport(await getDb(), withTransaction, user, jobId)
}

export async function olimanagerImport(_: unknown, { workbookId }: { workbookId: ObjectId }, context: Context) {
    check_admin(await get_authenticated_user(context))
    const job = await (await getOlimanagerJobsCollection()).findOne({ operation: 'import_participants', workbookId }, { sort: { createdAt: -1 } })
    if (!job) return null
    const items = await (await getOlimanagerJobItemsCollection()).find({ jobId: job._id },
        { projection: { sheetId: 1, 'importData.surname': 1, 'importData.name': 1, 'importData.codice_meccanografico': 1 } }).sort({ _id: 1 }).toArray()
    const sheets = await (await getSheetsCollection()).find({ _id: { $in: job.affectedSheetIds } }, { projection: { name: 1, nRows: 1 } }).toArray()
    const bySheet = new Map(sheets.map(sheet => [sheet._id.toString(), {
        sheetId: sheet._id, sheetName: sheet.name, existingRows: sheet.nRows || 0, newRows: 0, participants: [] as string[],
    }]))
    for (const item of items) {
        const entry = item.sheetId && bySheet.get(item.sheetId.toString())
        if (!entry) continue
        entry.newRows++
        const data = item.importData
        if (data) entry.participants.push(`${data.surname || ''} ${data.name || ''}${data.codice_meccanografico ? ` (${data.codice_meccanografico})` : ''}`.trim())
    }
    return {
        job, schema: job.importSchema || '', contestId: job.importContestId || 0, warnings: job.warnings || [],
        alreadyPresentRows: job.alreadyPresentRows || 0,
        sheets: [...bySheet.values()].sort((a, b) => a.sheetName.localeCompare(b.sheetName, 'it')),
    }
}
