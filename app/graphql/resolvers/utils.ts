import { getUsersCollection } from '@/app/lib/mongodb'
import { ObjectId, WithId } from 'mongodb';
import { Context } from '../types';

import { User, Sheet } from '@/app/lib/models'

export function check_authenticated({user_id}: Context): ObjectId {
    if (!user_id) throw Error('autenticazione richiesta')
    return user_id
  }
  
export function check_admin(user: WithId<User>) {
    if (!user?.is_admin) throw Error('non autorizzato')
  }
  
export async function get_authenticated_user(context: Context) {
    const user_id = check_authenticated(context)
    const users = await getUsersCollection()
    const user = await users.findOne({ _id: user_id })
    if (!user) throw Error(`utente non trovato ${user_id}`)
    return user
  }
  
 export function check_user_can_edit_sheet(user: WithId<User>, sheet: Sheet|null): asserts sheet is NonNullable<Sheet> {
    if (!sheet) throw Error('foglio inesistente')
    if (user?.is_admin) return
    if (sheet.owner_id.equals(user._id)) return
    // Controlla se l'utente ha permesso esplicito
    if (sheet.permissions && Array.isArray(sheet.permissions)) {
        const hasPermission = sheet.permissions.some(p =>
            (p.user_id && p.user_id.equals(user._id)) ||
            (p.user_email && p.user_email === user.email)
        )
        if (hasPermission) return
    }
    throw Error('non autorizzato')
  }

