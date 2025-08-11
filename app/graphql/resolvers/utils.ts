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
  if (sheet.permissions && Array.isArray(sheet.permissions)) {
      const hasPermission = sheet.permissions.some(p =>
          (p.userId && p.userId.equals(user._id)) ||
          (p.userEmail && p.userEmail === user.email)
      )
      if (hasPermission) return
  }
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

// Funzione di utilità per generare un filtro sulle righe in base a tutti i filter_field attivi per l'utente
export function make_row_permission_filter(user: User, sheet: Sheet): (data: Data) => Data {
    if (user.isAdmin) return data => data;
    if (!sheet.permissions || !Array.isArray(sheet.permissions)) return data => data;
    // Trova tutti i permessi attivi per l'utente
    const perms = sheet.permissions.filter(p =>
        (p.userId && p.userId.equals(user._id)) ||
        (p.userEmail && p.userEmail === user.email)
    ).filter(p => p.filterField && p.filterValue !== undefined)
    // Crea una funzione che forza tutti i campi filter_field
    return (data: Data) => {
        const newData = { ...data }
        for (const perm of perms) {
          newData[perm.filterField as string] = String(perm.filterValue)
        }
        return newData;
    };
}

// Applica il filtro permission a una singola riga Data
export function apply_row_permission_filter(user: User, sheet: Sheet, data: Data): Data {
    return make_row_permission_filter(user, sheet)(data);
}

