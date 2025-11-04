// @ts-nocheck
import { Context } from "../types";
import { check_admin, get_authenticated_user } from "./utils";
import { getRowsCollection, getSheetsCollection, getWorkbooksCollection } from "@/app/lib/mongodb";

// Nota: in fondo al file esistono classi/funzioni di supporto (Api, matchOrCreateParticipant)
// riutilizzate qui per chiamare l'endpoint GraphQL di Olimanager.

export default async function olimanagerCreateParticipant(
  _: unknown,
  { rowIds, password }: { rowIds: any[]; password: string },
  context: Context
): Promise<boolean[]> {
  // 1) Autenticazione e autorizzazione (solo admin di sistema)
  const user = await get_authenticated_user(context)
  check_admin(user)

  // 2) Preparo collezioni e client Olimanager una sola volta
  const rows = await getRowsCollection()
  const sheets = await getSheetsCollection()
  const workbooks = await getWorkbooksCollection()

  const api = new Api(user.email, password)
  await api.login()

  const results: boolean[] = []

  for (const rowId of rowIds) {
    try {
      const row = await rows.findOne({ _id: rowId })
      if (!row) throw new Error(`Riga non trovata: ${rowId}`)

      const sheet = await sheets.findOne({ _id: row.sheetId })
      if (!sheet) throw new Error(`Foglio non trovato per la riga: ${row.sheetId}`)
      const schema = schemas[sheet.schema]
      if (!schema) throw new Error(`Schema non trovato per il foglio: ${sheet.schema}`)

      const workbook = await workbooks.findOne({ _id: sheet.workbookId })
      if (!workbook) throw new Error(`Workbook non trovato: ${sheet.workbookId}`)

      const contestId = schema.get_contest_id(workbook.commonData)
      const schoolExternalId = schema.get_school_external_id(sheet.commonData)

      const name = row.data.name
      const surname = row.data.surname
      const classYearStr = row.data.classYear
      const section = row.data.classSection
      const birthDate = row.data.birthDate

      const classYear = parseInt(classYearStr || '0', 10) + 8 // Converto da anno di corso (1-5) a anno scolastico (9-13)

      const result = await matchOrCreateParticipant(api, contestId, {
        schoolExternalId,
        name,
        surname,
        classYear,
        section,
        birthDate,
      })

      if (result?.success) {
        const participantId = result?.participant?.id ?? undefined
        await rows.updateOne(
          { _id: rowId },
          {
            $set: {
              'olimanager.participantId': participantId,
              'olimanager.createdParticipantOn': new Date(),
              'olimanager.error': '',
              'olimanager.result': result,
            },
          }
        )
        results.push(true)
      } else {
        const errorMsg = typeof result?.error === 'string' ? result?.error : JSON.stringify(result?.error || result?.messages || 'unknown error')
        await rows.updateOne(
          { _id: rowId },
          {
            $set: {
              'olimanager.error': errorMsg,
              'olimanager.result': result,
            },
          }
        )
        results.push(false)
      }
    } catch (e) {
      await rows.updateOne(
        { _id: rowId },
        {
          $set: {
            'olimanager.error': String(e?.message || e)
          },
        }
      )
      results.push(false)
    }
  }

  return results
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

// Usa la fetch built-in di Node 18+ (undici)
const fetch = global.fetch || require('node-fetch');

class Api {
  constructor(email: string, password:string) {
    this.endpoint = process.env.OLI_GRAPHQL_ENDPOINT // example: 'https://staging.olimpiadi-scientifiche.it/graphql/';
    this.EMAIL = email;
    this.PASSWORD = password;

    this.cookies = {}; // cookieName -> value
    this.headers = { 'Content-Type': 'application/json' };

    process.stderr.write(`Using endpoint: ${this.endpoint}\n`);
  }

  // Estrae i cookie da un array di header Set-Cookie
  static parseSetCookie(setCookieArray) {
    const jar = {};
    (setCookieArray || []).forEach((c) => {
      if (!c) return;
      const parts = c.split(';');
      if (parts.length > 0) {
        const [name, ...rest] = parts[0].split('=');
        const value = rest.join('=');
        if (name && value) jar[name.trim()] = value.trim();
      }
    });
    return jar;
  }

  // Converte i cookie in header "Cookie"
  cookieHeader() {
    const entries = Object.entries(this.cookies).filter(([k, v]) => k && v);
    return entries.map(([k, v]) => `${k}=${v}`).join('; ');
  }

  // Effettua una richiesta grezza, mantenendo il jar dei cookie e il token CSRF
  async rawRequest(body) {
    // Se non abbiamo ancora un csrftoken, effettuiamo una primissima chiamata per riceverlo
    if (!this.cookies.csrftoken) {
      process.stderr.write('Creating session\n');
      const r0 = await fetch(this.endpoint, { method: 'POST' });
      const setCookies = typeof r0.headers.getSetCookie === 'function'
        ? r0.headers.getSetCookie()
        : (r0.headers.get('set-cookie') ? [r0.headers.get('set-cookie')] : []);
      Object.assign(this.cookies, Api.parseSetCookie(setCookies));
      if (this.cookies.csrftoken) {
        this.headers['X-CsrfToken'] = this.cookies.csrftoken;
      }
    }

    const headers = { ...this.headers };
    const cookieStr = this.cookieHeader();
    if (cookieStr) headers['Cookie'] = cookieStr;

    const resp = await fetch(this.endpoint, {
      method: 'POST',
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    // Aggiorna eventuali cookie e csrf
    const setCookies = typeof resp.headers.getSetCookie === 'function'
      ? resp.headers.getSetCookie()
      : (resp.headers.get('set-cookie') ? [resp.headers.get('set-cookie')] : []);
    const parsed = Api.parseSetCookie(setCookies);
    Object.assign(this.cookies, parsed);
    if (this.cookies.csrftoken) {
      this.headers['X-CsrfToken'] = this.cookies.csrftoken;
    }

    const text = await resp.text();
    let json;
    try { json = text ? JSON.parse(text) : {}; } catch (e) { json = { parseError: e.message, raw: text }; }

    if (resp.status !== 200) {
      process.stderr.write(JSON.stringify(json, null, 2) + '\n');
      throw new Error(`Query failed to run with a ${resp.status}.`);
    }
    return json;
  }

  async query(query, vars = {}) {
    const variables = this.EDITION ? { ...vars, EDITION: this.EDITION } : vars;
    return this.rawRequest({ query, variables });
  }

  async login() {
    process.stderr.write('Logging in\n');
    if (!this.EMAIL) {
      throw new Error('Email non specificata!\nPer risolvere:\nesportare OLI_EMAIL=my-email');
    }
    if (!this.PASSWORD) {
      throw new Error('Password non specificata!\nPer risolvere:\nesportare OLI_PASSWORD=my-secret-password');
    }
    const r = await this.query(
      `mutation ($EMAIL: String!, $PASSWORD: String!) {\n        users{\n          login(email: $EMAIL, password: $PASSWORD){\n            __typename\n            ...on OperationInfo{\n              messages{\n                message\n                kind\n              }\n            }\n            ...on LoginSuccess{\n              user{\n                email\n              }\n            }\n          }\n        }\n      }`,
      { EMAIL: this.EMAIL, PASSWORD: this.PASSWORD }
    );
    const login = r?.data?.users?.login;
    const typename = login?.__typename;
    if (typename === 'OperationInfo') {
      const msg = (login.messages || []).map((x) => x.message).join(', ');
      throw new Error('OperationInfo: ' + msg);
    }
    return r;
  }
}

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

async function matchOrCreateParticipant(api, contestId, participantData) {
  try {
    const variables = {
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

    const response = await api.query(mutation_match_or_create, variables);

    if (response.errors) {
      return { success: false, error: response.errors, input: participantData };
    }

    const result = response?.data?.participants?.matchOrCreateParticipant;
    const typename = result?.__typename;

    if (typename === 'OperationInfo') {
      return { success: false, messages: result.messages, input: participantData };
    } else if (typename === 'ParticipantMatchSuccess') {
      return {
        success: true,
        participant: result.participant,
        competitorCreated: result.competitorCreated,
        participantCreated: result.participantCreated,
        multipleCompetitorsMatched: result.multipleCompetitorsMatched,
        input: participantData,
      };
    }

    return { success: false, error: `Unknown typename: ${typename}` , input: participantData };
  } catch (e) {
    return { success: false, error: String(e && e.message ? e.message : e), input: participantData };
  }
}
