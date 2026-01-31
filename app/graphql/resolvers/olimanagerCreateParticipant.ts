import { schemas } from "@/app/lib/schema";
import { Context } from "../types";
import { check_admin, get_authenticated_user } from "./utils";
import { getRowsCollection, getSheetsCollection, getWorkbooksCollection } from "@/app/lib/mongodb";
import { Collection, ObjectId, WithoutId } from "mongodb";
import { OlimanagerApi } from "./olimanagerApi";
import { Row, Sheet, Workbook } from "@/app/lib/models";
import Schema from "@/app/lib/schema/Schema";

// Nota: in fondo al file esiste la funzione di supporto matchOrCreateParticipant
// riutilizzata qui per chiamare l'endpoint GraphQL di Olimanager.

export default async function olimanagerCreateParticipant(
  _: unknown,
  { rowIds, sheetIds, username, password }: { rowIds?: ObjectId[]; sheetIds?: ObjectId[]; username?: string; password: string },
  context: Context
): Promise<{success: boolean, error?: string, participantId?: string, skipped?: boolean, converted?: boolean}[]> {
  console.log('=== olimanagerCreateParticipant START ===')
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
  console.log('=== olimanagerCreateParticipant END ===')
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
): Promise<{success: boolean, error?: string, participantId?: string, skipped?: boolean, converted?: boolean}> {
      const rowId = row._id;
      const result = await syncDataWithOlimanager(api, row, sheet, workbook, schema);

      console.log(`syncDataWithOlimanager result: ${JSON.stringify(result)}`)

      if (result.skipped) {
          return { success: true, participantId: result.participantId, skipped: true };
      }

      if (result.success) {
        console.log(`Updating row with participantId: ${result.participantId}, contestId: ${result.contestId}`);
        
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const $set: any = {
              'olimanager.participantId': result.participantId,
              'olimanager.participantCreatedOn': new Date(),
              'olimanager.error': '',
              'olimanager.result': result.rawResult,
        }
        if (result.contestId) {
            $set['olimanager.contestId'] = result.contestId
        }

        await rows.updateOne(
          { _id: rowId },
          { $set }
        )
        console.log('Row updated successfully')
        return { success: true, participantId: result.participantId, converted: result.converted }
      } else {
        console.log('Updating row with error:', result.error)
        await rows.updateOne(
          { _id: rowId },
          {
            $set: {
              'olimanager.error': result.error,
              'olimanager.result': result.rawResult,
            },
          }
        )
        console.log('Row updated with error')
        return { success: false, error: result.error }
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
      const contestId = schema.get_contest_id(workbook.commonData)
      const schoolExternalId = schema.get_school_external_id(row.data, sheet.commonData)
      console.log('Extracted contestId:', contestId, 'schoolExternalId:', schoolExternalId)

      const name = row.data.name
      const surname = row.data.surname
      const classYearStr = row.data?.classYear || '1'
      const section = row.data.classSection
      const birthDate = row.data.birthDate.replace(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, '$3-$2-$1');

      const classYear = parseInt(classYearStr || '0', 10) + 8 // Converto da anno di corso (1-5) a anno scolastico (9-13)

      const row_participant_id = parseInt(row.olimanager?.participantId || '', 10)
      const row_contest_id = parseInt(row.olimanager?.contestId || '', 10)

      if (!isNaN(row_participant_id) && row_contest_id === contestId) {
        console.log(`  SKIPPING: la riga ha già un participantId (${row_participant_id}) per questo contestId (${row_contest_id})`)
        return {success: true, participantId: `${row_participant_id}`, skipped: true}
      }

      if (!isNaN(row_participant_id) && !isNaN(row_contest_id) && row_contest_id !== contestId) {
        console.log(`  NOTE: la riga ha un participantId (${row_participant_id}) per un contestId diverso (${row_contest_id} vs ${contestId})`)
        console.log(`    Devo ottenere il competitor_id e il participant_id corretti per il contestId ${contestId}`)

        try {
          const competitor = await getCompetitorFromParticipant(api, row_participant_id);
          if (!competitor) {
            console.warn(`    WARNING: Competitor not found for participantId ${row_participant_id}`);
          } else {
             console.log(`    Found competitor: ${competitor.id} (${competitor.name})`);
             const venue = await getVenueForContest(api, contestId, sheet.name);
             if (!venue) {
               console.warn(`    WARNING: No venue found for contest ${contestId} with name matching "${sheet.name}"`);
             } else {
               console.log(`    Found venue: ${venue.id} (${venue.name})`);
               const newParticipantId = await manualCreateParticipantHelper(api, competitor.id, venue.id);
               if (newParticipantId) {
                 console.log(`    SUCCESS: New participant created manually: ${newParticipantId}`);
                 return {
                    success: true, 
                    participantId: String(newParticipantId), 
                    converted: true,
                    contestId: String(contestId),
                    rawResult: { method: 'manualCreateParticipant', competitorId: competitor.id, venueId: venue.id, newParticipantId },
                 };
               } else {
                 console.warn(`    WARNING: Failed to create participant manually.`);
               }
             }
          }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`    ERROR doing manual migration:`, msg);
            const errorMsg = `Manual migration failed: ${msg}`;
            return { success: false, error: errorMsg };
        }
      }
      // console.log('Participant data:', { name, surname, classYearStr, classYear, section, birthDate: row.data.birthDate, birthDateConverted: birthDate })

      console.log(`Creazione/abbinamento partecipante per riga ${row._id} (${surname} ${name})`)
      console.log(`  schoolExternalId: ${schoolExternalId}, contestId: ${contestId}, classYear: ${classYear}, section: ${section}, birthDate: ${birthDate}`)
      const result = await matchOrCreateParticipant(api, contestId, {
        schoolExternalId,
        name,
        surname,
        classYear,
        section,
        birthDate,
      })
      console.log('matchOrCreateParticipant result:', result)

      if (result?.success) {
        console.log(`  SUCCESS: participantId: ${result.participant.id}, competitorCreated: ${result.competitorCreated}, participantCreated: ${result.participantCreated}`)
        console.log(JSON.stringify(result))
        const participantId = result?.participant?.id ? String(result.participant.id) : undefined
        return { success: true, participantId, rawResult: result, contestId: String(contestId) }
      } else {
        console.log(`  FAILURE:`, result?.error || result?.messages || 'unknown')
        console.log(JSON.stringify(result))
        const errorMsg = typeof result?.error === 'string' ? result?.error : JSON.stringify(result?.error || result?.messages || 'unknown error')
        return { success: false, error: errorMsg, rawResult: result }
      }
}

/**
 * Script per leggere i dati dei partecipanti da un file JSONL e creare/abbinare i partecipanti (versione Node.js).
 * 
 * Uso:
 *   cat participants.jsonl | node create_participants.js CONTEST_ID > results.jsonl
 * 
 * Esempio:
 *   echo '{"schoolExternalId": "AORA025009", "name": "Mario", "surname": "Rossi", "classYear": 13, "section": "A", "birthDate": "2007-05-15"}' | node create_participants.js 1
 * 
 * Variabili d'ambiente richieste per l'autenticazione:
 *   - OLI_EMAIL
 *   - OLI_PASSWORD
 *   - OLI_GRAPHQL_ENDPOINT (opzionale, default: https://olimpiadi-scientifiche.it/graphql/)
 *   - OLI_CONTEST_ID (alternativa all'argomento da riga di comando)
 */

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
    venues(filters: {contest: {id: $contestId}, name: {exact: $venueName}}) {
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

/*
Creazione/abbinamento partecipante per riga 6929aecaffb46aa2834c64a3 (Giordano Alessandro)
  schoolExternalId: MIPS120003, contestId: 2, classYear: 10, section: P, birthDate: 2010-07-10
--- matchOrCreateParticipant START ---
contestId: 2 participantData: {
  schoolExternalId: 'MIPS120003',
  name: 'Alessandro',
  surname: 'Giordano',
  classYear: 10,
  section: 'P',
  birthDate: '2010-07-10'
}
GraphQL variables: {
  contestId: 2,
  schoolExternalId: 'MIPS120003',
  name: 'Alessandro',
  surname: 'Giordano',
  classYear: 10,
  section: 'P',
  birthDate: '2010-07-10'
}
GraphQL response: { data: { participants: { matchOrCreateParticipant: [Object] } } }
Result typename: ParticipantMatchSuccess
ParticipantMatchSuccess: {
  participantId: 232,
  competitorCreated: true,
  participantCreated: true
}
matchOrCreateParticipant result: {
  success: true,
  participant: { id: 232, competitor: { id: 236, name: 'Alessandro Giordano' } },
  competitorCreated: true,
  participantCreated: true,
  multipleCompetitorsMatched: false,
  input: {
    schoolExternalId: 'MIPS120003',
    name: 'Alessandro',
    surname: 'Giordano',
    classYear: 10,
    section: 'P',
    birthDate: '2010-07-10'
  }
}
  SUCCESS: participantId: 232, competitorCreated: true, participantCreated: true
{"success":true,"participant":{"id":232,"competitor":{"id":236,"name":"Alessandro Giordano"}},"competitorCreated":true,"participantCreated":true,"multipleCompetitorsMatched":false,"input":{"schoolExternalId":"MIPS120003","name":"Alessandro","surname":"Giordano","classYear":10,"section":"P","birthDate":"2010-07-10"}}
Updating row with participantId: 232
*/