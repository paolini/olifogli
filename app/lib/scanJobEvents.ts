import type { Db } from 'mongodb'

// OMR and PDF workers write directly to MongoDB, outside the GraphQL mutations.
export function watchScanJobs(
    db: Db,
    publish: (sheetId: string, kind: 'scan' | 'pdf') => Promise<unknown>,
    onError: (error: unknown) => void,
) {
    const streams = (['scan_jobs', 'scan_sheet_jobs'] as const).map(name => {
        const stream = db.collection(name).watch([
            { $match: { operationType: { $in: ['insert', 'update', 'replace'] } } },
        ], { fullDocument: 'updateLookup' })
        stream.on('change', change => {
            if ('fullDocument' in change && change.fullDocument?.sheetId) {
                void publish(change.fullDocument.sheetId.toString(), name === 'scan_jobs' ? 'scan' : 'pdf').catch(onError)
            }
        })
        stream.on('error', onError)
        return stream
    })

    // Results can arrive after the last progress message, or after a stale job
    // has already been displayed. Refresh the results independently of status.
    const results = db.collection('scan_results').watch([
        { $match: { operationType: { $in: ['insert', 'update', 'replace'] } } },
    ], { fullDocument: 'updateLookup' })
    results.on('change', change => {
        if (!('fullDocument' in change) || !change.fullDocument?.jobId) return
        const jobId = change.fullDocument.jobId
        void (async () => {
            const job = await db.collection('scan_jobs').findOne({ _id: jobId }, { projection: { sheetId: 1 } })
            if (job?.sheetId) await publish(job.sheetId.toString(), 'scan')
        })().catch(onError)
    })
    results.on('error', onError)
    streams.push(results)
    return { close: () => Promise.all(streams.map(stream => stream.close())) }
}
