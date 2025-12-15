import { getSheetsCollection } from '@/app/lib/mongodb'
import { Context } from '../types'
import { get_authenticated_user, check_user_is_sheet_admin } from './utils'
import { ObjectId } from 'mongodb'

export default async function closeSheet(_: unknown, args: { _id: ObjectId }, context: Context): Promise<boolean> {
  const user = await get_authenticated_user(context)
  const sheets = await getSheetsCollection()
  const sheet = await sheets.findOne({ _id: args._id })
  
  if (!sheet) throw new Error('Sheet not found')
  
  // Only sheet admins can close a sheet
  check_user_is_sheet_admin(user, sheet)

  // Verifica che i contatori siano presenti
  if (sheet.nRows === undefined || sheet.nRows === null) {
    throw new Error('Il foglio non ha il campo nRows. Esegui la migrazione del database.')
  }
  if (sheet.nValidRows === undefined || sheet.nValidRows === null) {
    throw new Error('Il foglio non ha il campo nValidRows. Esegui la migrazione del database.')
  }
  
  // Verifica che tutte le righe siano valide prima di chiudere
  const nRows = sheet.nRows
  const nValidRows = sheet.nValidRows
  
  if (!(user.isAdmin || nValidRows === nRows)) {
    const nInvalidRows = nRows - nValidRows
    throw new Error(
      `Impossibile chiudere il foglio: ci sono ${nInvalidRows} righe non valide. ` +
      `Tutte le ${nRows} righe devono essere valide prima di chiudere il foglio.`
    )
  }

  const res = await sheets.updateOne(
    { _id: args._id }, 
    { 
      $set: { 
        closed: true, 
        closedBy: user.email, 
        closedOn: new Date() 
      } 
    }
  )
  
  if (!res.acknowledged) throw new Error('close failed')
  return true
}
