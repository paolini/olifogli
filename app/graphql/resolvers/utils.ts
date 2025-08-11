import { getUsersCollection } from '@/app/lib/mongodb'
import { ObjectId} from 'mongodb'
import { Context } from '../types'

import { User, Sheet, Data, ScanJob } from '@/app/lib/models'

export function check_authenticated({user_id}: Context): ObjectId {
    if (!user_id) throw Error('autenticazione richiesta')
    return user_id
  }
  
export function check_admin(user: User) {
    if (!user?.isAdmin) throw Error('non autorizzato')
  }
  
export async function get_authenticated_user(context: Context) {
    const user_id = check_authenticated(context)
    const users = await getUsersCollection()
    const user = await users.findOne({ _id: user_id })
    if (!user) throw Error(`utente non trovato ${user_id}`)
    return user
  }
  
export function check_user_can_edit_sheet(user: User, sheet: Sheet|null): asserts sheet is NonNullable<Sheet> {
  if (!sheet) throw Error('foglio inesistente')
  if (user?.isAdmin) return
  if (sheet.ownerId.equals(user._id)) return

  // Controlla se l'utente ha permesso esplicito
  if (sheet.permittedEmails 
    && Array.isArray(sheet.permittedEmails) &&
      sheet.permittedEmails.includes(user.email)) return

  if (sheet.permittedIds 
    && Array.isArray(sheet.permittedIds) &&
      sheet.permittedIds.some(id => id.equals(user._id))) return

  throw Error('non autorizzato')
}

export function check_user_can_view_job(user: User, job: ScanJob|null): asserts job is NonNullable<ScanJob> {
    if (!job) throw Error('job inesistente')
    if (user?.isAdmin) return
    if (job.ownerId?.equals(user._id)) return
    throw Error('non autorizzato')
}

export function check_user_can_delete_job(user: User, job: ScanJob|null): asserts job is NonNullable<ScanJob> {
  return check_user_can_view_job(user, job)
}

