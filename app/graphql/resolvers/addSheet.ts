import { getSheetsCollection } from '@/app/lib/mongodb'
import { Context } from '../types'

import { get_authenticated_user, check_admin } from './utils'
import { Sheet } from '@/app/lib/models'
import { MutationAddSheetArgs } from '../generated'

export default async function addSheet (_: unknown, args:MutationAddSheetArgs, context: Context): Promise<Sheet> {
    const user = await get_authenticated_user(context)
    check_admin(user)
    const collection = await getSheetsCollection()
    const name = args.name
    const schema = args.schema
    const workbookId = args.workbookId
    const result = await collection.insertOne({ 
        name, 
        schema,
        workbookId,
        ownerId: user._id, 
        permittedEmails: args.permittedEmails || [],
        permittedIds: args.permittedIds || [],
        commonData: {},
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
