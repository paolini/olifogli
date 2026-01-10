import { Context } from '../types'
import { get_authenticated_user } from './utils'
import { getSheetsCollection } from '@/app/lib/mongodb'
import { QuerySheetsArgs, Sheet } from '../generated'
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

export default async function sheets(_: unknown, { workbookId }: QuerySheetsArgs, context: Context, info: GraphQLResolveInfo): Promise<Sheet[]> {
    const user = await get_authenticated_user(context)

    if (!user) throw new Error("Not authenticated")

    const collection = await getSheetsCollection()

    const needWorkbook = selectionHasField(info.fieldNodes[0]?.selectionSet, 'workbook', info)

    const pipeline: object[] = []
    
    if (workbookId) {
        pipeline.push({ $match: { workbookId } })
    }

    if (!(user.isAdmin || user.isSupervisor)) {
        pipeline.push({ $match: { $or: [
            { ownerId: user._id },
            { 'permissions.email': user.email },
            { 'permissions.userId': user._id },
        ] } })
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
