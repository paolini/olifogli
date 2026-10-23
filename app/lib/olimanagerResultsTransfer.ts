import type { OlimanagerCheckResult, OlimanagerJob, Row, Sheet, Workbook } from './models'
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
    const inspect = createRemoteInspector(job, access, options, query)
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
            const data = await query<ResultsData>(UPDATE_RESULTS, { contestId, problemResults: problemResults.map(result => ({
                participantId: result.participantId, problemIndex: result.problemIndex,
                score: result.score, disqualified: result.disqualified,
            })) })
            const result = data.participants?.bulkUpdateResults
            if (result?.__typename === 'OperationInfo') throw new CheckFailed('Olimanager ha rifiutato i risultati: verificare la configurazione degli esercizi e i permessi sulla gara.')
            if (result?.__typename !== 'BulkUpdateResultsSuccess') throw new CheckFailed('Risposta all’invio dei risultati non valida: verificare l’esito su Olimanager prima di riprovare.')
            return { result: 'results_updated', participantId: id, competitorId: checked.competitorId, contestId: String(contestId) }
        } catch (error) {
            if (error instanceof LoginRequired) return { result: 'needs_login', error: 'La delega OAuth è scaduta o non è più valida. Rifare il login con scope api e riprendere il lavoro.' }
            return { result: 'unverifiable', error: error instanceof CheckFailed ? error.message : 'Invio dei risultati non riuscito: verificare dati e configurazione e controllare l’esito su Olimanager prima di riprovare.' }
        }
    }
}
