import { getSheetsCollection } from '@/app/lib/mongodb'
import { Context } from '../types'

import { get_authenticated_user, check_admin } from './utils'
import { MutationDeleteSheetsArgs } from '../generated'

export default async function deleteSheets (_: unknown, { ids }: MutationDeleteSheetsArgs, context: Context) {
    const user = await get_authenticated_user(context)
    check_admin(user)
    const sheets = await getSheetsCollection();
    const result = await sheets.deleteMany({_id: {$in: ids}})
    if (!result.acknowledged) throw new Error("Failed to delete sheets")
    return true
}
