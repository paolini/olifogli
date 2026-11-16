import type { NextRequest } from 'next/server'
import { queryOlimanager } from './olimanager'
import type { Data, Permission } from './models'
import { SHEET_CONTEST_KEY, isVenueSheetSchema, type VenueSheetSchema } from './olimanagerVenueSheetConfig'

export type VenueSheet = {
    name: string
    schema: VenueSheetSchema
    commonData: Data
    permissions: Permission[]
}
export type ContestChoice = { id: number, name: string, scope: string }
export type OlympiadChoice = { id: string, name: string, editions: { id: string, name: string, year?: number | null, contests: ContestChoice[] }[] }
type Subscription = {
    isValid: boolean
    school: { pk: number, externalId: string, name: string, location: { city: { name: string, province: { id: string } } } }
    contact: { user: { email: string } | null }
}
type Zone = { id: number, name: string, provinces: { id: string }[], extraSchools: { pk: number }[], admins: { user: { email: string } }[] }
type Page = { edges: { node: Subscription }[], pageInfo: { hasNextPage: boolean, endCursor: string | null } }

export async function venueSheetChoices(req: NextRequest): Promise<OlympiadChoice[]> {
    const result = await queryOlimanager<{ olympiads: { olympiads: OlympiadChoice[] } }>(req, `query {
        olympiads { olympiads { id name editions { id name year contests { id name scope } } } }
    }`)
    return result.olympiads.olympiads
}

export function sheetsFromSubscriptions(subscriptions: Subscription[], zones: Zone[], schema: VenueSheetSchema, contestId: number) {
    const sheets: VenueSheet[] = []
    const warnings: string[] = []
    const seen = new Set<string>()
    for (const subscription of subscriptions) {
        if (!subscription.isValid) continue
        const school = subscription.school
        const code = school.externalId?.trim()
        if (!code) { warnings.push(`Scuola ${school.name}: codice meccanografico assente.`); continue }
        if (seen.has(code)) throw new Error(`Codice meccanografico duplicato: ${code}.`)
        seen.add(code)
        const email = subscription.contact.user?.email?.trim().toLowerCase()
        if (!email) warnings.push(`${code}: referente senza account/email; nessun responsabile assegnato.`)
        // Extra schools override province membership, as in Olimanager's Zone.schools.
        const extra = zones.filter(zone => zone.extraSchools.some(s => s.pk === school.pk))
        const matches = extra.length ? extra : zones.filter(zone => zone.provinces.some(p => p.id === school.location?.city?.province?.id))
        if (matches.length !== 1) {
            const province = school.location?.city?.province?.id || '?'
            warnings.push(matches.length
                ? `${code}: scuola riconducibile a più distretti (${matches.map(z => z.name).join(', ')}).`
                : `${code}: scuola (provincia ${province}) non riconducibile ad alcun distretto.`)
        }
        const zone = matches.length === 1 ? matches[0] : undefined
        const emails = [...new Set((zone?.admins || []).map(a => a.user.email.trim().toLowerCase()).filter(Boolean))]
        if (zone && !emails.length) warnings.push(`${code}: distretto ${zone.name} senza responsabili di distretto (RD).`)
        const permissions: Permission[] = email ? [{ email, role: 'manager' }] : []
        permissions.push(...emails.filter(e => e !== email).map(email => ({ email, role: 'viewer' as const })))
        sheets.push({
            name: code, schema, permissions,
            commonData: {
                Codice_meccanografico: code, Nome_scuola: school.name, 'Città_scuola': school.location?.city?.name || '',
                Distretto: zone?.name.replace(/^Distretto di /, '') || '', [SHEET_CONTEST_KEY]: String(contestId),
            },
        })
    }
    return { sheets, warnings }
}

export async function loadVenueSheets(req: NextRequest, olympiadId: string, editionId: string, schema: string, contestId: number) {
    if (!isVenueSheetSchema(schema)) throw new Error('Schema non gestito dalla creazione da Olimanager.')
    if (!Number.isInteger(contestId) || contestId <= 0 || contestId > 2147483647) throw new Error('Seleziona un contest.')
    const choices = await venueSheetChoices(req)
    const edition = choices.find(o => o.id === olympiadId)?.editions.find(e => e.id === editionId)
    if (!edition?.contests.some(c => c.id === contestId && c.scope === 'SCHOOL')) {
        throw new Error('Il contest deve essere scolastico e appartenere all’edizione dell’olimpiade scelta.')
    }
    const { zones: { zones } } = await queryOlimanager<{ zones: { zones: Zone[] } }>(req, `query($olympiad: String!) {
        zones { zones(filters: {olympiad: {id: {exact: $olympiad}}}) {
            id name provinces { id } extraSchools { pk } admins { user { email } }
        } }
    }`, { olympiad: olympiadId })
    const subscriptions: Subscription[] = []
    let cursor: string | null = null
    const cursors = new Set<string>()
    for (;;) {
        const result: { olympiads: { edition: { subscriptions: Page } | null } } = await queryOlimanager(req, `query($edition: String!, $after: String) {
            olympiads { edition(id: $edition) { subscriptions(first: 100, after: $after) {
                edges { node { isValid school { pk externalId name location { city { name province { id } } } } contact { user { email } } } }
                pageInfo { hasNextPage endCursor }
            } } }
        }`, { edition: edition.id, after: cursor })
        const page = result.olympiads.edition?.subscriptions
        if (!page) throw new Error('Edizione non disponibile su Olimanager.')
        subscriptions.push(...page.edges.map(edge => edge.node))
        if (!page.pageInfo.hasNextPage) break
        cursor = page.pageInfo.endCursor
        if (!cursor || cursors.has(cursor)) throw new Error('Paginazione delle scuole Olimanager non valida.')
        cursors.add(cursor)
    }
    return sheetsFromSubscriptions(subscriptions, zones, schema, contestId)
}
