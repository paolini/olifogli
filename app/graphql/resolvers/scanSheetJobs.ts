import { getSheetsCollection, getScanSheetJobsCollection } from '@/app/lib/mongodb'
import { Context } from '../types'
import { get_authenticated_user, check_user_can_view_sheet } from './utils'
import { QueryScanSheetJobsArgs } from '../generated'

export default async function scanSheetJobs(_: unknown, { sheetId }: QueryScanSheetJobsArgs, context: Context) {
  const user = await get_authenticated_user(context)
  
  const sheets = await getSheetsCollection()
  const sheet = await sheets.findOne({ _id: sheetId })
  
  if (!sheet) throw new Error(`Foglio non trovato: ${sheetId}`)
  
  check_user_can_view_sheet(user, sheet)

  const collection = await getScanSheetJobsCollection()
  const jobs = await collection
    .find({ sheetId })
    .sort({ timestamp: -1 })
    .toArray()
  
  return jobs
}
