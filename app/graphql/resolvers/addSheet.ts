import { getSheetsCollection } from '@/app/lib/mongodb'
import { Context } from '../types'
import { AvailableSchemas } from '@/app/lib/schema'

import { get_authenticated_user, check_admin } from './utils'

export default async function addSheet (_: unknown, { name, schema, params }: 
    { name: string, 
        schema: AvailableSchemas, 
        params: string }, 
    context: Context) {
    const user = await get_authenticated_user(context)
    check_admin(user)
    const collection = await getSheetsCollection()
    const result = await collection.insertOne({ 
        name, 
        schema, 
        params, 
        owner_id: user._id, 
        permissions: [],
    })
    return await collection.findOne({ _id: result.insertedId })
}
