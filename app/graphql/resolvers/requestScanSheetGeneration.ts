import { getRowsCollection, getScanSheetJobsCollection, getSheetsCollection, withTransaction } from '@/app/lib/mongodb'
import { Context } from '../types'
import { get_authenticated_user, check_user_is_sheet_admin, check_user_can_update_sheet } from './utils'
import { ObjectId } from 'mongodb'
import { MutationRequestScanSheetGenerationArgs } from '../generated'
import { schemas } from '@/app/lib/schema'
import path from 'path'
import fs from 'fs'

export default async function requestScanSheetGeneration(_: unknown, args: MutationRequestScanSheetGenerationArgs, context: Context): Promise<boolean> {
  const user = await get_authenticated_user(context)

  const sheets = await getSheetsCollection()
  const sheet = await sheets.findOne({ _id: new ObjectId(args.sheetId) })

  if (!sheet) throw new Error(`Foglio non trovato: ${args.sheetId}`)
  
  check_user_is_sheet_admin(user, sheet)

  const schema = schemas[sheet.schema]

  const rowsCollection = await getRowsCollection() 

  const $match: {sheetId: ObjectId,_id?: {$in: ObjectId[]}} = { sheetId: sheet._id }
  const rowIds = args.selectedRowIds

  // se mi viene dato un elenco di row._id lo uso per filtrare
  // altrimenti prendo tutte le righe del foglio
  if (rowIds) $match['_id'] = { $in: rowIds }
  
  const rows = await rowsCollection.find($match).toArray()
  
  const payload = rows.map(row => JSON.stringify(row.data)).join('\n')
  
  const SPOOL_DIR = process.env["SHEETGENSPOOL_DIR"] || '/app/sheetgenspool';

  // create directory if not exists
  if (!fs.existsSync(SPOOL_DIR)) {
    fs.mkdirSync(SPOOL_DIR, { recursive: true });
  }
  
  const now = new Date();

  const scanSheetJobsCollection = await getScanSheetJobsCollection()
  const sheetsCollection = await getSheetsCollection()

  // Usa una transazione per garantire la consistenza tra job e sheet
  const job_id = await withTransaction(async (session) => {
      const result = await scanSheetJobsCollection.insertOne({
          sheetId: sheet._id,
          timestamp: now,
          status: 'pending',
          message: 'submitting job',
          createdBy: user.email
      }, { session })

      // Incrementa nScanSheetJobs nel sheet
      await sheetsCollection.updateOne(
          { _id: sheet._id },
          { $inc: { nScanSheetJobs: 1 } },
          { session }
      )

      return result.insertedId
  })

  const filename = `${schema.name}-${job_id.toString()}.jsonl`
  const filePath = path.join(SPOOL_DIR, filename)

  console.log(`Writing scan sheet generation job to spool: ${filePath}`)
  fs.writeFileSync(filePath, payload);

  return true
}