import { Context } from '../types'
import { get_authenticated_user, check_user_can_view_sheet } from './utils'
import { getSheetsCollection } from '@/app/lib/mongodb'
import { QuerySheetArgs } from '../generated'
import { Sheet } from '@/app/graphql/generated'
import type { GraphQLResolveInfo, SelectionSetNode } from 'graphql'

function selectionHasField(selectionSet: SelectionSetNode | undefined, name: string, info: GraphQLResolveInfo): boolean {
  if (!selectionSet) return false
  for (const sel of selectionSet.selections) {
    if (sel.kind === 'Field') {
      if (sel.name.value === name) return true
    } else if (sel.kind === 'InlineFragment') {
      if (selectionHasField(sel.selectionSet, name, info)) return true
    } else if (sel.kind === 'FragmentSpread') {
      const frag = info.fragments[sel.name.value]
      if (frag && selectionHasField(frag.selectionSet, name, info)) return true
    }
  }
  return false
}

export default async function sheet (_: unknown, { sheetId }: QuerySheetArgs, context: Context, info: GraphQLResolveInfo): Promise<Sheet> {
      const user = await get_authenticated_user(context)
      const collection = await getSheetsCollection()

      const needNRows = selectionHasField(info.fieldNodes[0]?.selectionSet, 'nRows', info)

      const pipeline: object[] = [
        { $match: { _id: sheetId } },
        { $lookup: { from: 'workbooks', localField: 'workbookId', foreignField: '_id', as: 'workbook' } },
        { $unwind: { path: '$workbook', preserveNullAndEmptyArrays: true } },
      ]

      if (needNRows) {
        pipeline.push(
          {
            $lookup: {
              from: 'rows',
              let: { sid: '$_id' },
              pipeline: [
                { $match: { $expr: { $eq: ['$sheetId', '$$sid'] } } },
                { $count: 'count' },
              ],
              as: 'nRowsArr',
            },
          },
          { $addFields: { nRows: { $ifNull: [ { $arrayElemAt: ['$nRowsArr.count', 0] }, 0 ] } } },
          { $project: { nRowsArr: 0 } },
        )
      }

      const sheets = await collection.aggregate<Sheet>(pipeline).toArray()
      if (!sheets || sheets.length === 0) throw Error('foglio inesistente')
      const sheet = sheets[0]
      check_user_can_view_sheet(user, sheet)
      return sheet
    }
