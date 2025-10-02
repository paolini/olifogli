import { getUsersCollection } from '@/app/lib/mongodb'
import { ApolloError, UserInputError, AuthenticationError, ForbiddenError } from 'apollo-server-errors'
import { ObjectId} from 'mongodb'
import { Context } from '../types'

import { User, Sheet, ScanJob, MutationUpdateSheetArgs } from '@/app/graphql/generated'
import { Permission } from '@/app/lib/models'

export function check_authenticated({user_id}: Context): ObjectId {
    if (!user_id) throw new AuthenticationError('autenticazione richiesta')
    return user_id
  }
  
export function check_admin(user: User) {
    if (!user?.isAdmin) throw new ForbiddenError('non autorizzato')
  }
  
export async function get_authenticated_user(context: Context) {
    const user_id = check_authenticated(context)
    const users = await getUsersCollection()
    const user = await users.findOne({ _id: user_id })
    if (!user) throw new ApolloError(`utente non trovato ${user_id}`)
    return user
  }

/**
 * Controlla se l'utente ha un determinato permesso su un foglio
 */
export function getUserPermissionOnSheet(user: User, sheet: Partial<Sheet>): 'owner' | 'admin' | 'editor' | null {
  if (!sheet) return null
  
  // L'amministratore globale ha sempre accesso completo
  if (user?.isAdmin) return 'owner'
  
  // Il proprietario ha sempre controllo completo
  if (sheet?.ownerId && sheet.ownerId.equals(user._id)) return 'owner'

  // Controlla i permessi strutturati
  if (sheet.permissions && Array.isArray(sheet.permissions)) {
    for (const permission of sheet.permissions) {
      let hasPermission = false
      
      if (permission.email && permission.email === user.email) {
        hasPermission = true
      } else if (permission.userId && permission.userId.equals(user._id)) {
        hasPermission = true
      }
      
      if (hasPermission) {
        return permission.role as 'admin' | 'editor'
      }
    }
  }

  return null
}
  
export function check_user_can_edit_sheet(user: User, sheet: Partial<Sheet>|null): asserts sheet is NonNullable<Sheet> {
  if (!sheet) throw new UserInputError('foglio inesistente')
  
  const permission = getUserPermissionOnSheet(user, sheet)
  if (!permission) {
    throw new ForbiddenError('non autorizzato')
  }
  
  // Tutti i ruoli ('owner', 'admin', 'editor') possono modificare i dati del foglio
}

export function check_user_can_update_sheet(user: User, sheet: Partial<Sheet>|null, args: MutationUpdateSheetArgs): asserts sheet is NonNullable<Sheet> {
  if (!sheet) throw new UserInputError('foglio inesistente')
  
  const permission = getUserPermissionOnSheet(user, sheet)
  if (!permission) {
    throw new ForbiddenError('non autorizzato')
  }

  const keys = Object.keys(args).filter(key => key !== '_id')
  if (keys.length === 0) return // non sta modificando niente

  // Owner e admin possono modificare tutto
  if (permission === 'owner' || permission === 'admin') {
    return
  }

  // Editor può modificare solo i dati, non i metadati del foglio
  if (permission === 'editor') {
    const restrictedFields = ['name', 'schema', 'permissions', 'permittedEmails', 'permittedIds']
    const hasRestrictedField = keys.some(key => restrictedFields.includes(key))
    
    if (hasRestrictedField) {
      throw new UserInputError('puoi modificare solo i dati del foglio, non i metadati')
    }
    return
  }

  throw new ForbiddenError('non autorizzato')
}

export function check_user_can_view_job(user: User, job: ScanJob|null): asserts job is NonNullable<ScanJob> {
    if (!job) throw new UserInputError('job inesistente')
    if (user?.isAdmin) return
    if (job.ownerId?.equals(user._id)) return
    throw new ForbiddenError('non autorizzato')
}

export function check_user_can_delete_job(user: User, job: ScanJob|null): asserts job is NonNullable<ScanJob> {
  return check_user_can_view_job(user, job)
}

