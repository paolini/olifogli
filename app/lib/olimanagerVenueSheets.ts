import type { NextRequest } from 'next/server'
import { queryOlimanager } from './olimanager'
import type { Data, Permission } from './models'

export type VenueSheet = {
    name: string
    schema: 'archimede_biennio' | 'archimede_triennio'
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

export function sheetsFromSubscriptions(subscriptions: Subscription[], zones: Zone[]) {
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
        if (!email) warnings.push(`${code}: referente senza account/email; nessun amministratore assegnato.`)
        // Extra schools override province membership, as in Olimanager's Zone.schools.
        const extra = zones.filter(zone => zone.extraSchools.some(s => s.pk === school.pk))
        const matches = extra.length ? extra : zones.filter(zone => zone.provinces.some(p => p.id === school.location?.city?.province?.id))
        if (matches.length !== 1) {
            warnings.push(`${code}: ${matches.length ? 'distretto ambiguo' : 'distretto assente'}; nessun supervisore assegnato.`)
        }
        const zone = matches.length === 1 ? matches[0] : undefined
        const emails = [...new Set((zone?.admins || []).map(a => a.user.email.trim().toLowerCase()).filter(Boolean))]
        if (zone && !emails.length) warnings.push(`${code}: distretto ${zone.name} senza supervisori.`)
        const permissions: Permission[] = email ? [{ email, role: 'admin' }] : []
        permissions.push(...emails.filter(e => e !== email).map(email => ({ email, role: 'view' as const })))
        for (const schema of ['archimede_biennio', 'archimede_triennio'] as const) sheets.push({
            name: code, schema, permissions,
            commonData: { Codice_meccanografico: code, Nome_scuola: school.name, 'Città_scuola': school.location?.city?.name || '', Distretto: zone?.name.replace(/^Distretto di /, '') || '' },
        })
    }
    return { sheets, warnings }
}

export async function loadVenueSheets(req: NextRequest, olympiadId: string, biennio: number, triennio: number) {
    if (![biennio, triennio].every(n => Number.isInteger(n) && n > 0 && n <= 2147483647) || biennio === triennio) {
        throw new Error('Seleziona due contest distinti per Biennio e Triennio.')
    }
    const choices = await venueSheetChoices(req)
    const olympiad = choices.find(o => o.id === olympiadId)
    const edition = olympiad?.editions.find(e => [biennio, triennio].every(id => e.contests.some(c => c.id === id && c.scope === 'SCHOOL')))
    if (!edition) throw new Error('I contest devono essere scolastici e appartenere alla stessa edizione dell’olimpiade scelta.')
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
    return { ...sheetsFromSubscriptions(subscriptions, zones), editionId: edition.id }
}
