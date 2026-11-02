import type { Db } from 'mongodb'

export const WORKER_HEARTBEAT_INTERVAL_MS = 10_000
export const WORKER_HEARTBEAT_TIMEOUT_MS = 35_000
const COLLECTION = 'olifogli_workers'
type WorkerHeartbeat = { _id: string, lastSeenAt: Date }

export async function getOlifogliWorkerStatus(db: Db, now = new Date()) {
    const workers = db.collection<WorkerHeartbeat>(COLLECTION)
    const activeWorkers = await workers.countDocuments({ lastSeenAt: { $gt: new Date(now.getTime() - WORKER_HEARTBEAT_TIMEOUT_MS) } })
    const latest = await workers.findOne({}, { sort: { lastSeenAt: -1 }, projection: { lastSeenAt: 1 } })
    return { running: activeWorkers > 0, activeWorkers, lastSeenAt: latest?.lastSeenAt || null }
}

export async function startWorkerHeartbeat(db: Db, workerId: string, onError: (error: unknown) => void) {
    const workers = db.collection<WorkerHeartbeat>(COLLECTION)
    // Retain stale heartbeats briefly for diagnostics, then let MongoDB remove them.
    await workers.createIndex({ lastSeenAt: 1 }, { expireAfterSeconds: 86_400 })
    const beat = async () => {
        await workers.updateOne({ _id: workerId }, { $set: { lastSeenAt: new Date() } }, { upsert: true })
    }
    await beat()
    let pending: Promise<void> | undefined
    const timer = setInterval(() => {
        // Keep announcing idle and busy workers, without overlapping slow database writes.
        if (!pending) pending = beat().catch(onError).finally(() => { pending = undefined })
    }, WORKER_HEARTBEAT_INTERVAL_MS)
    timer.unref()
    return async () => {
        clearInterval(timer)
        // An in-flight heartbeat must finish before deletion, or it could recreate the record.
        await pending
        await workers.deleteOne({ _id: workerId })
    }
}
