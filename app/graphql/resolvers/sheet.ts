import { Context } from '../types'
import { get_authenticated_user, check_user_can_edit_sheet } from './utils'
import { getSheetsCollection } from '@/app/lib/mongodb'
import { QuerySheetArgs, Sheet } from '../generated'

export default async function sheet (_: unknown, { sheetId }: QuerySheetArgs, context: Context): Promise<Sheet> {
      const user = await get_authenticated_user(context)
      const collection = await getSheetsCollection()
      const sheet = await collection.findOne({_id: sheetId})
      if (!sheet) throw Error('foglio inesistente')
      check_user_can_edit_sheet(user, sheet)
      return sheet
    }
