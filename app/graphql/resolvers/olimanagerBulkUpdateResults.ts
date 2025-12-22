import { Context } from "../types";
import { check_admin, get_authenticated_user } from "./utils";
import { getRowsCollection, getSheetsCollection, getWorkbooksCollection } from "@/app/lib/mongodb";
import { Row, Sheet, Workbook } from "@/app/lib/models";
import { ObjectId } from "mongodb";
import { schemas } from "@/app/lib/schema";
import { OlimanagerApi } from "./olimanagerApi";
import { OlimanagerProblemResult } from "@/app/lib/schema/Competition";
import Competition from "@/app/lib/schema/Competition";

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

interface Message {
  message: string;
  kind: string;
}

export default async function olimanagerBulkUpdateResults(
  _: unknown,
  { 
    rowIds, 
    sheetIds,
    username, 
    password 
  }: { 
    rowIds?: ObjectId[]; 
    sheetIds?: ObjectId[];
    username?: string; 
    password: string 
  },
  context: Context
): Promise<boolean> {
    // 1) Autenticazione e autorizzazione (solo admin di sistema)
    const user = await get_authenticated_user(context);
    check_admin(user);

    // 2) Preparo collezioni MongoDB
    const rows = await getRowsCollection();
    const sheets = await getSheetsCollection();
    const workbooks = await getWorkbooksCollection();

    const remainingRowIds = rowIds ? [...rowIds] : [];
    const remainingSheetIds = sheetIds ? [...sheetIds] : [];

    console.log(`Inizio operazione di bulk update results. Righe iniziali: ${remainingRowIds.length}, Fogli iniziali: ${remainingSheetIds.length}`);

    while (remainingRowIds.length>0 || remainingSheetIds.length>0) {
      if (remainingRowIds.length > 0) {
        const batchRowIds = remainingRowIds.splice(0, 50);
        remainingRowIds.splice(0, batchRowIds.length);
        console.log(`Processing batch of ${batchRowIds.length} rows, remaining rows: ${remainingRowIds.length}`);
        await transferJob(batchRowIds);
      } else if (remainingSheetIds.length > 0) {
        const sheetId = remainingSheetIds.shift();
        console.log(`Processing sheet ${sheetId}, remaining sheets: ${remainingSheetIds.length}`);
        const ids = (await rows.find({ sheetId }).project({ _id: 1 }).toArray()).map(r => r._id) as ObjectId[];
        remainingRowIds.push(...ids);
      } else {
        throw new Error("Nessuna riga o foglio da processare.");
      }
    }

    console.log("Tutte le operazioni completate.");

    return true;

    async function transferJob(rowIds: ObjectId[]): Promise<boolean> {
      if (rowIds.length === 0) return true;

      // 3) Converto le righe in problemResults
      const allProblemResults: OlimanagerProblemResult[] = [];
      const allRowIds: ObjectId[] = [];
      const allSheetsSyncIncrement: Record<string, number> = {};
      let contestId: number | null = null;
      
      let cache: {
        sheet: Sheet;
        schema: Competition;
        workbook: Workbook;
      } | null = null ;

      async function cachedSheetData(sheetId: ObjectId) {
        if (cache && cache.sheet._id.equals(sheetId)) {
          return cache;
        }

        const sheet = await sheets.findOne({ _id: sheetId });
        if (!sheet) {
            throw new Error(`Foglio non trovato: ${sheetId}`);
        }

        const schema = schemas[sheet.schema];
        if (!schema) {
            throw new Error(`Schema non trovato per il foglio: ${sheet.schema}`);
        }

        if (!(schema instanceof Competition)) {
            throw new Error(`Non è una Competition: ${sheet.schema}`);
        }

        const workbook = await workbooks.findOne({ _id: sheet.workbookId });
        if (!workbook) {
            throw new Error(`Workbook non trovato: ${sheet.workbookId}`);
        }

        // Estrae il contestId dal workbook
        const sheetContestId = schema.get_contest_id(workbook.commonData);
        if (contestId === null) {
            contestId = sheetContestId;
        } else if (contestId !== sheetContestId) {
            throw new Error(`Le righe appartengono a contest diversi: ${contestId} vs ${sheetContestId}`);
        }

        cache = { sheet, schema, workbook };
        return cache;
      }

      async function pushRow(row: Row) {
        if (row.error) return; // Salta righe non valide

        const { sheet, schema, workbook } = await cachedSheetData(row.sheetId);

        // Converte la riga in problemResults (16 problemi)
        const problemResults: OlimanagerProblemResult[] = schema.extract_olimanager_results(row, sheet.commonData, workbook.commonData);

        // Sanity check...
        const score = problemResults.reduce((sum, pr) => sum + (pr.score || 0), 0);
        if (score !== parseInt(row.data.score || '-1', 10)) {
            throw new Error(`Incoerenza nel punteggio totale per la riga ${row._id}: somma dei punteggi problemi = ${score}, ma row.score = ${row.data.score}`);
        }

        allProblemResults.push(...problemResults);
        allRowIds.push(row._id);
        if (!row?.olimanager?.resultsUpdatedOn) {
          const key = row.sheetId.toString()
          allSheetsSyncIncrement[key] = (allSheetsSyncIncrement[key] || 0) + 1;
        }
      }

      for (const rowId of rowIds) {
          const row = await rows.findOne({ _id: rowId });
          if (!row) {
            throw new Error(`Riga non trovata: ${rowId}`);
          }
          await pushRow(row);
      }

      /*
      for (const sheetId of (sheetIds || [])) {
        const pusher = await makeRowPusherFunction(sheetId);
        const rowList = await rows.find({ sheetId: sheetId }).toArray();

        for (const row of rowList) {
          pusher(row);
        }
      }
      */

      if (contestId === null) {
          throw new Error("Nessun contestId trovato nelle righe");
      }

      // 4) Preparo il client Olimanager
      const api = new OlimanagerApi(username || user.email, password);
      await api.login();

      // 5) Eseguo la mutation su Olimanager
      const result = await bulkUpdateResults(api, contestId, allProblemResults);
      // console.log(JSON.stringify({result}, null, 2));

      // 6) Analizzo il risultato
      const data = result?.data?.participants?.bulkUpdateResults;
      const typename = data?.__typename;

      if (typename === "BulkUpdateResultsSuccess") {
          console.log(`✅ Operazione completata con successo. Righe aggiornate: ${allRowIds.length}`);
          rows.updateMany(
              { _id: { $in: allRowIds } },
              { $set: { 'olimanager.resultsUpdatedOn': new Date() } })
          for (const [sheetIdStr, increment] of Object.entries(allSheetsSyncIncrement)) {
            const sheetId = new ObjectId(sheetIdStr);
            sheets.updateOne(
              { _id: sheetId },
              { $inc: { nSyncedRows: increment } }
            );
          }
          return true;
      } else if (typename === "OperationInfo") {
          const messages = data?.messages || [];
          console.log("❌ Operazione fallita:");
          messages.forEach((msg: Message) => {
              console.log(`  [${msg.kind}] ${msg.message}`);
          });
          throw new Error(`Operazione fallita con ${messages.length} messaggi di errore (vedi log di sistema).`);
      } else {
          console.log(`⚠️  Risposta inattesa: ${typename}`);
          throw new Error(`Operazione fallita: risposta inattesa (${typename})`);
      }
  }
}

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
  problemResults: OlimanagerProblemResult[]
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


