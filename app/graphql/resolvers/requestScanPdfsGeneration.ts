import { getSheetsCollection } from '@/app/lib/mongodb'
import { Context } from '../types'
import { get_authenticated_user, check_user_is_sheet_admin, check_user_can_update_sheet } from './utils'
import { ObjectId } from 'mongodb'
import { MutationRequestScanPdfGenerationArgs } from '../generated'

export default async function requestScanPdfsGeneration(_: unknown, args: MutationRequestScanPdfGenerationArgs, context: Context): Promise<boolean> {
  const user = await get_authenticated_user(context)
  const sheets = await getSheetsCollection()
  const sheet = await sheets.findOne({ _id: new ObjectId(args.sheetId) })
  if (!sheet) throw new Error(`Foglio non trovato: ${args.sheetId}`)
  
  check_user_is_sheet_admin(user, sheet)
  
  const timestamp = (() => {
      const now = new Date();
      const pad = (n: number) => n.toString().padStart(2, '0');
      return `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    })();
    const filename = `${schema.name}-${sheet._id.toString()}@${timestamp}.jsonl`
    const payload = rows.filter(r => selectedRows.has(r._id.toString())).map(r => {
      return JSON.stringify(rows.data) + '\n';
    }).join('');

    try {
      const SPOOL_DIR = process.env["SHEETGENSPOOL_DIR"] || '/app/sheetgenspool';

      // create directory if not exists
      const fs = require('fs');
      if (!fs.existsSync(SPOOL_DIR)) {
        fs.mkdirSync(SPOOL_DIR, { recursive: true });
      }
    } catch (error) {
      console.error('Error creating spool directory:', error);
      return;
    }

    try {
      const filename = `${schema.name}-${sheet._id.toString()}@${timestamp}.jsonl`;
      fs.writeFileSync(path.join(SPOOL_DIR, filename), payload);
    } catch (error) {
      console.error('Error writing spool file:', error);
    }


}