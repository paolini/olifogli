import { getWorkbooksCollection } from '@/app/lib/mongodb'
import { Context } from '../types'
import { get_authenticated_user, check_admin } from './utils'
import { Workbook } from '@/app/lib/models'

export default async function addWorkbook(_: unknown, { name }: { name: string }, context: Context): Promise<Workbook> {
  const user = await get_authenticated_user(context)
  check_admin(user)
  const collection = await getWorkbooksCollection()
  const now = new Date()
  const result = await collection.insertOne({
    name,
    ownerId: user._id,
    createdOn: now,
    updatedOn: now,
    createdBy: user._id,
    updatedBy: user._id,
  })
  if (!result.acknowledged) throw new Error('Failed to create workbook')
  const workbook = await collection.findOne({ _id: result.insertedId })
  if (!workbook) throw new Error('Workbook not found after creation')
  return workbook
}
