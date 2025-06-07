import { getScanJobsCollection, getScanResultsCollection } from '@/app/lib/mongodb'
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
    const scanResultsCollection = await getScanResultsCollection()    
    await scanResultsCollection.deleteMany({jobId})
    await jobs.deleteOne({ _id: jobId })

    /* i files non vengono cancellati */

    return true
}
