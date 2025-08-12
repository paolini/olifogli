import { getSheetsCollection } from '@/app/lib/mongodb'
import { ObjectId } from 'mongodb'
import { Context } from '../types'

import { get_authenticated_user, check_admin } from './utils'
import { MutationDeleteSheetArgs } from '../generated'

export default async function deleteSheet (_: unknown, { _id }: MutationDeleteSheetArgs, context: Context) {
    const user = await get_authenticated_user(context)
    check_admin(user)
    const sheets = await getSheetsCollection();
    await sheets.deleteOne({_id})
    return true
}
