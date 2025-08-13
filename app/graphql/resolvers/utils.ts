import { getUsersCollection } from '@/app/lib/mongodb'
import { ApolloError, UserInputError, AuthenticationError, ForbiddenError } from 'apollo-server-errors'
import { ObjectId} from 'mongodb'
import { Context } from '../types'

import { User, Sheet, ScanJob, MutationUpdateSheetArgs } from '@/app/graphql/generated'

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
  
export function check_user_can_edit_sheet(user: User, sheet: Partial<Sheet>|null): asserts sheet is NonNullable<Sheet> {
  if (!sheet) throw new UserInputError('foglio inesistente')
  if (user?.isAdmin) return
  if (sheet?.ownerId && sheet.ownerId.equals(user._id)) return

  // Controlla se l'utente ha permesso esplicito
  if (sheet.permittedEmails 
    && Array.isArray(sheet.permittedEmails) &&
      sheet.permittedEmails.includes(user.email)) return

  if (sheet.permittedIds 
    && Array.isArray(sheet.permittedIds) &&
      sheet.permittedIds.some(id => id.equals(user._id))) return

  throw new ForbiddenError('non autorizzato')
}

export function check_user_can_update_sheet(user: User, sheet: Partial<Sheet>|null, args: MutationUpdateSheetArgs): asserts sheet is NonNullable<Sheet> {
  if (!sheet) throw new UserInputError('foglio inesistente')
  if (user?.isAdmin) return
  if (sheet?.ownerId && sheet.ownerId.equals(user._id)) return

  // Controlla se l'utente ha permesso esplicito
  if (sheet.permittedEmails 
    && Array.isArray(sheet.permittedEmails) &&
      sheet.permittedEmails.includes(user.email)) {
        const keys = Object.keys(args)
        if (!keys.includes('_id')) throw new Error('_id atteso')
        if (keys.length <= 1) return // non sta modificando niente?!? ok...
        if (keys.length > 2 || !keys.includes('permittedEmails')) {
          throw new UserInputError('puoi modificare solo gli email autorizzati')
        }
        const emails_in = sheet.permittedEmails
        const emails_out = args.permittedEmails || []
        for (let i=0 ; emails_in[i] === emails_out[i] && i < emails_in.length; ++i) {
          // controlla che l'utente mantenga tutti gli email
          // fino al proprio: può modificare quelli successivi...
          if (emails_out[i] === user.email) return
        }
        throw new UserInputError('non puoi modificare il tuo email o quelli precedenti negli email autorizzati')
  }

  if (sheet.permittedIds 
    && Array.isArray(sheet.permittedIds) &&
      sheet.permittedIds.some(id => id.equals(user._id))) {
        const keys = Object.keys(args)
        if (keys.length === 0) return // non sta modificando niente?!? ok...
        if (keys.length>1 || keys[0]!== 'permittedEmails') {
          throw new UserInputError('puoi modificare solo gli email autorizzati')
        }
        // l'utente con permesso sullo user._id può modificare 
        // tutti gli email autorizzati 
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

