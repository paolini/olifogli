#!/usr/bin/env node
import { unprotectJobAccess } from './app/lib/olimanagerJobCredentials'
import { createResultsSender } from './app/lib/olimanagerResultsTransfer'
import { createParticipantMatcher } from './app/lib/olimanagerParticipantMatch'
import { createRemoteInspector } from './app/lib/olimanagerRemoteCheck'
import { loadEnvConfig } from '@next/env'
import { MongoClient } from 'mongodb'
import { randomUUID } from 'node:crypto'
import { hostname } from 'node:os'
import { parseArgs } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'
import { ensureJobIndexes, runNextOlimanagerJob, type Transaction } from './app/lib/olimanagerJobs'
import { validateOlimanagerJobRow } from './app/lib/olimanagerJobValidation'
import { logDiagnostic } from './app/lib/logging'

loadEnvConfig(process.cwd(), process.env.NODE_ENV !== 'production')
const { values } = parseArgs({ options: { once: { type: 'boolean', default: false }, help: { type: 'boolean', default: false } } })
let stopping = false
process.on('SIGINT', () => { stopping = true })
process.on('SIGTERM', () => { stopping = true })

async function main() {
    if (values.help) {
        console.log('Uso: npm run olimanager:worker -- [--once]\nVerifica collegamenti, crea/abbina partecipanti o invia risultati su Olimanager secondo il lavoro accodato. --once elabora al massimo un lavoro.')
        return
    }
    const client = new MongoClient(process.env.MONGODB_URI || 'mongodb://localhost:27017/olifogli')
    try {
        await client.connect()
        const db = client.db()
        await ensureJobIndexes(db)
        const transaction: Transaction = async fn => {
            const session = client.startSession()
            try { return await session.withTransaction(() => fn(session)) }
            finally { await session.endSession() }
        }
        const workerId = `${hostname()}:${process.pid}:${randomUUID()}`
        console.log('Worker Olimanager avviato: verifiche, creazione/abbinamento partecipanti e invio risultati.')
        do {
            const processed = await runNextOlimanagerJob(db, transaction, {
                workerId, validate: validateOlimanagerJobRow, shouldStop: () => stopping,
                createInspector: async job => {
                    const credential = await db.collection<import('./app/lib/models').OlimanagerJobCredential>('olimanager_job_credentials').findOne({ _id: job._id })
                    const access = credential ? unprotectJobAccess(job, credential) : null
                    if (job.operation === 'update_results') return createResultsSender(job, access)
                    return job.operation === 'match_or_create_participants' ? createParticipantMatcher(job, access) : createRemoteInspector(job, access)
                },
            })
            if (values.once) { console.log(processed ? 'Lavoro elaborato.' : 'Nessun lavoro in attesa.'); break }
            if (!processed && !stopping) await delay(1000)
        } while (!stopping)
    } finally { await client.close() }
}
main().catch(error => { logDiagnostic('olimanager.worker.failed', error); process.exitCode = 1 })
