import { getScanJobsCollection, getScanResultsCollection, getSheetsCollection, withTransaction } from '@/app/lib/mongodb'
import { ObjectId } from 'mongodb'
import { Context } from '../types'
import { get_authenticated_user, check_user_can_delete_job } from './utils'

export default async function deleteScan(_: unknown, { jobId }: { 
    jobId: ObjectId 
}, context: Context) {
    const user = await get_authenticated_user(context)
    const jobs = await getScanJobsCollection()
    const job = await jobs.findOne({ _id: jobId })
    check_user_can_delete_job(user, job)

    // Usa una transazione per garantire la consistenza
    await withTransaction(async (session) => {
        const scanResultsCollection = await getScanResultsCollection()    
        await scanResultsCollection.deleteMany({jobId}, { session })
        await jobs.deleteOne({ _id: jobId }, { session })

        // Decrementa nScanJobs nel sheet
        const sheetsCollection = await getSheetsCollection()
        await sheetsCollection.updateOne(
            { _id: job.sheetId },
            { $inc: { nScanJobs: -1 } },
            { session }
        )
    })

    /* i files non vengono cancellati */

    return true
}
