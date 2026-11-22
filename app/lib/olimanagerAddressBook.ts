import type { NextRequest } from 'next/server'
import { queryOlimanager } from './olimanager'
import { venueSheetChoices } from './olimanagerVenueSheets'
import { districtName } from './olimanagerVenueNames'

// Address book of the people who run an edition: for every district (zone of
// the olympiad) its coordinator (CD, the primary zone admin), the other
// district admins (RD) and the school contacts (RI) of the valid subscriptions.

export type AddressBookContact = { name: string, surname: string, email: string | null }
export type AddressBookSchool = { code: string, name: string, city: string, province: string, contact: AddressBookContact | null }
export type AddressBookDistrict = { id: number | null, name: string, coordinators: AddressBookContact[], admins: AddressBookContact[], schools: AddressBookSchool[] }
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
}
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

export function buildAddressBook(zones: AddressBookZone[], subscriptions: AddressBookSubscription[]): AddressBook {
    const warnings: string[] = []
    const districts = new Map<number | null, AddressBookDistrict>()
    for (const zone of zones) {
        const admins = zone.admins.filter(a => a.user)
        const coordinators = admins.filter(a => a.isPrimary).map(a => contactOf(a.user!)).sort(byPerson)
        const others = admins.filter(a => !a.isPrimary).map(a => contactOf(a.user!)).sort(byPerson)
        if (!coordinators.length) warnings.push(`Distretto ${zone.name}: nessun coordinatore (CD).`)
        districts.set(zone.id, { id: zone.id, name: districtName(zone), coordinators, admins: others, schools: [] })
    }
    const unassigned: AddressBookDistrict = { id: null, name: UNASSIGNED_DISTRICT, coordinators: [], admins: [], schools: [] }
    for (const subscription of subscriptions) {
        if (!subscription.isValid) continue
        const school = subscription.school
        const code = school.externalId?.trim() || ''
        const label = code || school.name
        const contact = subscription.contact
        const entry: AddressBookSchool = {
            code, name: school.name, city: school.location?.city?.name || '', province: school.location?.city?.province?.id || '',
            contact: contact ? { name: contact.name.trim(), surname: contact.surname.trim(), email: normalizedEmail(contact.user?.email) } : null,
        }
        if (!entry.contact?.email) warnings.push(`${label}: referente senza account/email.`)
        const matches = zonesOfSchool(school, zones)
        if (matches.length !== 1) {
            warnings.push(matches.length
                ? `${label}: scuola riconducibile a più distretti (${matches.map(z => z.name).join(', ')}).`
                : `${label}: scuola (provincia ${entry.province || '?'}) non riconducibile ad alcun distretto.`)
        }
        const district = matches.length === 1 ? districts.get(matches[0].id)! : unassigned
        district.schools.push(entry)
    }
    const result = [...districts.values()].sort((a, b) => collator.compare(a.name, b.name))
    if (unassigned.schools.length) result.push(unassigned)
    for (const district of result) {
        district.schools.sort((a, b) => collator.compare(a.city, b.city) || collator.compare(a.name, b.name) || collator.compare(a.code, b.code))
    }
    return { districts: result, warnings }
}

export async function loadAddressBook(req: NextRequest, olympiadId: string, editionId: string): Promise<AddressBook> {
    const choices = await venueSheetChoices(req)
    if (!choices.find(o => o.id === olympiadId)?.editions.some(e => e.id === editionId)) {
        throw new Error('L’edizione deve appartenere all’olimpiade scelta.')
    }
    const { zones: { zones } } = await queryOlimanager<{ zones: { zones: AddressBookZone[] } }>(req, `query($olympiad: String!) {
        zones { zones(filters: {olympiad: {id: {exact: $olympiad}}}) {
            id name provinces { id } extraSchools { pk } admins { isPrimary user { name surname email } }
        } }
    }`, { olympiad: olympiadId })
    const subscriptions: AddressBookSubscription[] = []
    let cursor: string | null = null
    const cursors = new Set<string>()
    for (;;) {
        const result: { olympiads: { edition: { subscriptions: Page } | null } } = await queryOlimanager(req, `query($edition: String!, $after: String) {
            olympiads { edition(id: $edition) { subscriptions(first: 100, after: $after) {
                edges { node { isValid school { pk externalId name location { city { name province { id } } } } contact { name surname user { email } } } }
                pageInfo { hasNextPage endCursor }
            } } }
        }`, { edition: editionId, after: cursor })
        const page = result.olympiads.edition?.subscriptions
        if (!page) throw new Error('Edizione non disponibile su Olimanager.')
        subscriptions.push(...page.edges.map(edge => edge.node))
        if (!page.pageInfo.hasNextPage) break
        cursor = page.pageInfo.endCursor
        if (!cursor || cursors.has(cursor)) throw new Error('Paginazione delle scuole Olimanager non valida.')
        cursors.add(cursor)
    }
    return buildAddressBook(zones, subscriptions)
}
