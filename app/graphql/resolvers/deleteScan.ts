import { appLog } from '@/app/lib/appLog'
import { getScanJobsCollection, getScanResultsCollection, getSheetsCollection, withTransaction } from '@/app/lib/mongodb'
import { ObjectId } from 'mongodb'
import { TOPICS } from '@/app/lib/pubsub'
import { Context } from '../types'
import { get_authenticated_user, check_job_exists, check_user_can_edit_rows } from './utils'

export default async function deleteScan(_: unknown, { jobId }: { 
    jobId: ObjectId 
}, context: Context) {
    const user = await get_authenticated_user(context)
    const jobs = await getScanJobsCollection()
    const job = await jobs.findOne({ _id: jobId })
    check_job_exists(job)
    // Deleting requires edit rights on the sheet: not on closed or finalized sheets.
    const sheets = await getSheetsCollection()
    check_user_can_edit_rows(user, await sheets.findOne({ _id: job.sheetId }))

    // Usa una transazione per garantire la consistenza
    await withTransaction(async (session) => {
        const scanResultsCollection = await getScanResultsCollection()    
        await scanResultsCollection.deleteMany({jobId}, { session })
        await jobs.deleteOne({ _id: jobId }, { session })

        // Decrementa nScanJobs nel sheet
        await sheets.updateOne(
            { _id: job.sheetId },
            { $inc: { nScanJobs: -1 } },
            { session }
        )
    })

    /* i files non vengono cancellati */

    // A deleted MongoDB document no longer contains the sheetId for the watcher.
    await context.pubsub?.publish(TOPICS.SCAN_JOB_UPDATED(job.sheetId.toString()), { scanJobUpdated: true })

    appLog('scan.deleted', { jobId: jobId.toString(), sheetId: job.sheetId.toString() }, { userId: user._id })

    return true
}
