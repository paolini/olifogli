import { getUsersCollection } from '@/app/lib/mongodb'
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
  
export async function get_authenticated_user(context: Context): Promise<User> {
    const user_id = check_authenticated(context)
    const users = await getUsersCollection()
    const user = await users.findOne({ _id: user_id })
    if (!user) throw Error(`utente non trovato ${user_id}`)
    return user
  }

export function check_user_can_edit_sheet(user: User, sheet: Sheet|null, userPermissions: SheetPermission[]): void {
  if (!sheet) throw Error('foglio inesistente')
  if (user?.is_admin) return
  if (sheet.owner_id.equals(user._id)) return
  // Controlla se l'utente ha permesso esplicito (già filtrato dal chiamante)
  if (userPermissions && Array.isArray(userPermissions) && userPermissions.length > 0) return
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
export function make_row_permission_checker(user: User, userPermissions: SheetPermission[]): (data: Data) => void {
  const perm: [string, string][] = userPermissions.filter(p => p.filter_field).map(p => [p.filter_field || '', p.filter_value || ''])

  // se non ci sono permessi restrittivi non devo forzare nessun campo
  if (perm.length === 0) return data => {}
  if (perm.length === 1) return data => {
    const p = perm[0]
    if (data[p[0]] !== p[1]) throw Error(`filtro per l'utente ${user._id} ${p[0]}=>${p[1]} non corrisponde a ${JSON.stringify(data)}`)
  }
  return data => {
      for (const p of perm) {
        // se c'è una coppia che corrisponde al filtro... ok!
        if (data[p[0]] === p[1]) return
      }
      // se non c'è nessuna corrispondenza, l'utente non può inserire questa riga
      // e non so come forzare i campi perché c'è più di un permesso valido
      throw Error(`filtro multiplo per l'utente ${user._id} non corrisponde a nessun dato in ${JSON.stringify(data )}`)
  }
}

// Applica il filtro permission a una singola riga Data
export function check_row_permission(user: User, data: Data, userPermissions: SheetPermission[]) {
    const filter = make_row_permission_checker(user, userPermissions)
    return filter(data);
}

export function check_rows_permission(user: User, rows: Data[], userPermissions: SheetPermission[]) {
    const check = make_row_permission_checker(user, userPermissions)
    for (const row of rows) {
        check(row);
    }
}