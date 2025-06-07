import { getScanJobsCollection, getScanResultsCollection, getSheetsCollection } from '@/app/lib/mongodb'
import { ObjectId } from 'mongodb'
import { Context } from '../types'
import { get_authenticated_user, check_user_can_edit_sheet } from './utils'

export default async function deleteScan(_: unknown, { sheetId, jobId }: { 
    sheetId: ObjectId 
    jobId: string
}, context: Context) {
    /*
    const user = await get_authenticated_user(context)
    const scansCollection = await getScansCollection()
    check_user_can_edit_sheet(user, sheet)
    const scanResultsCollection = await getScanResultsCollection()    
    await scanResultsCollection.deleteMany({sheetId: scan.sheetId, jobId: scan.jobId})
    await scansCollection.deleteOne({_id: scanId})
    return true
    */
}
