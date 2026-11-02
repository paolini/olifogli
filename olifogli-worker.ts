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
import { createSheetEncryptor, openSheetEncryptionKey, createSheetDecryptor, openSheetDecryptionPassword } from './app/lib/sheetEncryption'
import { receiveSheetEncryptionKeys } from './app/lib/sheetEncryptionTransport'
import { ObjectId } from 'mongodb'
import { startWorkerHeartbeat } from './app/lib/workerHeartbeat'

loadEnvConfig(process.cwd(), process.env.NODE_ENV !== 'production')
const { values } = parseArgs({ options: { once: { type: 'boolean', default: false }, help: { type: 'boolean', default: false } } })
let stopping = false
process.on('SIGINT', () => { stopping = true })
process.on('SIGTERM', () => { stopping = true })

async function main() {
    if (values.help) {
        console.log('Uso: npm run olifogli:worker -- [--once]\nVerifica collegamenti, crea/abbina partecipanti, invia risultati su Olimanager o cifra/decifra i fogli secondo il lavoro accodato. --once elabora al massimo un lavoro.')
        return
    }
    const client = new MongoClient(process.env.MONGODB_URI || 'mongodb://localhost:27017/olifogli')
    const encryptionKeys = new Map<string, ReturnType<typeof createSheetEncryptor> | ReturnType<typeof createSheetDecryptor>>()
    const disposeSecrets = new Map<string, () => void>()
    let stopHeartbeat: (() => Promise<void>) | undefined
    let stopReceiving: (() => void) | undefined
    let heartbeat: ReturnType<typeof setInterval> | undefined
    try {
        await client.connect()
        const db = client.db()
        await ensureJobIndexes(db)
        const transaction: Transaction = async fn => {
            const session = client.startSession()
            try { return await session.withTransaction(() => fn(session)) }
            finally { await session.endSession() }
        }
        stopReceiving = await receiveSheetEncryptionKeys(async (jobId, envelope) => {
            const job = await db.collection('olimanager_jobs').findOne({ _id: new ObjectId(jobId), operation: { $in: ['crypt_sheets', 'decrypt_sheets'] }, status: 'queued',
                cryptKeyExpiresAt: { $gt: new Date() } })
            if (!job || stopping) return false
            if (job.operation === 'decrypt_sheets') {
                const decrypt = createSheetDecryptor(openSheetDecryptionPassword(jobId, envelope))
                disposeSecrets.get(jobId)?.()
                encryptionKeys.set(jobId, decrypt)
                disposeSecrets.set(jobId, decrypt.dispose)
            } else {
                const material = openSheetEncryptionKey(jobId, envelope)
                disposeSecrets.get(jobId)?.()
                encryptionKeys.set(jobId, createSheetEncryptor(material))
                disposeSecrets.set(jobId, () => { material.key.fill(0) })
            }
            return true
        })
        let renewing = false
        heartbeat = setInterval(() => {
            if (renewing) return
            renewing = true
            void (async () => {
                for (const id of encryptionKeys.keys()) {
                    const result = await db.collection('olimanager_jobs').updateOne({ _id: new ObjectId(id),
                        operation: { $in: ['crypt_sheets', 'decrypt_sheets'] }, status: { $in: ['queued', 'preparing', 'running'] }, cryptKeyExpiresAt: { $gt: new Date() } },
                    { $set: { cryptKeyExpiresAt: new Date(Date.now() + 60_000) } })
                    if (!result.matchedCount) {
                        disposeSecrets.get(id)?.()
                        disposeSecrets.delete(id)
                        encryptionKeys.delete(id)
                    }
                }
            })().catch(() => { /* Expired keys fail their jobs; never log material. */ }).finally(() => { renewing = false })
        }, 10_000)
        const workerId = `${hostname()}:${process.pid}:${randomUUID()}`
        stopHeartbeat = await startWorkerHeartbeat(db, workerId, error => logDiagnostic('olifogli.worker.heartbeat_failed', error))
        console.log('Worker Olifogli avviato: verifiche Olimanager, creazione/abbinamento partecipanti, invio risultati e crittografia/decrittazione fogli.')
        do {
            const processed = await runNextOlimanagerJob(db, transaction, {
                workerId, encryptionKeys, validate: validateOlimanagerJobRow, shouldStop: () => stopping,
                createInspector: async job => {
                    const credential = await db.collection<import('./app/lib/models').OlimanagerJobCredential>('olimanager_job_credentials').findOne({ _id: job._id })
                    const access = credential ? unprotectJobAccess(job, credential) : null
                    if (job.operation === 'update_results') return createResultsSender(job, access)
                    return job.operation === 'match_or_create_participants' ? createParticipantMatcher(job, access) : createRemoteInspector(job, access)
                },
            })
            // Discard completed jobs' keys immediately, without waiting for the heartbeat.
            for (const id of encryptionKeys.keys()) {
                const active = await db.collection('olimanager_jobs').findOne({ _id: new ObjectId(id),
                    status: { $in: ['queued', 'preparing', 'running'] } }, { projection: { _id: 1 } })
                if (!active) {
                    disposeSecrets.get(id)?.()
                    disposeSecrets.delete(id)
                    encryptionKeys.delete(id)
                }
            }
            if (values.once) { console.log(processed ? 'Lavoro elaborato.' : 'Nessun lavoro in attesa.'); break }
            if (!processed && !stopping) await delay(1000)
        } while (!stopping)
    } finally {
        clearInterval(heartbeat)
        stopReceiving?.()
        for (const dispose of disposeSecrets.values()) dispose()
        encryptionKeys.clear()
        try { await stopHeartbeat?.() }
        catch (error) { logDiagnostic('olifogli.worker.heartbeat_stop_failed', error) }
        finally { await client.close() }
    }
}
main().catch(error => { logDiagnostic('olifogli.worker.failed', error); process.exitCode = 1 })
