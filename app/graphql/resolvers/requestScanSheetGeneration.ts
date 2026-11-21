import { appLog } from '@/app/lib/appLog'
import { getRowsCollection, getScanSheetJobsCollection, getSheetsCollection, withTransaction } from '@/app/lib/mongodb'
import { Context } from '../types'
import { get_authenticated_user, check_user_is_sheet_admin } from './utils'
import { ObjectId } from 'mongodb'
import { MutationRequestScanSheetGenerationArgs } from '../generated'
import { schemas } from '@/app/lib/schema'
import { stageSpoolFile } from '@/app/lib/spool'

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

  // riordina le righe nell'ordine specificato in selectedRowIds
  const rowMap = new Map(rows.map(r => [r._id.toString(), r]))
  const orderedRows = rowIds 
    ? rowIds.map(rid => rowMap.get(rid.toString())!).filter(r => r)
    : rows

  // In fondo al PDF va un foglio bianco da fotocopiare per i partecipanti non
  // registrati: un record senza dati personali, con il solo nome del foglio
  // come negli altri. olisheet non lo aggiunge più da sé.
  const nBlankSheets = 1
  const records = [
    ...orderedRows.map(row => ({ sheet_name: sheet.name, ...row.data })),
    ...Array.from({ length: nBlankSheets }, () => ({ sheet_name: sheet.name })),
  ]
  const payload = records.map(record => JSON.stringify(record)).join('\n')

  const SPOOL_DIR = process.env["SHEETGENSPOOL_DIR"] || '/app/sheetgenspool';

  const now = new Date();
  const jobId = new ObjectId()

  const scanSheetJobsCollection = await getScanSheetJobsCollection()
  const sheetsCollection = await getSheetsCollection()

  // The records are written before the job exists and published after it is
  // committed: olisheet never sees a partial file, and a failed write leaves
  // neither an orphan job nor a wrong nScanSheetJobs counter.
  const staged = await stageSpoolFile(SPOOL_DIR, `${schema.name}-${jobId.toString()}.jsonl`, payload)

  try {
    await withTransaction(async (session) => {
      await scanSheetJobsCollection.insertOne({
          _id: jobId,
          sheetId: sheet._id,
          timestamp: now,
          status: 'pending',
          message: 'submitting job',
          createdBy: user.email,
          nRows: orderedRows.length,
          nBlankSheets,
      }, { session })
      await sheetsCollection.updateOne(
          { _id: sheet._id },
          { $inc: { nScanSheetJobs: 1 } },
          { session }
      )
    })
  } catch (error) {
    await staged.discard()
    throw error
  }

  try {
    await staged.publish()
  } catch (error) {
    await staged.discard()
    await withTransaction(async (session) => {
      await scanSheetJobsCollection.deleteOne({ _id: jobId }, { session })
      await sheetsCollection.updateOne(
          { _id: sheet._id },
          { $inc: { nScanSheetJobs: -1 } },
          { session }
      )
    })
    throw error
  }

  appLog('scan_sheets.requested', { jobId: jobId.toString(), sheetId: sheet._id.toString(), rowCount: orderedRows.length, nBlankSheets }, { userId: user._id })

  return true
}
