import { Context } from '../types'
import { get_authenticated_user, check_user_can_view_sheet } from './utils'
import { getSheetsCollection } from '@/app/lib/mongodb'
import { QuerySheetArgs } from '../generated'
import { Sheet } from '@/app/graphql/generated'

export default async function sheet (_: unknown, { sheetId }: QuerySheetArgs, context: Context): Promise<Sheet> {
      const user = await get_authenticated_user(context)
      const collection = await getSheetsCollection()

      // Ora nRows e nValidRows sono campi denormalizzati, non serve più l'aggregazione
      const pipeline: object[] = [
        { $match: { _id: sheetId } },
        { $lookup: { from: 'workbooks', localField: 'workbookId', foreignField: '_id', as: 'workbook' } },
        { $unwind: { path: '$workbook', preserveNullAndEmptyArrays: true } },
      ]

      const sheets = await collection.aggregate<Sheet>(pipeline).toArray()
      if (!sheets || sheets.length === 0) throw Error('foglio inesistente')
      const sheet = sheets[0]
      check_user_can_view_sheet(user, sheet)
      return sheet
    }
