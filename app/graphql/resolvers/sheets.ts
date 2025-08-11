import { Context } from '../types'
import { get_authenticated_user } from './utils'
import { getSheetsCollection } from '@/app/lib/mongodb'
import { QuerySheetsArgs, Sheet } from '../generated'

export default async function sheets(_: unknown, { workbookId }: QuerySheetsArgs, context: Context): Promise<Sheet[]> {
    const user = await get_authenticated_user(context)

    if (!user) throw new Error("Not authenticated")

    const collection = await getSheetsCollection()

    const sheets = await collection.find({
        workbookId: workbookId,
//        ownerId: user._id
    }).toArray()

    return sheets
}
