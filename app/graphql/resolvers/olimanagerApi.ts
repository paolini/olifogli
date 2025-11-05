/**
 * Client API per comunicare con il server GraphQL di Olimanager.
 * 
 * Gestisce:
 * - Autenticazione con email e password
 * - Gestione dei cookie di sessione e CSRF token
 * - Esecuzione di query e mutation GraphQL
 */

// Usa la fetch built-in di Node 18+ (undici)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fetch = global.fetch || require('node-fetch');

export class OlimanagerApi {
  endpoint: string;
  EMAIL: string;
  PASSWORD: string;
  cookies: Record<string, string>;
  headers: Record<string, string>;
  EDITION?: string;

  constructor(email: string, password: string) {
    this.endpoint = process.env.OLI_GRAPHQL_ENDPOINT || ''; // example: 'https://staging.olimpiadi-scientifiche.it/graphql/';
    this.EMAIL = email;
    this.PASSWORD = password;

    this.cookies = {}; // cookieName -> value
    this.headers = { 'Content-Type': 'application/json' };

    process.stderr.write(`Using endpoint: ${this.endpoint}\n`);
  }

  // Estrae i cookie da un array di header Set-Cookie
  static parseSetCookie(setCookieArray: (string | null)[]) {
    const jar: Record<string, string> = {};
    (setCookieArray || []).forEach((c: string | null) => {
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
  async rawRequest(body: unknown) {
    // Se non abbiamo ancora un csrftoken, effettuiamo una primissima chiamata per riceverlo
    if (!this.cookies.csrftoken) {
      process.stderr.write('Creating session\n');
      const r0 = await fetch(this.endpoint, { method: 'POST' });
      const setCookies = typeof r0.headers.getSetCookie === 'function'
        ? r0.headers.getSetCookie()
        : (r0.headers.get('set-cookie') ? [r0.headers.get('set-cookie')] : []);
      Object.assign(this.cookies, OlimanagerApi.parseSetCookie(setCookies));
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
    const parsed = OlimanagerApi.parseSetCookie(setCookies);
    Object.assign(this.cookies, parsed);
    if (this.cookies.csrftoken) {
      this.headers['X-CsrfToken'] = this.cookies.csrftoken;
    }

    const text = await resp.text();
    let json;
    try { 
      json = text ? JSON.parse(text) : {}; 
    } catch (e) { 
      json = { parseError: (e as Error).message, raw: text }; 
    }

    if (resp.status !== 200) {
      process.stderr.write(JSON.stringify(json, null, 2) + '\n');
      throw new Error(`Query failed to run with a ${resp.status}.`);
    }
    return json;
  }

  async query(query: string, vars: Record<string, unknown> = {}) {
    const variables = this.EDITION ? { ...vars, EDITION: this.EDITION } : vars;
    return this.rawRequest({ query, variables });
  }

  async login() {
    process.stderr.write('Logging in\n');
    if (!this.EMAIL) {
      throw new Error('Email non specificata!');
    }
    if (!this.PASSWORD) {
      throw new Error('Password non specificata!');
    }
    const r = await this.query(
      `mutation ($EMAIL: String!, $PASSWORD: String!) {
        users{
          login(email: $EMAIL, password: $PASSWORD){
            __typename
            ...on OperationInfo{
              messages{
                message
                kind
              }
            }
            ...on LoginSuccess{
              user{
                email
              }
            }
          }
        }
      }`,
      { EMAIL: this.EMAIL, PASSWORD: this.PASSWORD }
    );
    const login = r?.data?.users?.login;
    const typename = login?.__typename;
    if (typename === 'OperationInfo') {
      const msg = (login.messages || []).map((x: { message: string }) => x.message).join(', ');
      throw new Error('OperationInfo: ' + msg);
    }
    return r;
  }
}
