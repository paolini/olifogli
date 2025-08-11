import { WithId, ObjectId } from "mongodb"

import { Context } from '../types'
import { get_authenticated_user, check_user_can_edit_sheet } from './utils'
import { getSheetsCollection } from '@/app/lib/mongodb'
import { Sheet } from "@/app/lib/models"
import { QuerySheetsArgs } from '../generated'

export default async function sheets(_: unknown, { workbookId }: QuerySheetsArgs, context: Context): Promise<Sheet[]> {
    const user = await get_authenticated_user(context)
    if (!user) {
        throw new Error("Not authenticated")
    }

    if (!workbookId) {
        throw new Error("workbookId is required")
    }

    const collection = await getSheetsCollection()

    console.log(`workbookId: ${workbookId}`)

    const sheets = await collection.find({
        workbookId: workbookId,
//        ownerId: user._id
    }).toArray()

    return sheets
}
