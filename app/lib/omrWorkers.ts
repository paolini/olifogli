import type { Db, ObjectId } from 'mongodb'
import { WORKER_HEARTBEAT_TIMEOUT_MS } from './workerHeartbeat'

// Written by the archiomr workers (common/heartbeat.py); Olifogli only reads it.
const COLLECTION = 'omr_workers'
export const OMR_WORKER_TYPES = ['oliscan', 'olisheet'] as const
export type OmrWorkerType = typeof OMR_WORKER_TYPES[number]
// The heartbeat proves the process is alive, not that the job is progressing.
export const OMR_WORKER_STUCK_MS = 30 * 60_000

type OmrWorkerHeartbeat = {
    _id: string
    type: OmrWorkerType
    version: string
    startedAt: Date
    lastSeenAt: Date
    state: 'idle' | 'busy'
    jobId: ObjectId | null
    busySince: Date | null
}

export async function getOmrWorkerStatus(db: Db, now = new Date()) {
    const workers = db.collection<OmrWorkerHeartbeat>(COLLECTION)
    const records = await workers.find(
        { type: { $in: [...OMR_WORKER_TYPES] } },
        { sort: { lastSeenAt: -1 }, projection: { _id: 0 } },
    ).toArray()
    const activeSince = now.getTime() - WORKER_HEARTBEAT_TIMEOUT_MS
    return OMR_WORKER_TYPES.map(type => {
        const ofType = records.filter(record => record.type === type)
        const instances = ofType.filter(record => record.lastSeenAt.getTime() > activeSince).map(record => {
            const busy = record.state === 'busy'
            return {
                version: record.version,
                startedAt: record.startedAt,
                lastSeenAt: record.lastSeenAt,
                state: record.state,
                jobId: busy ? record.jobId : null,
                busySince: busy ? record.busySince : null,
                stuck: busy && !!record.busySince && now.getTime() - record.busySince.getTime() > OMR_WORKER_STUCK_MS,
            }
        })
        return {
            type,
            running: instances.length > 0,
            activeWorkers: instances.length,
            lastSeenAt: ofType[0]?.lastSeenAt || null,
            instances,
        }
    })
}
