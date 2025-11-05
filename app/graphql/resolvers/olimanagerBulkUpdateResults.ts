import { Context } from "../types";
import { check_admin, get_authenticated_user } from "./utils";
import { getRowsCollection, getSheetsCollection, getWorkbooksCollection } from "@/app/lib/mongodb";
import { ObjectId } from "mongodb";
import { schemas } from "@/app/lib/schema";
import { OlimanagerApi } from "./olimanagerApi";

/**
 * Resolver GraphQL per aggiornare in batch i risultati dei partecipanti a un contest.
 * 
 * Questo resolver prende una lista di rowIds, estrae i dati dalle righe e li invia
 * al server Olimanager per aggiornare i risultati di 16 problemi per ogni partecipante.
 * 
 * Esempio di utilizzo nella mutation GraphQL:
 * ```
 * mutation {
 *   olimanagerBulkUpdateResults(
 *     rowIds: ["507f1f77bcf86cd799439011", "507f1f77bcf86cd799439012"]
 *     username: "admin@example.com"
 *     password: "password"
 *   )
 * }
 * ```
 */

export default async function olimanagerBulkUpdateResults(
  _: unknown,
  { 
    rowIds, 
    username, 
    password 
  }: { 
    rowIds: ObjectId[]; 
    username?: string; 
    password: string 
  },
  context: Context
): Promise<BulkUpdateResultsResponse> {
  // 1) Autenticazione e autorizzazione (solo admin di sistema)
  const user = await get_authenticated_user(context);
  check_admin(user);

  // 2) Preparo collezioni MongoDB
  const rows = await getRowsCollection();
  const sheets = await getSheetsCollection();
  const workbooks = await getWorkbooksCollection();

  // 3) Preparo il client Olimanager
  const api = new OlimanagerApi(username || user.email, password);
  await api.login();

  console.log(`Aggiornamento bulk risultati per ${rowIds.length} righe`);

  try {
    // 4) Converto le righe in problemResults
    const allProblemResults: ProblemResult[] = [];
    let contestId: number | null = null;

    for (const rowId of rowIds) {
      const row = await rows.findOne({ _id: rowId });
      if (!row) {
        console.warn(`Riga non trovata: ${rowId}`);
        continue;
      }

      const sheet = await sheets.findOne({ _id: row.sheetId });
      if (!sheet) {
        console.warn(`Foglio non trovato per la riga: ${row.sheetId}`);
        continue;
      }

      const schema = schemas[sheet.schema];
      if (!schema) {
        console.warn(`Schema non trovato per il foglio: ${sheet.schema}`);
        continue;
      }

      const workbook = await workbooks.findOne({ _id: sheet.workbookId });
      if (!workbook) {
        console.warn(`Workbook non trovato: ${sheet.workbookId}`);
        continue;
      }

      // Estrae il contestId dal workbook
      const rowContestId = schema.get_contest_id(workbook.commonData);
      if (contestId === null) {
        contestId = rowContestId;
      } else if (contestId !== rowContestId) {
        throw new Error(`Le righe appartengono a contest diversi: ${contestId} vs ${rowContestId}`);
      }

      // Converte la riga in problemResults (16 problemi)
      const problemResults = convertRowToProblemResults(row, sheet, workbook, schema);
      allProblemResults.push(...problemResults);
    }

    if (contestId === null) {
      throw new Error("Nessun contestId trovato nelle righe");
    }

    console.log(`Contest ID: ${contestId}`);
    console.log(`Numero totale di risultati da aggiornare: ${allProblemResults.length}`);

    // 5) Eseguo la mutation su Olimanager
    const result = await bulkUpdateResults(api, contestId, allProblemResults);

    // 6) Analizzo il risultato
    const data = result?.data?.participants?.bulkUpdateResults;
    const typename = data?.__typename;

    if (typename === "BulkUpdateResultsSuccess") {
      console.log("✅ Aggiornamento completato con successo!");
      return {
        success: true,
        typename,
        data: result
      };
    } else if (typename === "OperationInfo") {
      const messages = data?.messages || [];
      console.log("❌ Operazione fallita:");
      messages.forEach((msg: Message) => {
        console.log(`  [${msg.kind}] ${msg.message}`);
      });
      return {
        success: false,
        typename,
        messages,
        data: result
      };
    } else {
      console.log(`⚠️  Risposta inattesa: ${typename}`);
      return {
        success: false,
        typename: typename || "Unknown",
        error: `Risposta inattesa: ${typename}`,
        data: result
      };
    }
  } catch (e) {
    console.error("❌ Errore durante l'aggiornamento bulk:", e);
    return {
      success: false,
      error: String((e as Error)?.message || e),
      data: null
    };
  }
}

// ============================================================================
// FUNZIONE DI CONVERSIONE DA ROW A PROBLEM RESULTS
// ============================================================================

/**
 * Converte una riga in un array di ProblemResult (uno per ogni problema, tipicamente 16).
 * 
 * TODO: Implementare la logica per estrarre i dati dalla riga e creare i problemResults.
 * La riga dovrebbe contenere:
 * - participantId (da row.olimanager.participantId)
 * - punteggi per 16 problemi (da row.data.problem_0, problem_1, ..., problem_15 o simile)
 * - eventualmente un flag disqualified
 * 
 * @param row - La riga dal database
 * @param sheet - Il foglio associato
 * @param workbook - Il workbook associato
 * @param schema - Lo schema del foglio
 * @returns Array di ProblemResult (uno per ogni problema)
 */
function convertRowToProblemResults(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  row: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
  sheet: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
  workbook: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
  schema: any
): ProblemResult[] {
  // TODO: Implementare la conversione
  
  // Esempio di struttura attesa:
  // const participantId = row.olimanager?.participantId;
  // if (!participantId) {
  //   console.warn(`participantId mancante per la riga ${row._id}`);
  //   return [];
  // }
  
  // const problemResults: ProblemResult[] = [];
  // for (let i = 0; i < 16; i++) {
  //   const score = row.data[`problem_${i}`]; // o la chiave corretta
  //   problemResults.push({
  //     participantId: Number(participantId),
  //     problemIndex: i,
  //     score: score !== null && score !== undefined ? Number(score) : null,
  //     disqualified: Boolean(row.data.disqualified || false)
  //   });
  // }
  // return problemResults;
  
  console.warn(`TODO: Implementare convertRowToProblemResults per la riga ${row._id}`);
  return [];
}

// ============================================================================
// TIPI E INTERFACCE
// ============================================================================

interface ProblemResult {
  participantId: number;
  problemIndex: number;
  score: number | null;
  disqualified: boolean;
}

interface Message {
  message: string;
  kind: string;
}

interface BulkUpdateResultsResponse {
  success: boolean;
  typename?: string;
  messages?: Message[];
  error?: string;
  data: unknown;
}

// ============================================================================
// MUTATION PER AGGIORNARE I RISULTATI IN BATCH
// ============================================================================

const BULK_UPDATE_RESULTS_MUTATION = `
mutation BulkUpdateResults($contestId: Int!, $problemResults: [ParticipantProblemResultInput!]!) {
  participants {
    bulkUpdateResults(contestId: $contestId, problemResults: $problemResults) {
      __typename
      ... on BulkUpdateResultsSuccess {
        nothing
      }
      ... on OperationInfo {
        messages {
          message
          kind
        }
      }
    }
  }
}
`;

async function bulkUpdateResults(
  api: OlimanagerApi,
  contestId: number,
  problemResults: ProblemResult[]
) {
  try {
    const variables = {
      contestId: Number(contestId),
      problemResults: problemResults.map(pr => ({
        participantId: Number(pr.participantId),
        problemIndex: Number(pr.problemIndex),
        score: pr.score !== null ? Number(pr.score) : null,
        disqualified: Boolean(pr.disqualified)
      }))
    };

    const response = await api.query(BULK_UPDATE_RESULTS_MUTATION, variables);

    if (response.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(response.errors)}`);
    }

    return response;
  } catch (e) {
    throw new Error(`Errore durante bulkUpdateResults: ${(e as Error)?.message || e}`);
  }
}


