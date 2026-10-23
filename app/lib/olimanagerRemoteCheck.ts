import type { OlimanagerCheckResult, Row, Sheet, Workbook, OlimanagerJob } from './models'
import type { DelegatedOlimanagerAccess } from './olimanagerJobCredentials'
import { schemas } from './schema'

const PERMISSIONS = `query OlimanagerCheckPermissions($contestId: Int!) {
  users { me { isStaff } }
  contests { contests(filters: {id: $contestId}) { id edition { olympiad { admin { __typename } } } } }
}`
const PARTICIPANT = `query OlimanagerCheckParticipant($contestId: Int!, $participantId: Int!) {
  participants { participants(contestId: $contestId, participantId: $participantId) { edges { node {
    pk officialVenue { contest { id } }
    competitor { pk school { externalId } members { name surname birthDate classYear section } }
  } } } }
}`
type Member = { name: string, surname: string, birthDate: string | null, classYear: number | null, section: string }
type Participant = { pk: number, officialVenue: { contest: { id: number } },
    competitor: { pk: number, school: { externalId: string }, members: Member[] } }
type QueryData = { users?: { me?: { isStaff: boolean } },
    contests?: { contests: { id: number, edition: { olympiad: { admin: object | null } } }[] },
    participants?: { participants?: { edges: { node: Participant }[] } } }
export class LoginRequired extends Error {}
export class CheckFailed extends Error {}
const text = (value: string | null | undefined) => (value || '').normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('it-IT')
function date(value: string | undefined | null) {
    const match = (value || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    return match ? `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}` : value || ''
}
export function compareParticipant(row: Row, participant: Participant, contestId: number, school: string): OlimanagerCheckResult {
    const ids = { participantId: String(participant.pk), competitorId: String(participant.competitor.pk) }
    if (Number(participant.officialVenue.contest.id) !== contestId) return { ...ids, result: 'wrong_contest', error: 'Il partecipante appartiene a una gara diversa.' }
    if (text(participant.competitor.school.externalId) !== text(school)) return { ...ids, result: 'wrong_school', error: 'Il partecipante appartiene a una scuola diversa.' }
    if (participant.competitor.members.length !== 1) return { ...ids, result: 'unverifiable', error: 'Il concorrente non ha una singola anagrafica: verifica manuale necessaria.' }
    const member = participant.competitor.members[0]
    const differences = [
        text(row.data.name) !== text(member.name) ? 'Nome' : '',
        text(row.data.surname) !== text(member.surname) ? 'Cognome' : '',
        date(row.data.birthDate) !== date(member.birthDate) ? 'Data di nascita' : '',
        !/^[1-5]$/.test(row.data.classYear || '') || Number(row.data.classYear) + 8 !== member.classYear ? 'Anno di corso' : '',
        text(row.data.classSection) !== text(member.section) ? 'Sezione' : '',
    ].filter(Boolean)
    return differences.length ? { ...ids, result: 'different', differences, error: `Anagrafica diversa: ${differences.join(', ')}.` }
        : { ...ids, result: 'matched', differences: [] }
}

export function createOlimanagerRequester(job: OlimanagerJob, access: DelegatedOlimanagerAccess | null, {
    endpoint = process.env.OLIMANAGER_GRAPHQL_ENDPOINT, request = fetch, now = () => Date.now(),
    wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)),
} = {}) {
    // Bind delegated credentials to exactly the configured destination, including path.
    if (!endpoint || new URL(endpoint).href !== job.endpoint) throw new Error('L’endpoint del job non corrisponde alla configurazione del worker.')
    const destination = new URL(endpoint)
    if (!['http:', 'https:'].includes(destination.protocol) || destination.username || destination.password || destination.search || destination.hash) {
        throw new Error('Endpoint Olimanager non valido.')
    }
    let lastRequest: number | null = null
    return async function query<T>(query: string, variables: Record<string, unknown>): Promise<T> {
        if (!access || access.expiresAt * 1000 <= now()) throw new LoginRequired()
        if (lastRequest !== null) await wait(Math.max(0, 250 - (now() - lastRequest)))
        if (access.expiresAt * 1000 <= now()) throw new LoginRequired()
        lastRequest = now()
        let response: Response
        try {
            response = await request(job.endpoint, { method: 'POST', redirect: 'error', cache: 'no-store',
                signal: AbortSignal.timeout(15_000), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${access.accessToken}` },
                body: JSON.stringify({ query, variables }) })
        } catch { throw new CheckFailed('Connessione a Olimanager non riuscita: esito non verificabile.') }
        if (response.status === 401) throw new LoginRequired()
        if (response.status === 403) throw new CheckFailed('Permessi insufficienti su Olimanager: esito non verificabile.')
        if (!response.ok) throw new CheckFailed(`Olimanager ha restituito HTTP ${response.status}: esito non verificabile.`)
        let body
        try { body = await response.json() } catch { throw new CheckFailed('Risposta Olimanager non valida.') }
        if (body.errors?.length || !body.data) throw new CheckFailed('La query Olimanager non è riuscita: verificare permessi e compatibilità API.')
        return body.data
    }
}

export function createRemoteInspector(job: OlimanagerJob, access: DelegatedOlimanagerAccess | null,
    options: Parameters<typeof createOlimanagerRequester>[2] = {},
    request = createOlimanagerRequester(job, access, options),
) {
    const query = (document: string, variables: Record<string, unknown>) => request<QueryData>(document, variables)
    const permissions = new Map<number, boolean>()
    return async (row: Row, sheet: Sheet, workbook: Workbook): Promise<OlimanagerCheckResult> => {
        try {
            if (row.encrypted_data) throw new CheckFailed('La riga è criptata: anagrafica non verificabile.')
            const schema = schemas[sheet.schema]
            if (!schema) throw new CheckFailed('Schema del foglio non disponibile.')
            const context = schema.validationContext(sheet.commonData, workbook.commonData)
            const contestId = context.contest_id, school = context.school_external_id(row.data)
            if (!Number.isSafeInteger(contestId) || contestId <= 0 || !school?.trim()) throw new CheckFailed('Configurazione gara o scuola mancante.')
            if (!row.olimanager?.participantId) return { result: 'unmatched' }
            if (!/^\d+$/.test(row.olimanager.participantId) || !Number.isSafeInteger(Number(row.olimanager.participantId)) || Number(row.olimanager.participantId) <= 0) {
                throw new CheckFailed('Il participantId locale non è valido.')
            }
            if (row.olimanager.contestId && Number(row.olimanager.contestId) !== contestId) return { result: 'wrong_contest', error: 'Il collegamento locale si riferisce a una gara diversa da quella configurata.' }
            if (!permissions.has(contestId)) {
                const data = await query(PERMISSIONS, { contestId })
                const contests = data.contests?.contests
                if (typeof data.users?.me?.isStaff !== 'boolean' || !Array.isArray(contests)) throw new CheckFailed('Impossibile verificare i permessi sulla gara.')
                const contest = contests.find(contest => Number(contest.id) === contestId)
                if (!contest) throw new CheckFailed('La gara configurata non è disponibile su Olimanager.')
                permissions.set(contestId, data.users.me.isStaff || !!contest.edition.olympiad.admin)
            }
            if (!permissions.get(contestId)) throw new CheckFailed('L’account OAuth non è amministratore dell’olimpiade: partecipante non verificabile.')
            const participantId = Number(row.olimanager.participantId)
            const data = await query(PARTICIPANT, { contestId, participantId })
            const edges = data.participants?.participants?.edges
            if (!Array.isArray(edges)) throw new CheckFailed('Elenco dei partecipanti non disponibile.')
            if (!edges.length) {
                // Some permission extensions can return an empty connection on denial.
                // Recheck access before interpreting emptiness as a missing participant.
                const confirmed = await query(PERMISSIONS, { contestId })
                const contest = confirmed.contests?.contests?.find(contest => Number(contest.id) === contestId)
                if (!contest || typeof confirmed.users?.me?.isStaff !== 'boolean' ||
                    (!confirmed.users.me.isStaff && !contest.edition.olympiad.admin)) {
                    throw new CheckFailed('Permessi sulla gara non confermati: partecipante non verificabile.')
                }
                return { result: 'not_found', participantId: String(participantId), error: 'Partecipante non trovato nella gara prevista.' }
            }
            if (edges.length !== 1 || Number(edges[0].node.pk) !== participantId) throw new CheckFailed('Risposta ambigua per il partecipante richiesto.')
            return compareParticipant(row, edges[0].node, contestId, school)
        } catch (error) {
            if (error instanceof LoginRequired) return { result: 'needs_login', error: 'La delega OAuth è scaduta o non è più valida. Rifare il login con scope api e riprendere il lavoro.' }
            return { result: 'unverifiable', error: error instanceof CheckFailed ? error.message : 'Verifica non riuscita: controllare configurazione e risposta Olimanager.' }
        }
    }
}
