import { ObjectId, type AnyBulkWriteOperation } from 'mongodb'
import type { Data, OlimanagerJob, OlimanagerJobItem, Row } from './models'
import type { ImportJobContext } from './olimanagerJobs'
import { CheckFailed, LoginRequired } from './olimanagerRemoteCheck'
import { venueSheetNames, type NamedVenue } from './olimanagerVenueNames'
import { isParticipantImportSchema } from './olimanagerVenueSheetConfig'
import { sheetContest } from './olimanagerVenueSheetPlan'
import { schemas } from './schema'

// Import of the participants of a zone contest (e.g. the district contest)
// into the sheets created from its venues. Two phases in the worker:
// 1. preparation: read the contest from Olimanager and store the rows to
//    create as job items (the preview); the job waits for confirmation;
// 2. after confirmation: create the rows, never modifying existing ones.

const CONTEST = `query ImportContest($contestId: Int!) {
  users { me { isStaff } }
  contests { contests(filters: {id: $contestId}) { id scope edition { olympiad { id admin { __typename } } } } }
}`
const ZONES = `query ImportZones($olympiad: String!) {
  zones { zones(filters: {olympiad: {id: {exact: $olympiad}}}) { name } }
}`
const VENUES = `query ImportVenues($contest: Int!) {
  venues { venues(filters: {contest: {id: $contest}}) { id name parentVenue { id } } }
}`
const PARTICIPANTS = `query ImportParticipants($contestId: Int!, $after: String) {
  participants { participants(contestId: $contestId, first: 100, after: $after) {
    pageInfo { hasNextPage endCursor }
    edges { node { pk officialVenue { id }
      competitor { school { externalId name location { city { name } } } members { name surname birthDate classYear section } }
      extraFieldEntries { field { fieldName } value }
    } }
  } }
}`

export type RemoteParticipant = {
    pk: number | string
    officialVenue: { id: number | string } | null
    competitor: {
        school: { externalId: string | null, name: string | null, location: { city: { name: string | null } | null } | null } | null
        members: { name: string | null, surname: string | null, birthDate: string | null, classYear: number | null, section: string | null }[]
    } | null
    extraFieldEntries?: { field: { fieldName: string | null } | null, value: string | null }[] | null
}
type Venue = { id: number | string, name: string, parentVenue: { id: number | string } | null }
export type RemoteContest = { venueSheetNames: Map<string, string>, participants: RemoteParticipant[] }
type Query = <T>(document: string, variables: Record<string, unknown>) => Promise<T>

export async function fetchContestParticipants(query: Query, contestId: number): Promise<RemoteContest> {
    const contestData = await query<{ users?: { me?: { isStaff: boolean } },
        contests?: { contests: { id: number, scope: string, edition: { olympiad: { id: string, admin: object | null } } }[] } }>(CONTEST, { contestId })
    const contest = contestData.contests?.contests?.find(contest => Number(contest.id) === contestId)
    if (!contest) throw new CheckFailed('Il contest non è disponibile su Olimanager.')
    if (contest.scope !== 'ZONE') throw new CheckFailed('Il contest non è distrettuale (ambito ZONE).')
    // A partial list would look complete: require full visibility on the contest.
    if (!contestData.users?.me?.isStaff && !contest.edition.olympiad.admin) {
        throw new CheckFailed('L’account OAuth non è amministratore dell’olimpiade: elenco dei partecipanti non completo.')
    }
    const zones = (await query<{ zones: { zones: { name: string }[] } }>(ZONES, { olympiad: contest.edition.olympiad.id })).zones?.zones
    const venues = (await query<{ venues: { venues: Venue[] } }>(VENUES, { contest: contestId })).venues?.venues
    if (!Array.isArray(zones) || !Array.isArray(venues)) throw new CheckFailed('Distretti o sedi del contest non disponibili.')
    const named: NamedVenue[] = venues.map(venue => ({ id: Number(venue.id), name: venue.name, parentVenue: venue.parentVenue ? { id: Number(venue.parentVenue.id) } : null }))
    const names = new Map([...venueSheetNames(named, zones)].map(([id, name]) => [String(id), name]))
    const participants: RemoteParticipant[] = []
    const cursors = new Set<string>()
    let after: string | null = null
    for (;;) {
        const data: { participants?: { participants?: { pageInfo: { hasNextPage: boolean, endCursor: string | null },
            edges: { node: RemoteParticipant }[] } } } = await query(PARTICIPANTS, { contestId, after })
        const page = data.participants?.participants
        if (!page || !Array.isArray(page.edges)) throw new CheckFailed('Elenco dei partecipanti non disponibile.')
        participants.push(...page.edges.map(edge => edge.node))
        if (!page.pageInfo.hasNextPage) break
        after = page.pageInfo.endCursor
        if (!after || cursors.has(after)) throw new CheckFailed('Paginazione dei partecipanti Olimanager non valida.')
        cursors.add(after)
    }
    return { venueSheetNames: names, participants }
}

// Row data of a participant, as the old ImportazionePartecipantiDistrettuale
// produced it; fields missing from the target schema are dropped.
export function participantRowData(participant: RemoteParticipant, fieldNames: ReadonlySet<string>): Data | string {
    const members = participant.competitor?.members || []
    if (members.length !== 1) return 'il concorrente non ha una singola anagrafica'
    const member = members[0]
    const school = participant.competitor?.school
    const iso = (member.birthDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
    const classYear = member.classYear == null ? '' : member.classYear >= 9 && member.classYear <= 13 ? String(member.classYear - 8) : String(member.classYear)
    const shirt = participant.extraFieldEntries?.find(entry => /taglia/i.test(entry.field?.fieldName || ''))
    const data: Data = {
        surname: (member.surname || '').trim(),
        name: (member.name || '').trim(),
        birthDate: iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : (member.birthDate || '').trim(),
        codice_meccanografico: (school?.externalId || '').trim(),
        nome_scuola: (school?.name || '').trim(),
        'città_scuola': (school?.location?.city?.name || '').trim(),
        classYear,
        classSection: (member.section || '').trim(),
        shirt_size: (shirt?.value || '').trim().toUpperCase(),
    }
    return Object.fromEntries(Object.entries(data).filter(([key]) => fieldNames.has(key)))
}

export type ImportSheet = { _id: ObjectId, name: string, commonData?: Record<string, string> | null }
export type ExistingRow = { sheetId: ObjectId, olimanager?: { participantId?: string } | null }
export type PlannedRow = { sheetId: ObjectId, participantId: string, data: Data }

// Assigns each participant to the sheet named after the district of its
// venue; participants already linked to a row of these sheets are skipped.
export function planParticipantImport(remote: RemoteContest, sheets: ImportSheet[], existing: ExistingRow[], fieldNames: ReadonlySet<string>) {
    const warnings: string[] = []
    const byName = new Map<string, ImportSheet[]>()
    for (const sheet of sheets) {
        const name = (sheet.commonData?.Distretto || sheet.name).trim()
        byName.set(name, [...(byName.get(name) || []), sheet])
    }
    const sheetName = new Map(sheets.map(sheet => [sheet._id.toString(), sheet.name]))
    const linked = new Map<string, string[]>()
    for (const row of existing) {
        const id = row.olimanager?.participantId
        if (id) linked.set(id, [...(linked.get(id) || []), row.sheetId.toString()])
    }
    const rows: PlannedRow[] = []
    const seen = new Set<string>()
    const missingSheet = new Map<string, number>(), unknownVenue = new Map<string, number>(), ambiguous = new Map<string, number>()
    const count = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) || 0) + 1)
    let alreadyPresent = 0
    for (const participant of remote.participants) {
        const participantId = String(participant.pk)
        if (seen.has(participantId)) continue
        seen.add(participantId)
        const venueId = participant.officialVenue ? String(participant.officialVenue.id) : ''
        const district = remote.venueSheetNames.get(venueId)
        if (district === undefined) { count(unknownVenue, venueId || '?'); continue }
        const candidates = byName.get(district) || []
        if (candidates.length > 1) { count(ambiguous, district); continue }
        const sheet = candidates[0]
        if (!sheet) { count(missingSheet, district); continue }
        const present = linked.get(participantId)
        if (present) {
            if (present.includes(sheet._id.toString())) alreadyPresent++
            else warnings.push(`Partecipante #${participantId}: già presente nel foglio «${sheetName.get(present[0])}», ma in Olimanager appartiene a «${district}»; non importato.`)
            continue
        }
        const data = participantRowData(participant, fieldNames)
        if (typeof data === 'string') { warnings.push(`Partecipante #${participantId}: ${data}; non importato.`); continue }
        rows.push({ sheetId: sheet._id, participantId, data })
    }
    for (const [district, n] of missingSheet) warnings.push(`Distretto «${district}»: nessun foglio; ${n} partecipanti non importati.`)
    for (const [district, n] of ambiguous) warnings.push(`Distretto «${district}»: più fogli con lo stesso nome; ${n} partecipanti non importati.`)
    for (const [venue, n] of unknownVenue) warnings.push(`Sede #${venue}: non riconducibile a un distretto; ${n} partecipanti non importati.`)
    // Report, never delete, rows that no longer correspond to a participant.
    for (const sheet of sheets) {
        const own = existing.filter(row => row.sheetId.equals(sheet._id))
        const stale = own.filter(row => row.olimanager?.participantId && !seen.has(row.olimanager.participantId)).length
        const unlinked = own.filter(row => !row.olimanager?.participantId).length
        if (stale) warnings.push(`Foglio «${sheet.name}»: ${stale} righe collegate a partecipanti non più presenti nel contest.`)
        if (unlinked) warnings.push(`Foglio «${sheet.name}»: ${unlinked} righe non collegate a Olimanager.`)
    }
    return { rows, warnings, alreadyPresent }
}

const PREPARE_BATCH = 500
const APPLY_BATCH = 100
const LOGIN_ERROR = 'La delega OAuth è scaduta o non è più valida. Rifare il login con scope api e riprendere il lavoro.'

export function createParticipantImportRunner(fetchContest: ((job: OlimanagerJob) => Promise<RemoteContest>) | null) {
    return async (context: ImportJobContext) => {
        const { job } = context
        const schema = schemas[job.importSchema || '']
        if (!schema || !isParticipantImportSchema(job.importSchema || '') || !job.workbookId || !Number.isSafeInteger(job.importContestId)) {
            await context.finish('failed', 'Importazione non configurata correttamente: schema, raccoglitore o contest mancanti.')
            return
        }
        if (!job.preparedAt) {
            if (!fetchContest) throw new Error('Delega OAuth non disponibile per la lettura da Olimanager.')
            await prepare(context, schema.fields.map(field => field.name), fetchContest)
        } else await apply(context)
    }
}

async function prepare(context: ImportJobContext, fields: string[], fetchContest: (job: OlimanagerJob) => Promise<RemoteContest>) {
    const { job, transaction, checkpoint, now, collections: { jobs, items, rows, sheets, credentials } } = context
    const startedAt = job.startedAt || now()
    await transaction(session => checkpoint(session, { startedAt }))
    let remote: RemoteContest
    try { remote = await fetchContest(job) }
    catch (error) {
        if (error instanceof LoginRequired) return context.pauseForLogin(LOGIN_ERROR)
        if (error instanceof CheckFailed) return context.finish('failed', error.message)
        throw error
    }
    context.checkStop()
    const warnings: string[] = []
    const contest = String(job.importContestId)
    const candidates = await sheets.find({ _id: { $in: job.affectedSheetIds } }).toArray()
    const targets = candidates.filter(sheet => sheet.schema === job.importSchema && sheetContest(sheet) === contest)
    for (const sheet of candidates.filter(sheet => !targets.includes(sheet))) warnings.push(`Foglio «${sheet.name}»: schema o contest cambiati; escluso.`)
    const existing = await rows.find({ sheetId: { $in: targets.map(sheet => sheet._id) } }, { projection: { sheetId: 1, 'olimanager.participantId': 1 } }).toArray()
    const plan = planParticipantImport(remote, targets, existing, new Set(fields))
    warnings.push(...plan.warnings)
    // A resumed preparation starts over: drop items of an interrupted attempt.
    await transaction(async session => {
        await checkpoint(session)
        await items.deleteMany({ jobId: job._id }, { session })
    })
    for (let i = 0; i < plan.rows.length; i += PREPARE_BATCH) {
        context.checkStop()
        await transaction(async session => {
            await checkpoint(session)
            await items.insertMany(plan.rows.slice(i, i + PREPARE_BATCH).map(row => ({
                _id: new ObjectId(), jobId: job._id, rowId: new ObjectId(), sheetId: row.sheetId,
                participantId: row.participantId, importData: row.data, status: 'pending' as const, attempts: 0,
            })), { session })
        })
    }
    const waiting = plan.rows.length > 0
    await transaction(async session => {
        await checkpoint(session)
        await jobs.updateOne({ _id: job._id, leaseOwner: context.owner }, {
            $set: { status: waiting ? 'awaiting_confirmation' : 'completed', preparedAt: now(), totalRows: plan.rows.length,
                alreadyPresentRows: plan.alreadyPresent, warnings, ...(waiting ? {} : { finishedAt: now() }) },
            $unset: { leaseOwner: '', leaseExpiresAt: '', error: '' },
        }, { session })
        // Creating rows needs no delegation; sheets stay free while the preview waits.
        await credentials.deleteOne({ _id: job._id }, { session })
        await sheets.updateMany({ olimanagerJobId: job._id }, { $unset: { olimanagerJobId: '' } }, { session })
    })
}

async function apply(context: ImportJobContext) {
    const { job, user, transaction, checkpoint, now, collections: { items, rows, sheets, workbooks } } = context
    const schema = schemas[job.importSchema!]
    const contest = String(job.importContestId)
    await transaction(session => checkpoint(session, { status: 'running' }))
    const workbook = await workbooks.findOne({ _id: job.workbookId })
    if (!workbook) return context.finish('failed', 'Il raccoglitore non esiste più.')
    for (;;) {
        context.checkStop()
        const batch = await items.find({ jobId: job._id, status: 'pending' }).sort({ _id: 1 }).limit(APPLY_BATCH).toArray()
        if (!batch.length) break
        await transaction(async session => {
            await checkpoint(session)
            const counters = new Map<string, { sheetId: ObjectId, nRows: number, nValidRows: number, anomalies: number }>()
            const outcomes: { item: OlimanagerJobItem, status: OlimanagerJobItem['status'], checkResult?: 'imported' | 'already_present', error?: string }[] = []
            for (const item of batch) {
                const sheet = await sheets.findOne({ _id: item.sheetId }, { session })
                const problem = !sheet ? 'Il foglio non esiste più.'
                    : !sheet.olimanagerJobId?.equals(job._id) ? 'Il foglio non è riservato a questo lavoro.'
                    : sheet.schema !== job.importSchema || sheetContest(sheet) !== contest ? 'Schema o contest del foglio cambiati dopo l’anteprima.'
                    : sheet.locked || sheet.closed ? 'Il foglio è chiuso o finalizzato.'
                    : !item.importData ? 'Dati della riga non disponibili.' : ''
                if (problem) { outcomes.push({ item, status: 'failed', error: problem }); continue }
                // Rows added after the preview (or by an interrupted attempt) are not duplicated.
                const present = await rows.findOne({ $or: [{ _id: item.rowId },
                    { sheetId: { $in: job.affectedSheetIds }, 'olimanager.participantId': item.participantId }] }, { session, projection: { _id: 1 } })
                if (present) { outcomes.push({ item, status: 'skipped', checkResult: 'already_present' }); continue }
                let row: Row
                try {
                    const validation = schema.validationContext(sheet!.commonData, workbook.commonData)
                    const derived = schema.computeDerivedData(schema.clean(item.importData!), validation)
                    row = { _id: item.rowId, sheetId: sheet!._id, data: derived.data, error: derived.error, anomalies: derived.anomalies,
                        createdOn: now(), createdBy: user.email, updatedOn: now(), updatedBy: user.email,
                        olimanager: { participantId: item.participantId, contestId: contest, error: '' } }
                } catch {
                    outcomes.push({ item, status: 'failed', error: 'Dati non elaborabili con lo schema del foglio: controllare la configurazione del raccoglitore.' })
                    continue
                }
                await rows.insertOne(row, { session })
                const key = sheet!._id.toString()
                const counter = counters.get(key) || { sheetId: sheet!._id, nRows: 0, nValidRows: 0, anomalies: 0 }
                counter.nRows++
                if (!row.error) counter.nValidRows++
                counter.anomalies += row.anomalies
                counters.set(key, counter)
                outcomes.push({ item, status: 'succeeded', checkResult: 'imported' })
            }
            // Denormalized counters change in the same transaction as the rows.
            for (const { sheetId, nRows, nValidRows, anomalies } of counters.values()) {
                const updated = await sheets.updateOne({ _id: sheetId, olimanagerJobId: job._id },
                    { $inc: { nRows, nValidRows, anomalies }, $set: { updatedAt: now() } }, { session })
                if (!updated.matchedCount) throw new Error('Il foglio non è più riservato al lavoro.')
            }
            await items.bulkWrite(outcomes.map(({ item, status, checkResult, error }): AnyBulkWriteOperation<OlimanagerJobItem> => ({ updateOne: {
                filter: { _id: item._id, jobId: job._id, status: 'pending' },
                update: { $set: { status, finishedAt: now(), ...(checkResult ? { checkResult } : {}), ...(error ? { error } : {}) }, $inc: { attempts: 1 } },
            } })), { session })
            const succeededRows = await items.countDocuments({ jobId: job._id, status: 'succeeded' }, { session })
            const failedRows = await items.countDocuments({ jobId: job._id, status: 'failed' }, { session })
            const skippedRows = await items.countDocuments({ jobId: job._id, status: 'skipped' }, { session })
            await checkpoint(session, { succeededRows, failedRows, skippedRows })
        })
    }
    // The imported data now lives in the rows.
    await items.updateMany({ jobId: job._id }, { $unset: { importData: '' } })
    const failedRows = await items.countDocuments({ jobId: job._id, status: 'failed' })
    await context.finish(failedRows ? 'completed_with_errors' : 'completed')
}
