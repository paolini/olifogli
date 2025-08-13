import { Context } from '../types'
import { get_authenticated_user } from './utils'
import { getSheetsCollection } from '@/app/lib/mongodb'
import { QuerySheetsArgs, Sheet } from '../generated'
import type { GraphQLResolveInfo, SelectionSetNode } from 'graphql'
import workbook from './workbook'

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

export default async function sheets(_: unknown, { workbookId }: QuerySheetsArgs, context: Context, info: GraphQLResolveInfo): Promise<Sheet[]> {
    const user = await get_authenticated_user(context)

    if (!user) throw new Error("Not authenticated")

    const collection = await getSheetsCollection()

    const needWorkbook = selectionHasField(info.fieldNodes[0]?.selectionSet, 'workbook', info)
    const needNRows = selectionHasField(info.fieldNodes[0]?.selectionSet, 'nRows', info)

    const pipeline: object[] = []
    
    if (workbookId) {
        pipeline.push({ $match: { workbookId } })
    }

    if (!user.isAdmin) {
        pipeline.push({ $match: { $or: [
            { ownerId: user._id },
            { permittedEmails: user.email },
            { permittedIds: user._id },
        ] } })
    }

    if (needNRows) {
        // Batch compute counts for all matched sheets with a single lookup
        pipeline.push(
            {
                $group: {
                    _id: null,
                    sheetIds: { $addToSet: '$_id' },
                    sheets: { $push: '$$ROOT' },
                },
            },
            {
                $lookup: {
                    from: 'rows',
                    let: { sheetIds: '$sheetIds' },
                    pipeline: [
                        { $match: { $expr: { $in: ['$sheetId', '$$sheetIds'] } } },
                        { $group: { _id: '$sheetId', count: { $sum: 1 } } },
                    ],
                    as: 'counts',
                },
            },
            { $unwind: '$sheets' },
            {
                $addFields: {
                    'sheets.nRows': {
                        $ifNull: [
                            {
                                $let: {
                                    vars: { id: '$sheets._id' },
                                    in: {
                                        $first: {
                                            $map: {
                                                input: {
                                                    $filter: {
                                                        input: '$counts',
                                                        as: 'c',
                                                        cond: { $eq: ['$$c._id', '$$id'] },
                                                    },
                                                },
                                                as: 'c',
                                                in: '$$c.count',
                                            },
                                        },
                                    },
                                },
                            },
                            0,
                        ],
                    },
                },
            },
            { $replaceRoot: { newRoot: '$sheets' } },
        )
    }

    if (needWorkbook) {
        pipeline.push(
            {
                $lookup: {
                    from: 'workbooks',
                    localField: 'workbookId',
                    foreignField: '_id',
                    as: 'workbook',
                },
            },
            { $unwind: '$workbook' },
        )
    }

    const sheets = await collection.aggregate<Sheet>(pipeline, { allowDiskUse: true }).toArray()

    return sheets
}
