import { ObjectId } from 'mongodb'
import { Context } from '../types'
import { get_authenticated_user, check_admin } from './utils'
import { getWorkbooksCollection, getSheetsCollection } from '@/app/lib/mongodb'

export default async function deleteWorkbook(_: unknown, { _id }: { _id: ObjectId }, context: Context): Promise<ObjectId> {
  const user = await get_authenticated_user(context)
  check_admin(user)

  const sheets = await (await getSheetsCollection()).countDocuments({ workbookId: _id })
  if (sheets > 0) throw new Error('Non puoi cancellare un blocco che contiene fogli')

  const collection = await getWorkbooksCollection()
  const res = await collection.deleteOne({ _id })
  if (res.deletedCount !== 1) throw new Error('Workbook non trovato')
  return _id
}
