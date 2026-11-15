import { getScanResultsCollection, getScanJobsCollection, getSheetsCollection } from '@/app/lib/mongodb'
import { Context } from '../types'

import { get_authenticated_user, check_user_can_view_job, check_user_can_view_sheet } from './utils'
import { QueryScanResultsArgs, ScanResults } from '../generated'

export default async function scanResults(_: unknown, { jobId }: QueryScanResultsArgs, context: Context) {
    const user = await get_authenticated_user(context)
    const jobs = await getScanJobsCollection()
    const job = await jobs.findOne({_id: jobId })
    check_user_can_view_job(user, job)
    // Job ownership is not enough: access to the sheet may have been revoked.
    const sheets = await getSheetsCollection()
    check_user_can_view_sheet(user, await sheets.findOne({ _id: job.sheetId }))
    const collection = await getScanResultsCollection()
    const results: ScanResults[] = await collection.find({ jobId }).toArray()
    return results
}

