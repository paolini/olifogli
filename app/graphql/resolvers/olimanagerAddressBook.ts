import { loadAddressBook } from '@/app/lib/olimanagerAddressBook'
import { appLog } from '@/app/lib/appLog'
import { check_admin, get_authenticated_user } from './utils'
import type { Context } from '../types'

export async function olimanagerAddressBook(_: unknown, args: { olympiadId: string, editionId: string }, context: Context) {
    const user = await get_authenticated_user(context)
    check_admin(user)
    if (!context.req) throw new Error('Sessione HTTP richiesta.')
    const addressBook = await loadAddressBook(context.req, args.olympiadId, args.editionId)
    appLog('olimanager.address_book_viewed', { olympiadId: args.olympiadId, editionId: args.editionId }, { userId: user._id })
    return addressBook
}
