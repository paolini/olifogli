import type { OlimanagerCheckResult, OlimanagerJob, OlimanagerResultsSnapshot, OlimanagerResultDifference, Row, Sheet, Workbook } from './models'
import type { DelegatedOlimanagerAccess } from './olimanagerJobCredentials'
import { schemas } from './schema'
import { validateOlimanagerJobRow } from './olimanagerJobValidation'
import { CheckFailed, LoginRequired, createOlimanagerRequester, createRemoteInspector } from './olimanagerRemoteCheck'

const UPDATE_RESULTS = `mutation BulkUpdateResults($contestId: Int!, $problemResults: [ParticipantProblemResultInput!]!) {
  participants {
    bulkUpdateResults(contestId: $contestId, problemResults: $problemResults) {
      __typename
      ... on BulkUpdateResultsSuccess { nothing }
      ... on OperationInfo { messages { message kind } }
    }
  }
}`
type ResultsData = { participants?: { bulkUpdateResults?: { __typename: string } } }
const graphqlInt = (value: number) => Number.isInteger(value) && value >= -2147483648 && value <= 2147483647

export function createResultsSender(job: OlimanagerJob, access: DelegatedOlimanagerAccess | null,
    options: Parameters<typeof createOlimanagerRequester>[2] = {},
) {
    const query = createOlimanagerRequester(job, access, options)
    // Share pacing across the link checks and the mutation.
    const inspect = createRemoteInspector(job, access, options, query, true)
    return async (row: Row, sheet: Sheet, workbook: Workbook): Promise<OlimanagerCheckResult> => {
        try {
            if (row.encrypted_data) throw new CheckFailed('La riga è criptata: decriptarla prima del trasferimento.')
            const schema = schemas[sheet.schema]
            if (!schema) throw new CheckFailed('Schema del foglio non disponibile.')
            const context = schema.validationContext(sheet.commonData, workbook.commonData)
            if (context.absent(row.data)) return { result: 'absent' }
            validateOlimanagerJobRow(row, sheet, workbook)
            const contestId = context.contest_id
            if (!graphqlInt(contestId) || contestId <= 0) throw new CheckFailed('ID gara non valido.')
            if (!schema.extract_olimanager_results) throw new CheckFailed('Lo schema del foglio non supporta l’invio dei risultati.')
            const id = row.olimanager?.participantId || ''
            const participantId = Number(id)
            if (!/^\d+$/.test(id) || !graphqlInt(participantId) || participantId <= 0) {
                throw new CheckFailed('Collegamento Olimanager mancante o non valido: eseguire prima Crea/abbina partecipanti.')
            }
            if (row.olimanager?.contestId && Number(row.olimanager.contestId) !== contestId) {
                return { result: 'wrong_contest', error: 'Il collegamento locale si riferisce a una gara diversa.' }
            }
            const problemResults = schema.extract_olimanager_results(row, context)
            if (!problemResults.length || problemResults.some(result =>
                result.participantId !== participantId || !graphqlInt(result.problemIndex) || result.problemIndex <= 0 ||
                (result.score !== null && !graphqlInt(result.score)) || typeof result.disqualified !== 'boolean') ||
                new Set(problemResults.map(result => result.problemIndex)).size !== problemResults.length) {
                throw new CheckFailed('I risultati dei singoli esercizi non sono validi.')
            }
            const total = problemResults.reduce((sum, result) => sum + (result.score ?? 0), 0)
            if (!row.data.score?.trim() || !Number.isFinite(Number(row.data.score)) || total !== Number(row.data.score)) {
                throw new CheckFailed('Il punteggio totale della riga non corrisponde alla somma dei singoli esercizi: rivalidare il foglio.')
            }
            const classYear = row.data.classYear || (schema.fields.some(field => field.name === 'classYear') ? '' : '1')
            const checked = await inspect({ ...row, data: { ...row.data, classYear } }, sheet, workbook)
            if (checked.result !== 'matched') return checked
            const local: OlimanagerResultsSnapshot = {
                endpoint: job.endpoint, contestId: String(contestId), participantId: id,
                scores: problemResults.map(result => ({ problemIndex: result.problemIndex, score: result.score,
                    disqualified: result.disqualified })).sort((a, b) => a.problemIndex - b.problemIndex),
                totalScore: total,
            }
            const remote = checked.remoteResults
            if (!remote) throw new CheckFailed('Risultati remoti non disponibili: nessun punteggio è stato sovrascritto.')
            const ids = { participantId: id, competitorId: checked.competitorId, contestId: String(contestId) }
            if (sameResults(local, remote)) return { ...ids, result: 'results_unchanged', resultsSnapshot: local }
            const previous = row.olimanager?.resultsSnapshot
            const baseline = previous?.endpoint === job.endpoint && previous.contestId === String(contestId) && previous.participantId === id
                ? previous : undefined
            const empty = remote.scores.length === 0 && remote.totalScore === null
            const unexpectedProblems = remote.scores.some(score => !local.scores.some(value => value.problemIndex === score.problemIndex))
            if (unexpectedProblems || (baseline ? !sameResults(baseline, remote) : !empty)) {
                return { ...ids, result: 'results_conflict', resultDifferences: resultDifferences(local, remote),
                    error: unexpectedProblems ? 'Su Olimanager esistono risultati per esercizi non presenti nell’invio locale. Nessun punteggio è stato sovrascritto.'
                        : baseline ? 'I risultati su Olimanager sono cambiati dall’ultima sincronizzazione. Nessun punteggio è stato sovrascritto.'
                        : 'Su Olimanager sono già presenti risultati diversi, senza uno storico condiviso. Nessun punteggio è stato sovrascritto.',
                }
            }
            const data = await query<ResultsData>(UPDATE_RESULTS, { contestId, problemResults: problemResults.map(result => ({
                participantId: result.participantId, problemIndex: result.problemIndex,
                score: result.score, disqualified: result.disqualified,
            })) })
            const result = data.participants?.bulkUpdateResults
            if (result?.__typename === 'OperationInfo') throw new CheckFailed('Olimanager ha rifiutato i risultati: verificare la configurazione degli esercizi e i permessi sulla gara.')
            if (result?.__typename !== 'BulkUpdateResultsSuccess') throw new CheckFailed('Risposta all’invio dei risultati non valida: verificare l’esito su Olimanager prima di riprovare.')
            return { ...ids, result: 'results_updated', resultsSnapshot: local }
        } catch (error) {
            if (error instanceof LoginRequired) return { result: 'needs_login', error: 'La delega OAuth è scaduta o non è più valida. Rifare il login con scope api e riprendere il lavoro.' }
            return { result: 'unverifiable', error: error instanceof CheckFailed ? error.message : 'Invio dei risultati non riuscito: verificare dati e configurazione e controllare l’esito su Olimanager prima di riprovare.' }
        }
    }
}

function sameResults(a: OlimanagerResultsSnapshot, b: OlimanagerResultsSnapshot): boolean {
    if (a.totalScore !== b.totalScore || a.scores.length !== b.scores.length) return false
    const scores = new Map(b.scores.map(score => [score.problemIndex, score]))
    return a.scores.every(score => {
        const other = scores.get(score.problemIndex)
        return other && score.score === other.score && score.disqualified === other.disqualified
    })
}

function resultDifferences(local: OlimanagerResultsSnapshot, remote: OlimanagerResultsSnapshot): OlimanagerResultDifference[] {
    const value = (score: OlimanagerResultsSnapshot['scores'][number] | undefined) => score
        ? `${score.score === null ? 'non assegnato' : score.score}${score.disqualified === true ? ' (squalificato)' : score.disqualified === null ? ' (squalifica non specificata)' : ''}`
        : 'nessun risultato'
    const indices = [...new Set([...local.scores, ...remote.scores].map(score => score.problemIndex))].sort((a, b) => a - b)
    const differences = indices.flatMap(index => {
        const localValue = value(local.scores.find(score => score.problemIndex === index))
        const remoteValue = value(remote.scores.find(score => score.problemIndex === index))
        return localValue === remoteValue ? [] : [{ field: `Esercizio ${index}`, localValue, remoteValue }]
    })
    if (local.totalScore !== remote.totalScore) differences.push({ field: 'Totale',
        localValue: String(local.totalScore ?? 'non assegnato'), remoteValue: String(remote.totalScore ?? 'non assegnato') })
    return differences
}
