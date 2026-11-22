import { loadAddressBook } from '@/app/lib/olimanagerAddressBook'
import { venueSheetChoices } from '@/app/lib/olimanagerVenueSheets'
import { appLog } from '@/app/lib/appLog'
import { getSheetsCollection } from '@/app/lib/mongodb'
import { SHEET_CONTEST_KEY } from '@/app/lib/olimanagerVenueSheetConfig'
import { get_authenticated_user } from './utils'
import type { Context } from '../types'

// Olimanager pages (olympiads, editions, address book) are open to every user:
// Olimanager returns only what the user may see, and the Olifogli sheets are
// limited to those the user has a permission on.

export async function olimanagerOlympiads(_: unknown, __: unknown, context: Context) {
    await get_authenticated_user(context)
    if (!context.req) throw new Error('Sessione HTTP richiesta.')
    return venueSheetChoices(context.req)
}

export async function olimanagerAddressBook(_: unknown, args: { olympiadId: string, editionId: string }, context: Context) {
    const user = await get_authenticated_user(context)
    if (!context.req) throw new Error('Sessione HTTP richiesta.')
    const sheets = await getSheetsCollection()
    const seesAllSheets = !!(user.isAdmin || user.isSupervisor)
    const findSheets = (contestIds: string[]) => sheets.find(
        { [`commonData.${SHEET_CONTEST_KEY}`]: { $in: contestIds }, ...(seesAllSheets ? {} : { 'permissions.email': user.email }) },
        { projection: { name: 1, schema: 1, 'commonData.Codice_meccanografico': 1, 'commonData.Distretto': 1, [`commonData.${SHEET_CONTEST_KEY}`]: 1, nRows: 1, nValidRows: 1, closed: 1, locked: 1 } },
    ).toArray()
    const addressBook = await loadAddressBook(context.req, args.olympiadId, args.editionId, { findSheets, hideEmpty: !user.isAdmin })
    appLog('olimanager.address_book_viewed', { olympiadId: args.olympiadId, editionId: args.editionId }, { userId: user._id })
    return addressBook
}
