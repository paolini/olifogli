import type { OlimanagerCheckResult, OlimanagerJob, Row, Sheet, Workbook } from './models'
import type { DelegatedOlimanagerAccess } from './olimanagerJobCredentials'
import { schemas } from './schema'
import { validateOlimanagerJobRow } from './olimanagerJobValidation'
import { CheckFailed, LoginRequired, createOlimanagerRequester, createRemoteInspector } from './olimanagerRemoteCheck'

const MATCH = `mutation MatchOrCreateParticipant(
  $contestId: Int!, $schoolExternalId: String!, $name: String!, $surname: String!,
  $classYear: Int!, $section: String!, $birthDate: Date
) {
  participants {
    matchOrCreateParticipant(contestId: $contestId, schoolExternalId: $schoolExternalId,
      name: $name, surname: $surname, classYear: $classYear, section: $section, birthDate: $birthDate) {
      __typename
      ... on OperationInfo { messages { message kind } }
      ... on ParticipantMatchSuccess {
        participant { pk competitor { pk } }
        competitorCreated participantCreated multipleCompetitorsMatched
      }
    }
  }
}`

type MatchData = { participants?: { matchOrCreateParticipant?: {
    __typename: string
    participant?: { pk: number, competitor: { pk: number } }
    competitorCreated?: boolean
    participantCreated?: boolean
    multipleCompetitorsMatched?: boolean
} } }

export function createParticipantMatcher(job: OlimanagerJob, access: DelegatedOlimanagerAccess | null,
    options: Parameters<typeof createOlimanagerRequester>[2] = {},
) {
    const query = createOlimanagerRequester(job, access, options)
    const inspect = createRemoteInspector(job, access, options)
    return async (row: Row, sheet: Sheet, workbook: Workbook): Promise<OlimanagerCheckResult> => {
        try {
            if (row.encrypted_data) throw new CheckFailed('La riga è criptata: decriptarla prima del trasferimento.')
            const schema = schemas[sheet.schema]
            if (!schema) throw new CheckFailed('Schema del foglio non disponibile.')
            const context = schema.validationContext(sheet.commonData, workbook.commonData)
            const contestId = context.contest_id
            const schoolExternalId = context.school_external_id(row.data)?.trim()
            if (!Number.isSafeInteger(contestId) || contestId <= 0 || !schoolExternalId) throw new CheckFailed('Configurazione gara o scuola mancante.')
            if (context.absent(row.data)) return { result: 'absent' }
            validateOlimanagerJobRow(row, sheet, workbook)
            const classYear = row.data.classYear || (schema.fields.some(field => field.name === 'classYear') ? '' : '1')
            if (row.olimanager?.participantId) {
                // Existing links are checked, never silently replaced or migrated.
                const checked = await inspect({ ...row, data: { ...row.data, classYear } }, sheet, workbook)
                return checked.result === 'matched' ? { ...checked, result: 'already_linked' } : checked
            }
            const { name, surname, birthDate = '', classSection = '' } = row.data
            if (!name?.trim() || !surname?.trim() || !/^[1-5]$/.test(classYear)) throw new CheckFailed('Nome, cognome o anno di corso mancanti o non validi.')
            const date = birthDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
            if (birthDate && !date) throw new CheckFailed('Data di nascita non valida.')
            const data = await query<MatchData>(MATCH, { contestId, schoolExternalId, name: name.trim(), surname: surname.trim(),
                classYear: Number(classYear) + 8, section: classSection.trim(),
                birthDate: date ? `${date[3]}-${date[2].padStart(2, '0')}-${date[1].padStart(2, '0')}` : null,
            })
            const result = data.participants?.matchOrCreateParticipant
            if (result?.__typename === 'OperationInfo') throw new CheckFailed('Olimanager ha rifiutato la creazione/abbinamento: verificare iscrizione della scuola, sede e dati della riga.')
            if (result?.__typename !== 'ParticipantMatchSuccess' ||
                !Number.isSafeInteger(result.participant?.pk) || result.participant!.pk <= 0 ||
                !Number.isSafeInteger(result.participant?.competitor?.pk) || result.participant!.competitor.pk <= 0 ||
                typeof result.participantCreated !== 'boolean' || typeof result.competitorCreated !== 'boolean' ||
                typeof result.multipleCompetitorsMatched !== 'boolean') throw new CheckFailed('Risposta di creazione/abbinamento non valida: verificare l’esito su Olimanager prima di riprovare.')
            return { result: result.participantCreated ? 'created' : 'linked',
                participantId: String(result.participant!.pk), competitorId: String(result.participant!.competitor.pk),
                contestId: String(contestId), competitorCreated: result.competitorCreated,
                participantCreated: result.participantCreated, multipleCompetitorsMatched: result.multipleCompetitorsMatched,
            }
        } catch (error) {
            if (error instanceof LoginRequired) return { result: 'needs_login', error: 'La delega OAuth è scaduta o non è più valida. Rifare il login con scope api e riprendere il lavoro.' }
            return { result: 'unverifiable', error: error instanceof CheckFailed ? error.message : 'Creazione/abbinamento non riuscita: verificare l’esito su Olimanager prima di riprovare.' }
        }
    }
}
