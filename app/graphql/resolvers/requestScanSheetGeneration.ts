import { getRowsCollection, getScanPdfJobsCollection, getSheetsCollection } from '@/app/lib/mongodb'
import { Context } from '../types'
import { get_authenticated_user, check_user_is_sheet_admin, check_user_can_update_sheet } from './utils'
import { ObjectId } from 'mongodb'
import { MutationRequestScanSheetGenerationArgs } from '../generated'
import { schemas } from '@/app/lib/schema'
import path from 'path'

export default async function requestScanSheetGeneration(_: unknown, args: MutationRequestScanSheetGenerationArgs, context: Context): Promise<boolean> {
  console.log('[requestScanSheetGeneration] START', { sheetId: args.sheetId, selectedRowIds: args.selectedRowIds })

  const user = await get_authenticated_user(context)
  console.log('[requestScanSheetGeneration] User authenticated:', user.email)

  const sheets = await getSheetsCollection()
  const sheet = await sheets.findOne({ _id: new ObjectId(args.sheetId) })
  console.log('[requestScanSheetGeneration] Sheet found:', sheet?._id.toString())

  if (!sheet) throw new Error(`Foglio non trovato: ${args.sheetId}`)
  
  check_user_is_sheet_admin(user, sheet)
  console.log('[requestScanSheetGeneration] User is sheet admin')

  const schema = schemas[sheet.schema]
  console.log('[requestScanSheetGeneration] Schema:', sheet.schema, schema?.name)

  const timestamp = (() => {
      const now = new Date();
      const pad = (n: number) => n.toString().padStart(2, '0');
      return `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    })();
  const filename = `${schema.name}-${sheet._id.toString()}@${timestamp}.jsonl`
  console.log('[requestScanSheetGeneration] Filename:', filename)
  
  const rowsCollection = await getRowsCollection() 

  const $match: {sheetId: ObjectId,_id?: {$in: ObjectId[]}} = { sheetId: sheet._id }
  const rowIds = args.selectedRowIds

  // se mi viene dato un elenco di row._id lo uso per filtrare
  // altrimenti prendo tutte le righe del foglio
  if (rowIds) $match['_id'] = { $in: rowIds }
  console.log('[requestScanSheetGeneration] Query match:', $match)
  
  const rows = await rowsCollection.find($match).toArray()
  console.log('[requestScanSheetGeneration] Rows found:', rows.length)
  
  const payload = rows.map(row => JSON.stringify(row.data)).join('\n')
  console.log('[requestScanSheetGeneration] Payload size:', payload.length, 'bytes')
  
  const SPOOL_DIR = process.env["SHEETGENSPOOL_DIR"] || '/app/sheetgenspool';
  console.log('[requestScanSheetGeneration] Spool directory:', SPOOL_DIR)

  // create directory if not exists
  const fs = require('fs');
  if (!fs.existsSync(SPOOL_DIR)) {
    console.log('[requestScanSheetGeneration] Creating spool directory')
    fs.mkdirSync(SPOOL_DIR, { recursive: true });
  }
  
  const filePath = path.join(SPOOL_DIR, filename)
  console.log('[requestScanSheetGeneration] Writing file:', filePath)
  fs.writeFileSync(filePath, payload);
  console.log('[requestScanSheetGeneration] File written successfully')
  
  const scanPdfJobsCollection = await getScanPdfJobsCollection()
  const insertResult = await scanPdfJobsCollection.insertOne({
      sheetId: sheet._id,
      timestamp: new Date(),
      filename: filename,
      status: 'pending'
  })
  console.log('[requestScanSheetGeneration] Job inserted:', insertResult.insertedId.toString())
  console.log('[requestScanSheetGeneration] SUCCESS')
  return true
}