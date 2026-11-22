import { loadAddressBook } from '@/app/lib/olimanagerAddressBook'
import { appLog } from '@/app/lib/appLog'
import { getSheetsCollection, getUsersCollection } from '@/app/lib/mongodb'
import { SHEET_CONTEST_KEY } from '@/app/lib/olimanagerVenueSheetConfig'
import { check_admin, get_authenticated_user } from './utils'
import type { Context } from '../types'

export async function olimanagerAddressBook(_: unknown, args: { olympiadId: string, editionId: string }, context: Context) {
    const user = await get_authenticated_user(context)
    check_admin(user)
    if (!context.req) throw new Error('Sessione HTTP richiesta.')
    const sheets = await getSheetsCollection()
    const addressBook = await loadAddressBook(context.req, args.olympiadId, args.editionId, contestIds => sheets.find(
        { [`commonData.${SHEET_CONTEST_KEY}`]: { $in: contestIds } },
        { projection: { name: 1, schema: 1, 'commonData.Codice_meccanografico': 1, 'commonData.Distretto': 1, [`commonData.${SHEET_CONTEST_KEY}`]: 1, nRows: 1, nValidRows: 1, closed: 1, locked: 1 } },
    ).toArray())
    // Remember the edition only once Olimanager has accepted it.
    const users = await getUsersCollection()
    await users.updateOne({ _id: user._id }, { $set: { addressBookSelection: { olympiadId: args.olympiadId, editionId: args.editionId } } })
    appLog('olimanager.address_book_viewed', { olympiadId: args.olympiadId, editionId: args.editionId }, { userId: user._id })
    return addressBook
}

export async function olimanagerAddressBookSelection(_: unknown, __: unknown, context: Context) {
    const user = await get_authenticated_user(context)
    check_admin(user)
    return user.addressBookSelection || null
}
