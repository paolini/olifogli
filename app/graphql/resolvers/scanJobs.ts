import { getSheetsCollection, getScanJobsCollection } from '@/app/lib/mongodb'
import { Context } from '../types'

import { get_authenticated_user, check_user_can_view_sheet } from './utils'
import { ScanJob } from '@/app/lib/models'
import { QueryScanJobsArgs } from '../generated'

// Every user who can view the sheet sees all its jobs and their results.
export default async function scans (_: unknown, { sheetId }: QueryScanJobsArgs, context: Context) {
    const user = await get_authenticated_user(context)
    const sheets = await getSheetsCollection()
    const sheet = await sheets.findOne({_id: sheetId })
    check_user_can_view_sheet(user, sheet)
    const collection = await getScanJobsCollection()
    const jobs: ScanJob[] = (await collection
        .find({ sheetId })
        .sort({ timestamp: -1 })
        .toArray())
    return jobs
        .map(job => (
            {   ...job, 
                message: (job.messages.length > 0) 
                    ? job.messages[job.messages.length - 1] 
                    : null
            }))
}

