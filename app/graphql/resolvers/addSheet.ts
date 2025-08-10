import { getSheetsCollection } from '@/app/lib/mongodb'
import { Context } from '../types'
import { ObjectId } from "mongodb"

import { get_authenticated_user, check_admin } from './utils'
import { Sheet } from '@/app/lib/models'
import { MutationAddSheetArgs } from '../generated'

export default async function addSheet (_: unknown, args:MutationAddSheetArgs, context: Context): Promise<Sheet> {
    const user = await get_authenticated_user(context)
    check_admin(user)
    const collection = await getSheetsCollection()
    const name = args.name
    const schema = args.schema
    const workbook_id = args.workbookId
    const result = await collection.insertOne({ 
        name, 
        schema,
        workbook_id,
        owner_id: user._id, 
        permissions: [],
    })
    if (!result.acknowledged) {
        throw new Error("Failed to create sheet")
    }
    const sheet = await collection.findOne({ _id: result.insertedId })
    if (!sheet) {
        throw new Error("Sheet not found after creation")
    }
    return sheet
}
