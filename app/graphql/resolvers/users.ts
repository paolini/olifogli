import { Context } from '../types'
import { get_authenticated_user, check_admin, check_admin_or_supervisor } from './utils'
import { getUsersCollection } from '@/app/lib/mongodb'

export default async function users (_: unknown, __: unknown, context: Context) {
      const user = await get_authenticated_user(context)
      check_admin_or_supervisor(user)
      const collection = await getUsersCollection()
      return await collection.find({}).toArray()
}