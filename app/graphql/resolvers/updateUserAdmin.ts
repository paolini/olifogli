import { Context } from '../types'
import { get_authenticated_user, check_admin } from './utils'
import { getUsersCollection } from '@/app/lib/mongodb'
import { ObjectId } from 'mongodb'

export default async function updateUserRole(_: unknown, args: { userId: string, isAdmin: boolean, isSupervisor: boolean }, context: Context) {
    const user = await get_authenticated_user(context)
    check_admin(user)
    // Prevent admin from changing their own role
    if (user._id.toString() === args.userId) {
        throw new Error("Non puoi modificare te stesso.")
    }
    const collection = await getUsersCollection()
    await collection.updateOne(
        { _id: new ObjectId(args.userId) },
        { $set: { isAdmin: args.isAdmin, isSupervisor: args.isSupervisor } }
    )
    return await collection.findOne({ _id: new ObjectId(args.userId) })
}
