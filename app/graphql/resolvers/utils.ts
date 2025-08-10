import { getUsersCollection, getSheetPermissions } from '@/app/lib/mongodb'
import { ObjectId} from 'mongodb'
import { Context } from '../types'

import { User, Sheet, Data, ScanJob, SheetPermission } from '@/app/lib/models'

export function check_authenticated({user_id}: Context): ObjectId {
    if (!user_id) throw Error('autenticazione richiesta')
    return user_id
  }
  
export function check_admin(user: User) {
    if (!user?.is_admin) throw Error('non autorizzato')
  }
  
export async function get_authenticated_user(context: Context) {
    const user_id = check_authenticated(context)
    const users = await getUsersCollection()
    const user = await users.findOne({ _id: user_id })
    if (!user) throw Error(`utente non trovato ${user_id}`)
    return user
  }
  
export async function check_user_can_edit_sheet(user: User, sheet: Sheet|null): Promise<void> {
  if (!sheet) throw Error('foglio inesistente')
  if (user?.is_admin) return
  if (sheet.owner_id.equals(user._id)) return
  // Controlla se l'utente ha permesso esplicito
  const permissions = await getSheetPermissions(sheet._id)
  if (permissions && Array.isArray(permissions)) {
      const hasPermission = permissions.some(p =>
          (p.user_id && p.user_id.equals(user._id)) ||
          (p.user_email && p.user_email === user.email)
      )
      if (hasPermission) return
  }
  throw Error('non autorizzato')
}

export function check_user_can_view_job(user: User, job: ScanJob|null): asserts job is NonNullable<ScanJob> {
    if (!job) throw Error('job inesistente')
    if (user?.is_admin) return
    if (job.ownerId?.equals(user._id)) return
    throw Error('non autorizzato')
}

export function check_user_can_delete_job(user: User, job: ScanJob|null): asserts job is NonNullable<ScanJob> {
  return check_user_can_view_job(user, job)
}

// Funzione di utilità per generare un filtro sulle righe in base a tutti i filter_field attivi per l'utente
export async function make_row_permission_filter(user: User, sheet: Sheet): Promise<(data: Data) => Data> {
    if (user.is_admin) return data => data;
    const permissions = await getSheetPermissions(sheet._id)
    if (!permissions || !Array.isArray(permissions)) return data => data;
    // Trova tutti i permessi attivi per l'utente
    const perms = permissions.filter(p =>
        (p.user_id && p.user_id.equals(user._id)) ||
        (p.user_email && p.user_email === user.email)
    ).filter(p => p.filter_field && p.filter_value !== undefined)
    // Crea una funzione che forza tutti i campi filter_field
    return (data: Data) => {
        const newData = { ...data }
        for (const perm of perms) {
          newData[perm.filter_field as string] = String(perm.filter_value)
        }
        return newData;
    };
}

// Applica il filtro permission a una singola riga Data
export async function apply_row_permission_filter(user: User, sheet: Sheet, data: Data): Promise<Data> {
    const filter = await make_row_permission_filter(user, sheet)
    return filter(data);
}

