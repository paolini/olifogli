import { ObjectId } from 'bson'

import { Context } from '../types'
import { get_authenticated_user, check_user_can_edit_sheet } from './utils'
import { getSheetsCollection } from '@/app/lib/mongodb'

export default async function sheets (_: unknown, {}, context: Context) {
      const user = await get_authenticated_user(context)
      const collection = await getSheetsCollection()
      const match = user.is_admin ? {} : { owner_id: user._id }
      return await collection.find(match).toArray()
}