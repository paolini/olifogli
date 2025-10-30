import { getRowsCollection, getScanPdfJobsCollection, getSheetsCollection } from '@/app/lib/mongodb'
import { Context } from '../types'
import { get_authenticated_user, check_user_is_sheet_admin, check_user_can_update_sheet } from './utils'
import { ObjectId } from 'mongodb'
import { MutationRequestScanSheetGenerationArgs } from '../generated'
import { schemas } from '@/app/lib/schema'
import path from 'path'

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
  const fs = require('fs');
  if (!fs.existsSync(SPOOL_DIR)) {
    fs.mkdirSync(SPOOL_DIR, { recursive: true });
  }
  
  const timestamp = (() => {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  })();
  const filename = `${schema.name}-${sheet._id.toString()}@${timestamp}.jsonl`
  
  const filePath = path.join(SPOOL_DIR, filename)
  fs.writeFileSync(filePath, payload);
  
    
  const scanPdfJobsCollection = await getScanPdfJobsCollection()
  const insertResult = await scanPdfJobsCollection.insertOne({
      sheetId: sheet._id,
      timestamp: new Date(),
      filename: filename,
      status: 'pending'
  })
  return true
}