import { getSheetsCollection } from '@/app/lib/mongodb'
import { ObjectId } from 'mongodb'
import { Context } from '../types'

import { get_authenticated_user, check_admin } from './utils'

export default async function deleteSheet (_: unknown, { _id }: { _id: ObjectId }, context: Context) {
    const user = await get_authenticated_user(context)
    check_admin(user)
    const sheets = await getSheetsCollection();
    await sheets.deleteOne({_id})
    return _id;
}
