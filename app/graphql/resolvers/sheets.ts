import { Context } from '../types'
import { get_authenticated_user } from './utils'
import { getSheetsCollection } from '@/app/lib/mongodb'
import { QuerySheetsArgs, Sheet } from '../generated'

export default async function sheets(_: unknown, { workbookId }: QuerySheetsArgs, context: Context): Promise<Sheet[]> {
    const user = await get_authenticated_user(context)

    if (!user) throw new Error("Not authenticated")

    const collection = await getSheetsCollection()

    const sheets = await collection.aggregate<Sheet>([
        { $match: { workbookId: workbookId } },
        {
            $lookup: {
                from: "workbooks",
                localField: "workbookId",
                foreignField: "_id",
                as: "workbook"
            }
        },
        { $unwind: "$workbook" },
        {
            $lookup: {
                from: "rows",
                localField: "_id",
                foreignField: "sheetId",
                as: "rows"
            }
        },
        {
            $addFields: {
                nRows: { $size: "$rows" }
            }
        },
        {
            $project: {
                rows: 0
            }
        }
    ]).toArray()

    return sheets
}
