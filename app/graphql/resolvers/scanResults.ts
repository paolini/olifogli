import { getScanResultsCollection, getScanJobsCollection } from '@/app/lib/mongodb'
import { ObjectId } from 'mongodb'
import { Context } from '../types'

import { get_authenticated_user, check_user_can_view_job } from './utils'

export default async function scanResults(_: unknown, { jobId }: { jobId: ObjectId }, context: Context) {
    const user = await get_authenticated_user(context)
    const jobs = await getScanJobsCollection()
    const job = await jobs.findOne({_id: jobId })
    check_user_can_view_job(user, job)
    const collection = await getScanResultsCollection()
    const results = await collection.find({ jobId }).sort({ timestamp: -1 })
    return results.toArray()
}

