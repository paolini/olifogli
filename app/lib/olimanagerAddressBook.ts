import type { NextRequest } from 'next/server'
import type { ObjectId } from 'bson'
import { queryOlimanager } from './olimanager'
import { errorKind, errorStatus, serverLog } from './logging'
import { venueSheetChoices } from './olimanagerVenueSheets'
import { districtName } from './olimanagerVenueNames'
import { SHEET_CONTEST_KEY, VENUE_SHEET_SCHEMAS, isVenueSheetSchema } from './olimanagerVenueSheetConfig'

// Address book of the people who run an edition: for every district (zone of
// the olympiad) its coordinator (CD, the primary zone admin), the other
// district admins (RD) and the school contacts (RI) of the valid subscriptions.
// Available to every user: Olimanager returns empty lists for data the user
// may not read (zone admins outside their zones, edition subscriptions unless
// edition admin), so each user sees only what Olimanager shows them.
// Olifogli sheets of the edition's contests are attached to their school
// (SCHOOL contests, by Codice_meccanografico) or district (ZONE contests, by
// Distretto). Without that key the sheet name is used: sheets of the old
// creation flow (e.g. `distrettuale` from Distrettuale.row_to_sheet) carry the
// district only in their name, and Olimanager-created sheets are named the same.

export type AddressBookContact = { name: string, surname: string, email: string | null }
export type AddressBookSheet = { _id: ObjectId, name: string, label: string, nRows: number, nValidRows: number, closed: boolean, locked: boolean }
export type AddressBookSchool = { code: string, name: string, city: string, province: string, contact: AddressBookContact | null, sheets: AddressBookSheet[] }
export type AddressBookDistrict = { id: number | null, name: string, coordinators: AddressBookContact[], admins: AddressBookContact[], schools: AddressBookSchool[], sheets: AddressBookSheet[], warnings: string[] }
export type AddressBook = { districts: AddressBookDistrict[], warnings: string[] }

type User = { name: string, surname: string, email: string }
export type AddressBookZone = {
    id: number, name: string, provinces: { id: string }[], extraSchools: { pk: number }[],
    admins: { isPrimary: boolean, user: User | null }[],
}
export type AddressBookSubscription = {
    isValid: boolean
    school: { pk: number, externalId: string | null, name: string, location: { city: { name: string, province: { id: string } } } | null }
    contact: { name: string, surname: string, user: { email: string } | null } | null
    edition?: { id: string }
}
export type AddressBookContest = { id: number, name: string, scope: string }
export type AddressBookSheetDocument = {
    _id: ObjectId, name: string, schema: string, commonData: Record<string, string>,
    nRows?: number, nValidRows?: number, closed?: boolean, locked?: boolean,
}
export type FindSheets = (contestIds: string[]) => Promise<AddressBookSheetDocument[]>
type Page = { edges: { node: AddressBookSubscription }[], pageInfo: { hasNextPage: boolean, endCursor: string | null } }

export const UNASSIGNED_DISTRICT = 'Senza distretto'

const collator = new Intl.Collator('it', { sensitivity: 'base' })
const byPerson = (a: AddressBookContact, b: AddressBookContact) =>
    collator.compare(a.surname, b.surname) || collator.compare(a.name, b.name) || collator.compare(a.email || '', b.email || '')
const normalizedEmail = (email: string | null | undefined) => email?.trim().toLowerCase() || null

function contactOf(user: User): AddressBookContact {
    return { name: user.name.trim(), surname: user.surname.trim(), email: normalizedEmail(user.email) }
}

// Extra schools override province membership, as in Olimanager's Zone.schools.
export function zonesOfSchool<Z extends AddressBookZone>(school: AddressBookSubscription['school'], zones: Z[]) {
    const extra = zones.filter(zone => zone.extraSchools.some(s => s.pk === school.pk))
    return extra.length ? extra : zones.filter(zone => zone.provinces.some(p => p.id === school.location?.city?.province?.id))
}

// Warnings about a school go to the district it is listed under.
export function buildAddressBook(zones: AddressBookZone[], subscriptions: AddressBookSubscription[]): AddressBook {
    const districts = new Map<number | null, AddressBookDistrict>()
    for (const zone of zones) {
        const admins = zone.admins.filter(a => a.user)
        const coordinators = admins.filter(a => a.isPrimary).map(a => contactOf(a.user!)).sort(byPerson)
        const others = admins.filter(a => !a.isPrimary).map(a => contactOf(a.user!)).sort(byPerson)
        districts.set(zone.id, { id: zone.id, name: districtName(zone), coordinators, admins: others, schools: [], sheets: [], warnings: [] })
    }
    const unassigned: AddressBookDistrict = { id: null, name: UNASSIGNED_DISTRICT, coordinators: [], admins: [], schools: [], sheets: [], warnings: [] }
    for (const subscription of subscriptions) {
        if (!subscription.isValid) continue
        const school = subscription.school
        const code = school.externalId?.trim() || ''
        const label = code || school.name
        const contact = subscription.contact
        const entry: AddressBookSchool = {
            code, name: school.name, city: school.location?.city?.name || '', province: school.location?.city?.province?.id || '',
            contact: contact ? { name: contact.name.trim(), surname: contact.surname.trim(), email: normalizedEmail(contact.user?.email) } : null,
            sheets: [],
        }
        const matches = zonesOfSchool(school, zones)
        const district = matches.length === 1 ? districts.get(matches[0].id)! : unassigned
        if (!entry.contact?.email) district.warnings.push(`${label}: referente senza account/email.`)
        if (matches.length !== 1) {
            district.warnings.push(matches.length
                ? `${label}: scuola riconducibile a più distretti (${matches.map(z => z.name).join(', ')}).`
                : `${label}: scuola (provincia ${entry.province || '?'}) non riconducibile ad alcun distretto.`)
        }
        district.schools.push(entry)
    }
    const result = [...districts.values()].sort((a, b) => collator.compare(a.name, b.name))
    if (unassigned.schools.length) result.push(unassigned)
    for (const district of result) {
        district.schools.sort((a, b) => collator.compare(a.city, b.city) || collator.compare(a.name, b.name) || collator.compare(a.code, b.code))
    }
    return { districts: result, warnings: [] }
}

// Final pass: with hideEmpty (users who are not Olifogli admins) drops the
// districts where the user sees nothing; warns about districts without CD
// only among those shown.
export function finishAddressBook(book: AddressBook, hideEmpty: boolean): AddressBook {
    const districts = hideEmpty
        ? book.districts.filter(d => d.coordinators.length || d.admins.length || d.schools.length || d.sheets.length)
        : book.districts
    for (const district of districts) {
        if (district.id !== null && !district.coordinators.length) district.warnings.unshift('Nessun coordinatore (CD).')
    }
    return { districts, warnings: book.warnings }
}

type FetchPage = (after: string | null) => Promise<Page | null | undefined>

// Failures of our own checks, with a reason that may be logged.
type AddressBookFailure = 'edition_not_found' | 'missing_page' | 'invalid_pagination'
class AddressBookError extends Error {
    constructor(message: string, readonly reason: AddressBookFailure) { super(message) }
}

// Step of loadAddressBook in progress, logged when it fails.
type Progress = { stage: 'editions' | 'zones' | 'edition_subscriptions' | 'zone_subscriptions' | 'build' | 'sheets' }

async function allPages(fetchPage: FetchPage): Promise<AddressBookSubscription[]> {
    const subscriptions: AddressBookSubscription[] = []
    let cursor: string | null = null
    const cursors = new Set<string>()
    for (;;) {
        const page = await fetchPage(cursor)
        if (!page) throw new AddressBookError('Edizione non disponibile su Olimanager.', 'missing_page')
        subscriptions.push(...page.edges.map(edge => edge.node))
        if (!page.pageInfo.hasNextPage) return subscriptions
        cursor = page.pageInfo.endCursor
        if (!cursor || cursors.has(cursor)) throw new AddressBookError('Paginazione delle scuole Olimanager non valida.', 'invalid_pagination')
        cursors.add(cursor)
    }
}

const SUBSCRIPTION_FIELDS = 'isValid school { pk externalId name location { city { name province { id } } } } contact { name surname user { email } }'
export const CURRENT_EDITION_ONLY = 'Olimanager mostra i referenti di istituto (RI) dei tuoi distretti solo per l’edizione corrente.'

// Subscriptions of the edition. Olimanager lists them only to edition admins;
// for the others it returns none, and district admins can read instead the
// subscriptions of their zones, which Olimanager limits to the latest edition.
async function loadSubscriptions(req: NextRequest, editionId: string, zones: AddressBookZone[], warnings: string[], progress: Progress) {
    progress.stage = 'edition_subscriptions'
    const subscriptions = await allPages(async after => (await queryOlimanager<{ olympiads: { edition: { subscriptions: Page } | null } }>(req, `query($edition: String!, $after: String) {
        olympiads { edition(id: $edition) { subscriptions(first: 100, after: $after) {
            edges { node { ${SUBSCRIPTION_FIELDS} } }
            pageInfo { hasNextPage endCursor }
        } } }
    }`, { edition: editionId, after })).olympiads.edition?.subscriptions)
    if (subscriptions.length) return subscriptions
    progress.stage = 'zone_subscriptions'
    const seen = new Set<number>()
    let otherEdition = false
    // Zone admins are readable exactly where the zone subscriptions are.
    for (const zone of zones.filter(z => z.admins.length)) {
        const zoneSubscriptions = await allPages(async after => (await queryOlimanager<{ zones: { zones: { subscriptions: Page }[] } }>(req, `query($zone: Int!, $after: String) {
            zones { zones(filters: {id: $zone}) { subscriptions(first: 100, after: $after) {
                edges { node { ${SUBSCRIPTION_FIELDS} edition { id } } }
                pageInfo { hasNextPage endCursor }
            } } }
        }`, { zone: zone.id, after })).zones.zones[0]?.subscriptions)
        for (const subscription of zoneSubscriptions) {
            if (subscription.edition?.id !== editionId) { otherEdition = true; continue }
            if (seen.has(subscription.school.pk)) continue
            seen.add(subscription.school.pk)
            subscriptions.push(subscription)
        }
    }
    if (otherEdition && !subscriptions.length) warnings.push(CURRENT_EDITION_ONLY)
    return subscriptions
}

// Attaches each sheet of an edition contest to its school or district; sheets
// of schools or districts not in the address book are left out.
export function attachSheets(book: AddressBook, contests: AddressBookContest[], sheets: AddressBookSheetDocument[]) {
    const contestById = new Map(contests.map(c => [String(c.id), c]))
    const schools = new Map(book.districts.flatMap(d => d.schools.filter(s => s.code).map(s => [s.code, s] as const)))
    const districts = new Map(book.districts.filter(d => d.id !== null).map(d => [d.name, d]))
    for (const sheet of sheets) {
        const contest = contestById.get(sheet.commonData?.[SHEET_CONTEST_KEY]?.trim() || '')
        if (!contest) continue
        const entry: AddressBookSheet = {
            _id: sheet._id, name: sheet.name,
            label: isVenueSheetSchema(sheet.schema) ? VENUE_SHEET_SCHEMAS[sheet.schema].label : contest.name,
            nRows: sheet.nRows || 0, nValidRows: sheet.nValidRows || 0, closed: !!sheet.closed, locked: !!sheet.locked,
        }
        const key = (field: string) => sheet.commonData?.[field]?.trim() || sheet.name.trim()
        const owner = contest.scope === 'SCHOOL' ? schools.get(key('Codice_meccanografico'))
            : contest.scope === 'ZONE' ? districts.get(key('Distretto')) : undefined
        owner?.sheets.push(entry)
    }
    for (const owner of [...book.districts, ...book.districts.flatMap(d => d.schools)]) {
        owner.sheets.sort((a, b) => collator.compare(a.label, b.label) || collator.compare(a.name, b.name))
    }
    return book
}

// Failures are logged with the step and the error kind only: the message may
// quote Olimanager data.
export async function loadAddressBook(req: NextRequest, olympiadId: string, editionId: string, options: { findSheets: FindSheets, hideEmpty: boolean }): Promise<AddressBook> {
    const progress: Progress = { stage: 'editions' }
    try {
        return await loadAddressBookSteps(req, olympiadId, editionId, options, progress)
    } catch (error) {
        serverLog('error', 'olimanager.address_book_failed', {
            stage: progress.stage, error: errorKind(error), status: errorStatus(error),
            reason: error instanceof AddressBookError ? error.reason : null,
        })
        throw error
    }
}

async function loadAddressBookSteps(req: NextRequest, olympiadId: string, editionId: string, { findSheets, hideEmpty }: { findSheets: FindSheets, hideEmpty: boolean }, progress: Progress): Promise<AddressBook> {
    const choices = await venueSheetChoices(req)
    const edition = choices.find(o => o.id === olympiadId)?.editions.find(e => e.id === editionId)
    if (!edition) throw new AddressBookError('L’edizione deve appartenere all’olimpiade scelta.', 'edition_not_found')
    progress.stage = 'zones'
    const { zones: { zones } } = await queryOlimanager<{ zones: { zones: AddressBookZone[] } }>(req, `query($olympiad: String!) {
        zones { zones(filters: {olympiad: {id: {exact: $olympiad}}}) {
            id name provinces { id } extraSchools { pk } admins { isPrimary user { name surname email } }
        } }
    }`, { olympiad: olympiadId })
    const loadWarnings: string[] = []
    const subscriptions = await loadSubscriptions(req, editionId, zones, loadWarnings, progress)
    progress.stage = 'build'
    const book = buildAddressBook(zones, subscriptions)
    progress.stage = 'sheets'
    const sheets = edition.contests.length ? await findSheets(edition.contests.map(c => String(c.id))) : []
    attachSheets(book, edition.contests, sheets)
    book.warnings.unshift(...loadWarnings)
    return finishAddressBook(book, hideEmpty)
}
