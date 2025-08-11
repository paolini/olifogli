import { Context } from '../types'
import { get_authenticated_user, check_user_can_edit_sheet } from './utils'
import { getSheetsCollection } from '@/app/lib/mongodb'
import { QuerySheetArgs } from '../generated'
import { Sheet } from '@/app/lib/models'

export default async function sheet (_: unknown, { sheetId }: QuerySheetArgs, context: Context): Promise<Sheet> {
      const user = await get_authenticated_user(context)
      const collection = await getSheetsCollection()
      const sheets = await collection.aggregate<Sheet>([
        { $match: { _id: sheetId } },
        { $lookup: { from: 'workbooks', localField: 'workbookId', foreignField: '_id', as: 'workbook' } },
        { $unwind: { path: '$workbook', preserveNullAndEmptyArrays: true } },
      ]).toArray()
      if (!sheets || sheets.length === 0) throw Error('foglio inesistente')
      const sheet = sheets[0]
      check_user_can_edit_sheet(user, sheet)
      return sheet
    }
