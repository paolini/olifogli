import type { Db } from 'mongodb'

export function watchOlimanagerJobs(db: Db, publish: () => Promise<unknown>, onError: (error: unknown) => void) {
    // Ignore lease heartbeats and other internal writes; publish visible progress only.
    const stream = db.collection('olimanager_jobs').watch([{ $match: { $or: [
        { operationType: { $in: ['insert', 'replace', 'delete'] } },
        ...['status', 'totalRows', 'succeededRows', 'failedRows', 'skippedRows'].map(field => ({
            operationType: 'update', [`updateDescription.updatedFields.${field}`]: { $exists: true },
        })),
    ] } }])
    stream.on('change', () => { void publish().catch(onError) })
    stream.on('error', onError)
    return stream
}
