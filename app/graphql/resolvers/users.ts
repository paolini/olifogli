import { Context } from '../types'
import { get_authenticated_user, check_admin } from './utils'
import { getUsersCollection } from '@/app/lib/mongodb'

export default async function users (_: unknown, __: unknown, context: Context) {
      const user = await get_authenticated_user(context)
      check_admin(user)
      const collection = await getUsersCollection()
      return await collection.find({}).toArray()
}