import { ObjectId } from 'bson'

import { Context } from '../types'
import { get_authenticated_user, check_user_can_edit_sheet } from './utils'
import { getSheetsCollection } from '@/app/lib/mongodb'

export default async function sheets (_: unknown, {}, context: Context) {
      const user = await get_authenticated_user(context)
      const collection = await getSheetsCollection()
      let match = {}
      if (!user.is_admin) {
        // L'utente non admin può vedere i fogli di cui è owner o dove ha permesso
        match = {
          $or: [
            { owner_id: user._id },
            { permissions: { $elemMatch: { $or: [ { user_id: user._id }, { user_email: user.email } ] } } }
          ]
        }
      }
      return await collection.find(match).toArray()
}