import { ObjectId, type ClientSession, type Db, type Filter } from 'mongodb'
import type { OlimanagerJob, OlimanagerJobItem, OlimanagerJobCredential, OlimanagerCheckResult, Row, Sheet, Workbook, User } from './models'

export type Transaction = <T>(fn: (session: ClientSession) => Promise<T>) => Promise<T>
const LEASE_MS = 60_000
const BATCH_SIZE = 200
const unique = (ids: ObjectId[]) => [...new Map(ids.map(id => [id.toString(), id])).values()]

export function jobCollections(db: Db) {
    return {
        jobs: db.collection<OlimanagerJob>('olimanager_jobs'),
        items: db.collection<OlimanagerJobItem>('olimanager_job_items'),
        credentials: db.collection<OlimanagerJobCredential>('olimanager_job_credentials'),
        rows: db.collection<Row>('rows'), sheets: db.collection<Sheet>('sheets'),
        workbooks: db.collection<Workbook>('workbooks'), users: db.collection<User>('users'),
    }
}

export async function ensureJobIndexes(db: Db) {
    const { jobs, items, credentials } = jobCollections(db)
    await jobs.createIndex({ status: 1, leaseExpiresAt: 1, createdAt: 1 })
    await jobs.createIndex({ affectedSheetIds: 1, createdAt: -1 })
    await items.createIndex({ jobId: 1, rowId: 1 }, { unique: true })
    await items.createIndex({ jobId: 1, status: 1, _id: 1 })
    await credentials.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
}

export async function queueOlimanagerJob(db: Db, transaction: Transaction, user: User,
    targets: { rowIds?: ObjectId[] | null, sheetIds?: ObjectId[] | null }, endpoint: string,
    protect?: (job: OlimanagerJob) => OlimanagerJobCredential,
    operation: OlimanagerJob['operation'] = 'check_participants',
): Promise<OlimanagerJob> {
    if (!user.isAdmin) throw new Error('non autorizzato')
    if (!['check_participants', 'match_or_create_participants'].includes(operation)) throw new Error('Operazione Olimanager non supportata.')
    if (operation === 'match_or_create_participants' && !protect) throw new Error('La creazione richiede una delega OAuth.')
    const rowIds = unique(targets.rowIds || []), sheetIds = unique(targets.sheetIds || [])
    if (!rowIds.length && !sheetIds.length) throw new Error('Selezionare almeno una riga o un foglio.')
    const url = new URL(endpoint)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
        throw new Error('OLIMANAGER_GRAPHQL_ENDPOINT non valido.')
    }
    await ensureJobIndexes(db)
    const { jobs, rows, sheets, credentials } = jobCollections(db)
    return transaction(async session => {
        const explicitRows = await rows.find({ _id: { $in: rowIds } }, { session, projection: { sheetId: 1 } }).toArray()
        if (explicitRows.length !== rowIds.length) throw new Error('Una delle righe selezionate non esiste più.')
        const affectedSheetIds = unique([...sheetIds, ...explicitRows.map(row => row.sheetId)])
        const selectedSheets = await sheets.find({ _id: { $in: affectedSheetIds } }, { session }).toArray()
        if (selectedSheets.length !== affectedSheetIds.length) throw new Error('Uno dei fogli selezionati non esiste più.')
        for (const sheet of selectedSheets) {
            if (!sheet.locked) throw new Error(`Finalizzare il foglio «${sheet.name}» prima del lavoro Olimanager.`)
            if (sheet.olimanagerJobId) throw new Error(`Il foglio «${sheet.name}» ha già un lavoro Olimanager attivo.`)
        }
        const job: OlimanagerJob = {
            _id: new ObjectId(), operation, checkMode: protect ? 'remote' : 'local', rowIds, sheetIds, affectedSheetIds,
            endpoint: url.href, createdBy: user._id, createdAt: new Date(), status: 'queued',
            totalRows: 0, succeededRows: 0, failedRows: 0, skippedRows: 0,
        }
        // Lock sheets and enqueue atomically, also serializing concurrent queue/reopen requests.
        const locked = await sheets.updateMany({ _id: { $in: affectedSheetIds }, locked: true,
            olimanagerJobId: { $exists: false } }, { $set: { olimanagerJobId: job._id } }, { session })
        if (locked.matchedCount !== affectedSheetIds.length) throw new Error('La selezione è cambiata: riprovare.')
        if (protect) await credentials.insertOne(protect(job), { session })
        await jobs.insertOne(job, { session })
        return job
    })
}

export const queueOlimanagerCheck = queueOlimanagerJob

export async function resumeOlimanagerCheck(db: Db, transaction: Transaction, user: User, jobId: ObjectId,
    protect: (job: OlimanagerJob) => OlimanagerJobCredential, endpoint: string,
): Promise<OlimanagerJob> {
    if (!user.isAdmin) throw new Error('non autorizzato')
    const { jobs, credentials } = jobCollections(db)
    return transaction(async session => {
        const job = await jobs.findOne({ _id: jobId }, { session })
        if (!job || job.checkMode !== 'remote' || job.status !== 'needs_login') throw new Error('Il lavoro non è in attesa di un nuovo login.')
        if (!job.createdBy.equals(user._id)) throw new Error('Solo l’amministratore che ha avviato il lavoro può rinnovare la delega OAuth.')
        if (job.endpoint !== new URL(endpoint).href) throw new Error('L’endpoint configurato è diverso da quello del lavoro.')
        await credentials.replaceOne({ _id: job._id }, protect(job), { upsert: true, session })
        await jobs.updateOne({ _id: job._id, status: 'needs_login' }, {
            $set: { status: 'queued' }, $unset: { error: '', leaseOwner: '', leaseExpiresAt: '' },
        }, { session })
        return { ...job, status: 'queued', error: undefined }
    })
}

class LeaseLost extends Error {}
class WorkerStopped extends Error {}

type WorkerOptions = {
    workerId: string
    validate: (row: Row, sheet: Sheet, workbook: Workbook) => void
    createInspector?: (job: OlimanagerJob) => Promise<(row: Row, sheet: Sheet, workbook: Workbook) => Promise<OlimanagerCheckResult>>
    now?: () => Date
    shouldStop?: () => boolean
}

export async function runNextOlimanagerJob(db: Db, transaction: Transaction, options: WorkerOptions): Promise<boolean> {
    const { jobs, items, rows, sheets, workbooks, users, credentials } = jobCollections(db)
    const now = options.now || (() => new Date())
    // A unique lease per claim prevents an old incarnation of a worker from committing.
    const owner = `${options.workerId}:${new ObjectId()}`
    const job = await jobs.findOneAndUpdate({ operation: { $in: ['check_participants', 'match_or_create_participants'] }, $or: [
        { status: 'queued' },
        { status: { $in: ['preparing', 'running'] }, leaseExpiresAt: { $lte: now() } },
    ] }, { $set: { status: 'preparing', leaseOwner: owner, leaseExpiresAt: new Date(now().getTime() + LEASE_MS) } },
    { sort: { createdAt: 1 }, returnDocument: 'after' })
    if (!job) return false
    const startedAt = job.startedAt || now()

    async function checkpoint(session: ClientSession, update: Partial<OlimanagerJob> = {}) {
        const result = await jobs.updateOne({ _id: job!._id, leaseOwner: owner, leaseExpiresAt: { $gt: now() } },
            { $set: { ...update, leaseExpiresAt: new Date(now().getTime() + LEASE_MS) } }, { session })
        if (!result.matchedCount) throw new LeaseLost()
    }
    async function finish(status: OlimanagerJob['status'], error?: string) {
        await transaction(async session => {
            await checkpoint(session)
            await jobs.updateOne({ _id: job!._id, leaseOwner: owner }, {
                $set: { status, finishedAt: now(), ...(error ? { error } : {}) },
                $unset: { leaseOwner: '', leaseExpiresAt: '' },
            }, { session })
            await credentials.deleteOne({ _id: job!._id }, { session })
            await sheets.updateMany({ olimanagerJobId: job!._id }, { $unset: { olimanagerJobId: '' } }, { session })
        })
    }
    function checkStop() { if (options.shouldStop?.()) throw new WorkerStopped() }
    try {
        const user = await users.findOne({ _id: job.createdBy })
        if (!user?.isAdmin) {
            await finish('failed', 'L’utente che ha richiesto il lavoro non è più amministratore.')
            return true
        }
        const inspect = job.checkMode === 'remote' ? await options.createInspector?.(job) : null
        if (job.checkMode === 'remote' && !inspect) throw new Error('Verifica remota non supportata da questa versione del worker.')
        if (!job.preparedAt) {
            const selection: Filter<Row> = { $or: [
                { _id: { $in: job.rowIds } }, { sheetId: { $in: job.sheetIds } },
            ] }
            // Explicit IDs also get an item if the row disappeared after enqueueing.
            let pending: { rowId: ObjectId, sheetId?: ObjectId }[] = job.rowIds.map(rowId => ({ rowId }))
            async function flush() {
                checkStop()
                if (!pending.length) return
                const batch = pending
                pending = []
                await transaction(async session => {
                    await checkpoint(session, { startedAt })
                    await items.bulkWrite(batch.map(({ rowId, sheetId }) => ({ updateOne: {
                        filter: { jobId: job!._id, rowId },
                        update: { $setOnInsert: { jobId: job!._id, rowId, status: 'pending', attempts: 0 }, ...(sheetId ? { $set: { sheetId } } : {}) },
                        upsert: true,
                    } })), { session })
                })
            }
            while (pending.length > BATCH_SIZE) {
                const rest = pending.splice(BATCH_SIZE)
                await flush()
                pending = rest
            }
            await flush()
            for await (const row of rows.find(selection, { projection: { _id: 1, sheetId: 1 } }).batchSize(BATCH_SIZE)) {
                pending.push({ rowId: row._id, sheetId: row.sheetId })
                if (pending.length >= BATCH_SIZE) await flush()
            }
            await flush()
            const totalRows = await items.countDocuments({ jobId: job._id })
            await transaction(session => checkpoint(session, { preparedAt: now(), totalRows, status: 'running' }))
        } else await transaction(session => checkpoint(session, { status: 'running' }))

        while (true) {
            checkStop()
            const batch = await items.find({ jobId: job._id, status: 'pending' }).sort({ _id: 1 }).limit(inspect ? 1 : BATCH_SIZE).toArray()
            if (!batch.length) break
            const outcomes: { item: OlimanagerJobItem, sheetId?: ObjectId, error?: string, check?: OlimanagerCheckResult }[] = []
            for (const item of batch) {
                try {
                    const row = await rows.findOne({ _id: item.rowId })
                    if (!row) throw new Error('La riga non esiste più.')
                    const sheet = await sheets.findOne({ _id: row.sheetId })
                    if (!sheet) throw new Error('Il foglio non esiste più.')
                    if (!sheet.locked) throw new Error('Il foglio non è finalizzato.')
                    if (!sheet.olimanagerJobId?.equals(job._id)) throw new Error('Il foglio non è riservato a questo lavoro.')
                    const workbook = await workbooks.findOne({ _id: sheet.workbookId })
                    if (!workbook) throw new Error('La raccolta non esiste più.')
                    if (inspect) {
                        await transaction(session => checkpoint(session))
                        const check = await inspect(row, sheet, workbook)
                        if (check.result === 'needs_login') {
                            await transaction(async session => {
                                await checkpoint(session)
                                await jobs.updateOne({ _id: job._id, leaseOwner: owner }, {
                                    $set: { status: 'needs_login', error: check.error }, $unset: { leaseOwner: '', leaseExpiresAt: '' },
                                }, { session })
                                await credentials.deleteOne({ _id: job._id }, { session })
                            })
                            return true
                        }
                        outcomes.push({ item, sheetId: row.sheetId, check,
                            ...(!['matched', 'unmatched', 'created', 'linked', 'already_linked', 'absent'].includes(check.result) ? { error: check.error || 'Verifica non riuscita.' } : {}),
                        })
                    } else {
                        options.validate(row, sheet, workbook)
                        outcomes.push({ item, sheetId: row.sheetId })
                    }
                } catch (error) {
                    if (error instanceof LeaseLost) throw error
                    outcomes.push({ item, sheetId: item.sheetId, error: error instanceof Error ? error.message : 'Verifica fallita.' })
                }
            }
            await transaction(async session => {
                await checkpoint(session)
                if (job.operation === 'match_or_create_participants') {
                    for (const { item, check, error } of outcomes) {
                        if (!error && check && ['created', 'linked'].includes(check.result)) {
                            if (!check.participantId || !check.contestId) throw new Error('Collegamento Olimanager incompleto.')
                            const updated = await rows.updateOne({ _id: item.rowId }, { $set: {
                                'olimanager.participantId': check.participantId,
                                'olimanager.contestId': check.contestId,
                                'olimanager.participantCreatedOn': now(),
                                'olimanager.error': '',
                                updatedOn: now(), updatedBy: user.email,
                            } }, { session })
                            if (!updated.matchedCount) throw new Error('La riga da collegare non esiste più.')
                        }
                    }
                }
                await items.bulkWrite(outcomes.map(({ item, sheetId, error, check }) => ({ updateOne: {
                    filter: { _id: item._id, jobId: job._id, status: 'pending' },
                    update: { $set: { status: check && ['unmatched', 'absent', 'already_linked'].includes(check.result) ? 'skipped' : error ? 'failed' : 'succeeded', finishedAt: now(),
                        ...(check ? { checkResult: check.result, differences: check.differences || [],
                            ...(check.participantId ? { participantId: check.participantId } : {}),
                            ...(check.competitorId ? { competitorId: check.competitorId } : {}),
                            ...(job.operation === 'match_or_create_participants' ? {
                                competitorCreated: !!check.competitorCreated, participantCreated: !!check.participantCreated,
                                multipleCompetitorsMatched: !!check.multipleCompetitorsMatched,
                            } : {}),
                        } : {}),
                        ...(sheetId ? { sheetId } : {}), ...(error ? { error } : {}) }, $inc: { attempts: 1 } },
                } })), { session })
                // Recompute from durable item state: retries cannot double-count progress.
                const succeededRows = await items.countDocuments({ jobId: job._id, status: 'succeeded' }, { session })
                const failedRows = await items.countDocuments({ jobId: job._id, status: 'failed' }, { session })
                const skippedRows = await items.countDocuments({ jobId: job._id, status: 'skipped' }, { session })
                await checkpoint(session, { succeededRows, failedRows, skippedRows })
            })
        }
        const failedRows = await items.countDocuments({ jobId: job._id, status: 'failed' })
        await finish(failedRows ? 'completed_with_errors' : 'completed')
    } catch (error) {
        if (error instanceof LeaseLost) return true
        if (error instanceof WorkerStopped) {
            await jobs.updateOne({ _id: job._id, leaseOwner: owner }, { $set: { leaseExpiresAt: now() } })
            return true
        }
        await finish('failed', job.operation === 'check_participants'
            ? 'Errore interno durante la verifica; il lavoro non ha trasferito dati a Olimanager.'
            : 'Lavoro interrotto: alcune operazioni potrebbero essere già state eseguite su Olimanager. Controllare gli esiti prima di riprovare.')
        throw error
    }
    return true
}

export const runNextOlimanagerCheck = runNextOlimanagerJob
