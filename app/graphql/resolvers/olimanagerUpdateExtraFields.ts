import { schemas } from "@/app/lib/schema";
import { Context } from "../types";
import { check_admin, get_authenticated_user } from "./utils";
import { getRowsCollection, getSheetsCollection, getWorkbooksCollection } from "@/app/lib/mongodb";
import { Collection, ObjectId, WithoutId } from "mongodb";
import { OlimanagerApi } from "./olimanagerApi";
import { Row, Sheet, Workbook } from "@/app/lib/models";
import Schema from "@/app/lib/schema/Schema";
import { set } from "date-fns";

export default async function olimanagerUploadExtraFields(
  _: unknown,
  { rowIds, sheetIds, username, password }: { rowIds?: ObjectId[]; sheetIds?: ObjectId[]; username?: string; password: string },
  context: Context
): Promise<{success: boolean, error?: string, participantId?: string, skipped?: boolean, converted?: boolean}[]> {
  console.log('=== olimanagerUploadExtraFields START ===')
  console.log('Input params:', { rowIds: rowIds?.length, sheetIds: sheetIds?.length, username, passwordProvided: !!password })

  // 1) Autenticazione e autorizzazione (solo admin di sistema)
  const user = await get_authenticated_user(context)
  // console.log('Authenticated user:', user?.email, 'isAdmin:', user?.isAdmin)
  check_admin(user)
  // console.log('Admin check passed')

  // 2) Raccogli tutti i rowIds da rowIds diretti e/o da sheetIds
  const allRowIds = new Set(rowIds || [])
  // console.log('Initial rowIds from params:', rowIds?.length || 0)

  if (sheetIds && sheetIds.length > 0) {
    console.log('Processing sheetIds:', sheetIds.length)
    const rows = await getRowsCollection()
    for (const sheetId of sheetIds) {
      console.log('Fetching rows for sheetId:', sheetId)
      const totalRows = await rows.countDocuments({ sheetId })
      console.log('Total rows in sheet:', totalRows)
      // const allSheetRows = await rows.find({ sheetId }).limit(3).toArray()
      // console.log('Sample rows:', allSheetRows.map(r => ({ _id: r._id, error: r.error, data: r.data })))
      const sheetRows = await rows.find({ 
        sheetId, 
        $or: [
          { error: { $exists: false } },
          { error: "" }
        ]
      }).toArray()
      console.log('Found', sheetRows.length, 'valid rows for sheetId:', sheetId)
      sheetRows.forEach(row => allRowIds.add(row._id))
    }
  }

  const finalRowIds = Array.from(allRowIds)
  console.log('Total final rowIds to process:', finalRowIds.length)

  // 3) Preparo collezioni e client Olimanager una sola volta
  const rows = await getRowsCollection()
  const sheets = await getSheetsCollection()
  const workbooks = await getWorkbooksCollection()
  // console.log('Collections initialized')

  const api = new OlimanagerApi(username || user.email, password)
  console.log('OlimanagerApi created with username:', username || user.email)
  await api.login()
  console.log('Olimanager login successful')

  const results: {success: boolean, error?: string, participantId?: string, skipped?: boolean, converted?: boolean}[] = []
  console.log('Starting processing', finalRowIds.length, 'rows')

  for (let i = 0; i < finalRowIds.length; i++) {
    const rowId = finalRowIds[i];
    console.log(`--- Processing row ${i + 1}/${finalRowIds.length}: ${rowId} ---`)
    
    try {
      const row = await rows.findOne({ _id: rowId })
      // console.log('Row data:', row ? { _id: row._id, data: row.data } : 'NOT FOUND')
      if (!row) throw new Error(`Riga non trovata: ${rowId}`)

      const sheet = await sheets.findOne({ _id: row.sheetId })
      // console.log('Sheet data:', sheet ? { _id: sheet._id, name: sheet.name, schema: sheet.schema } : 'NOT FOUND')
      if (!sheet) throw new Error(`Foglio non trovato per la riga: ${row.sheetId}`)
      const schema = schemas[sheet.schema]
      // console.log('Schema found:', !!schema, 'for schema key:', sheet.schema)
      if (!schema) throw new Error(`Schema non trovato per il foglio: ${sheet.schema}`)

      const workbook = await workbooks.findOne({ _id: sheet.workbookId })
      // console.log('Workbook data:', workbook ? { _id: workbook._id, name: workbook.name } : 'NOT FOUND')
      if (!workbook) throw new Error(`Workbook non trovato: ${sheet.workbookId}`)

      const result = await processRow(api, rows, row, sheet, workbook, schema);
      results.push(result);
    } catch (e) {
      console.log(`  EXCEPTION:`, e)
      console.log(e)
      const errorMessage = String((e as Error)?.message || e)
      console.log('Updating row with exception error:', errorMessage)
      await rows.updateOne(
        { _id: rowId },
        {
          $set: {
            'olimanager.error': errorMessage
          },
        }
      )
      console.log('Row updated with exception')
      results.push({success: false, error: errorMessage})
    }
  }  
  console.log('=== olimanagerUploadExtraFields END ===')
  console.log('Results summary:', { 
    total: results.length, 
    success: results.filter(r => r.success).length, 
    failures: results.filter(r => !r.success).length,
    skipped: results.filter(r => r.skipped).length,
    converted: results.filter(r => r.converted).length
  })
  return results
}

async function processRow(
  api: OlimanagerApi,
  rows: Collection<WithoutId<Row>>,
  row: Row,
  sheet: Sheet,
  workbook: Workbook,
  schema: Schema
): Promise<{success: boolean, error?: string, participantId?: string, skipped?: boolean }> {
      const rowId = row._id;

      const shirt_size = row.data["shirt_size"]

      const variant = row.data['variant'];

      const result = await syncDataWithOlimanager(api, row, sheet, workbook, schema);

      console.log(`syncDataWithOlimanager result: ${JSON.stringify(result)}`)

      if (result.skipped) {
          return { success: true, participantId: result.participantId, skipped: true };
      }

      return {
          success: result.success,
          error: result.error,
          participantId: result.participantId,
      }
}

async function syncDataWithOlimanager(
    api: OlimanagerApi, 
    row: Row, 
    sheet: Sheet, 
    workbook: Workbook, 
    schema: Schema
): Promise<{
    success: boolean, 
    error?: string, 
    participantId?: string, 
    skipped?: boolean, 
    converted?: boolean,
    contestId?: string,
    rawResult?: unknown 
}> {
      const taglia_field_id = workbook.commonData["olimanager_taglia_field_id"]
      const contest_id = workbook.commonData["olimanager_contest_id"]
      if (!taglia_field_id) {
        console.log(`     SKIPPING: olimanager_taglia_field_id non specificato nel workbook`)
        return {success: false, skipped: true, error: `"taglia_field_id" non specificato nel workbook`}
      }
      if (!contest_id) {
        console.log(`     SKIPPING: olimanager_contest_id non specificato nel workbook`)
        return {success: false, skipped: true, error: `"olimanager_contest_id" non specificato nel workbook`}
      }
      console.log('Extracted taglia_field_id:', taglia_field_id, 'Extracted contest_id:', contest_id)

      const shirt_size = row.data["shirt_size"]
      const row_participant_id = parseInt(row.olimanager?.participantId || '', 10)
      const row_contest_id = row.olimanager?.contestId
      const surname = row.data.surname
      const name = row.data.name

      if (isNaN(row_participant_id)) {
        console.log(`    SKIPPING: participant_id non presente nella row ${row._id} (${surname}) sheet_id: ${sheet._id}`)
        return {success: true, skipped: true}
      }
      if (row_contest_id && String(row_contest_id) !== String(contest_id)) {
        console.log(`    SKIPPING: contest_id della row (${row_contest_id}) diverso da quello del workbook (${contest_id}) per riga ${row._id} (${surname})`)
        return {success: true, skipped: true}
      }

      console.log(`aggiornamento extra fields partecipante per riga ${row._id} (${surname} ${name})`)
      console.log(`  contestId: ${contest_id}, shirt_size: ${shirt_size}`)


      const result = await getParticipantExtraField(api, row_participant_id, taglia_field_id)
      console.log('getParticipantExtraField result:', result)

      if (result?.success) {
        console.log(`  got value: participantId: ${result.participant_id} value: ${result.value}`)
        if (result.value && result.value !== '') {
          console.log(`  SKIPPING update because value already exists for participant ${result.participant_id}`)
          return { success: true, participantId: String(result.participant_id), skipped: true }
        }

        const result2 = await setParticipantExtraField(api, row_participant_id, taglia_field_id, shirt_size)
        console.log('setParticipantExtraField result:', result2)
        
        if (!result2.success) {
          console.log(`  FAILURE setting extra field:`, result2.error)
          return { success: false, error: result2.error, participantId: String(result.participant_id) }
        }
        
        const participantId = result?.participant_id ? String(result.participant_id) : undefined
        return { success: true, participantId, rawResult: result, contestId: String(contest_id) }
      } else {
        console.log(`  FAILURE:`, result?.error || 'unknown')
        console.log(JSON.stringify(result))
        const errorMsg = typeof result?.error === 'string' ? result?.error : JSON.stringify(result?.error || 'unknown error')
        return { success: false, error: errorMsg, rawResult: result }
      }
}

const query_extra_field = `query ParticipantsExtraFields($participant_id: Int) {
  participants {
    participants(contestId: 27, filters: {id: $participant_id}) {
      edges {
        node {
          id
          extraFieldEntries {
            field {
              fieldName
              id
            }
            value
            id
          }
          competitor {
            id
          }
        }
      }
    }
  }
}`

async function getParticipantExtraField(api: OlimanagerApi, participant_id: number, extra_field_id: string) {
  try {
    const variables = {
      participant_id,
    }
    
    const response = await api.query(query_extra_field, variables)

    if (response.errors) {
      console.log('GraphQL errors found:', response.errors)
      return { success: false, error: response.errors };
    }

    const edges = response?.data?.participants?.participants?.edges
    
    if (edges.length === 0) {
      return { success: false, error: `no participant found with participant_id: ${participant_id}`}
    }

    if (edges.length > 1) {
      return { success: false, error: `multiple participants found with participant_id: ${participant_id}`}
    }

    const edge = edges[0]

    const extra_fields_entries = edge?.node?.extraFieldEntries
    let value = undefined
    for (const entry of extra_fields_entries) {
      if (`${entry?.field?.id}` === `${extra_field_id}`) {
        value = entry?.value
      }
    }

    return {
      success: true,
      participant_id,
      extra_field_id,
      value,
    }
  } catch (e) {
    console.log('Exception in GetParticipantExtraField:', e)
    return { success: false, error: String((e as Error)?.message || e) };
  }
}

/*
participants {
  updateExtraFieldEntry(
    participantId: Int!
    extraFieldId: Int!
    value: String!
    file: UploadedFile = null
    ): UpdateExtraFieldEntryPayload!
}

UpdateExtraFieldEntryPayload {
  ParticipantExtraFieldEntryType {
    id: ID!
    participant: ParticipantType!
    field: ContestParticipantExtraFieldType!
    value: String!
  }
}
*/

const mutation_set_participant_extra_field = `mutation UpdateExtraFieldEntry($participantId: Int!, $extraFieldId: Int!, $value: String!) {
  participants {
    updateExtraFieldEntry(participantId: $participantId, extraFieldId: $extraFieldId, value: $value) {
      __typename
      ... on OperationInfo {
        messages {
          message
          kind
        }
      }
      ... on ParticipantExtraFieldEntryType {
          id
          value
      }
    }
  }
}`


async function setParticipantExtraField(api: OlimanagerApi, participant_id: number, extra_field_id: string, value: string) {
  try {
    const variables = {
      participantId: participant_id,
      extraFieldId: Number(extra_field_id),
      value,
    }
    
    const response = await api.query(mutation_set_participant_extra_field, variables)
    console.log('GraphQL response for setParticipantExtraField:', JSON.stringify(response), 'with variables:', JSON.stringify(variables))

    if (response.errors) {
      console.log('GraphQL errors found:', response.errors)
      return { success: false, error: response.errors };
    }

    const result = response?.data?.participants?.updateExtraFieldEntry

    if (!result) {
      return { success: false, error: 'No payload returned from updateExtraFieldEntry' }
    }

    if (result.messages) {
      console.log('OperationInfo messages:', result.messages)
      return { success: false, messages: result.messages }
    }

    // If the payload contains the entry fields directly, consider it a success
    if (result.id || result.value || (result.extraFieldEntry && (result.extraFieldEntry.id || result.extraFieldEntry.value))) {
      return { success: true }
    }

    if (result.error) {
      return { success: false, error: result.error }
    }

    return { success: false, error: `Unknown payload shape from updateExtraFieldEntry: ${JSON.stringify(result)}` }
  } catch (e) {
    console.log('Exception in setParticipantExtraField:', e)
    return { success: false, error: String((e as Error)?.message || e) };
  }
}
/**

const mutation_match_or_create = `
mutation MatchOrCreateParticipant(
  $contestId: Int!
  $schoolExternalId: String!
  $name: String!
  $surname: String!
  $classYear: Int!
  $section: String!
  $birthDate: Date
) {
  participants {
    matchOrCreateParticipant(
      contestId: $contestId
      schoolExternalId: $schoolExternalId
      name: $name
      surname: $surname
      classYear: $classYear
      section: $section
      birthDate: $birthDate
    ) {
      __typename
      ... on OperationInfo {
        messages {
          message
          kind
        }
      }
      ... on ParticipantMatchSuccess {
        participant {
          id
          competitor {
            id
            name
          }
        }
        competitorCreated
        participantCreated
        multipleCompetitorsMatched
      }
    }
  }
}
`;

interface ParticipantData {
  schoolExternalId: string;
  name: string;
  surname: string;
  classYear: number;
  section: string;
  birthDate?: string;
}

async function matchOrCreateParticipant(api: OlimanagerApi, contestId: number, participantData: ParticipantData) {
  console.log('--- matchOrCreateParticipant START ---')
  console.log('contestId:', contestId, 'participantData:', participantData)
  try {
    const variables: {
      contestId: number;
      schoolExternalId: string;
      name: string;
      surname: string;
      classYear: number;
      section: string;
      birthDate?: string;
    } = {
      contestId: Number(contestId),
      schoolExternalId: participantData.schoolExternalId,
      name: participantData.name,
      surname: participantData.surname,
      classYear: participantData.classYear,
      section: participantData.section,
    };
    if (participantData.birthDate) {
      variables.birthDate = participantData.birthDate;
    }
    // console.log('GraphQL variables:', variables)

    const response = await api.query(mutation_match_or_create, variables);
    // console.log('GraphQL response:', response)

    if (response.errors) {
      console.log('GraphQL errors found:', response.errors)
      return { success: false, error: response.errors, input: participantData };
    }

    const result = response?.data?.participants?.matchOrCreateParticipant;
    const typename = result?.__typename;
    // console.log('Result typename:', typename)

    if (typename === 'OperationInfo') {
      console.log('OperationInfo messages:', result.messages)
      return { success: false, messages: result.messages, input: participantData };
    } else if (typename === 'ParticipantMatchSuccess') {
      console.log('ParticipantMatchSuccess:', { participantId: result.participant.id, competitorCreated: result.competitorCreated, participantCreated: result.participantCreated })
      return {
        success: true,
        participant: result.participant,
        competitorCreated: result.competitorCreated,
        participantCreated: result.participantCreated,
        multipleCompetitorsMatched: result.multipleCompetitorsMatched,
        input: participantData,
      };
    }

    console.log('Unknown typename:', typename)
    return { success: false, error: `Unknown typename: ${typename}` , input: participantData };
  } catch (e) {
    console.log('Exception in matchOrCreateParticipant:', e)
    return { success: false, error: String((e as Error)?.message || e), input: participantData };
  }
}

const query_get_competitor = `
query GetCompetitor($participantId: Int!) {
  participants {
    participants(participantId: $participantId) {
      edges {
        node {
          id
          competitor {
            id
            name
          }
        }
      }
    }
  }
}
`

const query_get_venues = `
query GetContestVenueByName($contestId: Int!, $venueName: String!) {
  venues {
    venues(filters: {contest: {id: $contestId}, name: {iContains: $venueName}}) {
      id
      name
      location {
        name
      }
    }
  }
}
`

const mutation_manual_create = `
mutation ManualCreateParticipant($competitorId: Int!, $venueId: Int!) {
  participants {
    manualCreateParticipant(competitorId: $competitorId, venueId: $venueId) {
      ... on ManualParticipantCreateSuccess {
        participant {
          id
        }
      }
    }
  }
}
`

async function getCompetitorFromParticipant(api: OlimanagerApi, participantId: number) {
  const result = await api.query(query_get_competitor, { participantId });
  const edges = result?.data?.participants?.participants?.edges;
  if (edges && edges.length > 0) {
    return edges[0].node.competitor;
  }
  return null;
}

async function getVenueForContest(api: OlimanagerApi, contestId: number, venueName: string) {
  // prova prima con "Distretto di {venueName}"
  const result = await api.query(query_get_venues, { contestId, venueName: `Distretto di ${venueName}` });
  const venues = result?.data?.venues?.venues;
  if (venues && venues.length > 0) {
    return venues[0];
  }

  // poi prova con il nome esatto
  const result2 = await api.query(query_get_venues, { contestId, venueName });
  const venues2 = result2?.data?.venues?.venues;
  if (venues2 && venues2.length > 0) {
    return venues2[0];
  }
  return null;
}

async function manualCreateParticipantHelper(api: OlimanagerApi, competitorId: string | number, venueId: string | number) {
  const result = await api.query(mutation_manual_create, { competitorId: Number(competitorId), venueId: Number(venueId) });
  if (result.errors && result.errors.length > 0) {
     throw new Error(result.errors.map((e: { message: string }) => e.message).join(', '));
  }
  return result?.data?.participants?.manualCreateParticipant?.participant?.id;
}

*/
