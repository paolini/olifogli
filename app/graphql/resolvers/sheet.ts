import { ObjectId } from 'bson'

import { Context } from '../types'
import { get_authenticated_user, check_user_can_edit_sheet } from './utils'
import { getSheetsCollection } from '@/app/lib/mongodb'

export default async function sheet (_: unknown, { sheetId }: { sheetId: ObjectId }, context: Context) {
      const user = await get_authenticated_user(context)
      const collection = await getSheetsCollection()
      const sheet = await collection.findOne({_id: sheetId})
      check_user_can_edit_sheet(user, sheet)
      return sheet
    }
