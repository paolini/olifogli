#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { parseArgs } = require('node:util');
const { setTimeout: delay } = require('node:timers/promises');
const dotenv = require('dotenv');
const { parse } = require('parse5');

const DEFAULT_URL = 'https://staging.olimpiadi-scientifiche.it';
const CALLBACK_PATH = '/api/auth/callback/olimanager';
const one = (fields, name) => fields[name]?.[0] ?? '';
const slashless = (value = '') => value.replace(/\/+$/, '');

function loadProjectEnv(filename = '.env', env = process.env) {
  const result = dotenv.config({ path: filename, override: false, processEnv: env, quiet: true });
  if (result.error && result.error.code !== 'ENOENT') throw new Error('Impossibile leggere il file .env.');
  return { ...env };
}

function verifyOauthSecret(secret, encoded) {
  const [algorithm, rounds, salt, digest, extra] = encoded.split('$');
  const hash = { pbkdf2_sha256: 'sha256', pbkdf2_sha1: 'sha1' }[algorithm];
  if (!hash || !/^\d+$/.test(rounds) || Number(rounds) < 1 || !salt || !digest || extra !== undefined) {
    throw new Error('Hash del client secret non supportato: impossibile verificarlo senza cambiare credenziali.');
  }
  const actual = crypto.pbkdf2Sync(secret, salt, Number(rounds), hash === 'sha256' ? 32 : 20, hash);
  const expected = Buffer.from(digest, 'base64');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function printEnvChanges(expected, actual, log = console.log) {
  const changes = Object.entries(expected).filter(([key, value]) => actual[key] !== value);
  if (!changes.length) return log('Client OAuth ed endpoint corrispondono alla configurazione locale.');
  log('Configurazione locale diversa. Copiare queste righe in .env, poi riavviare Olifogli:');
  for (const [key, value] of changes) log(`${key}=${JSON.stringify(value)}`);
  log('Le variabili già esportate nella shell hanno precedenza su .env: aggiornare anche quelle, se presenti.');
}

const attr = (node, name) => node.attrs?.find((item) => item.name === name)?.value;
function* elements(node, tag) {
  for (const child of node.childNodes || []) {
    if (child.tagName && (!tag || child.tagName === tag)) yield child;
    yield* elements(child, tag);
  }
}
const text = (node) => node.nodeName === '#text' ? node.value : (node.childNodes || []).map(text).join('');

function adminForm(html) {
  const form = [...elements(parse(html), 'form')].find((node) => attr(node, 'id')?.endsWith('_form'));
  if (!form) throw new Error('Modulo Django non trovato: permessi insufficienti o sessione scaduta.');
  const fields = {};
  for (const node of elements(form)) {
    const name = attr(node, 'name');
    if (!name || attr(node, 'disabled') !== undefined) continue;
    if (node.tagName === 'input') {
      const kind = attr(node, 'type') || 'text';
      if (['submit', 'button', 'file', 'reset'].includes(kind)) continue;
      fields[name] ??= [];
      if (['checkbox', 'radio'].includes(kind) && attr(node, 'checked') === undefined) continue;
      fields[name].push(attr(node, 'value') ?? (kind === 'checkbox' ? 'on' : ''));
    } else if (node.tagName === 'textarea') {
      fields[name] = [text(node)];
    } else if (node.tagName === 'select') {
      const options = [...elements(node, 'option')].filter((item) => attr(item, 'disabled') === undefined);
      let selected = options.filter((item) => attr(item, 'selected') !== undefined);
      if (!selected.length && attr(node, 'multiple') === undefined) selected = options.slice(0, 1);
      fields[name] = selected.map((item) => attr(item, 'value') ?? text(item));
    }
  }
  return fields;
}

function setFields(fields, values) {
  for (const [name, value] of Object.entries(values)) {
    if (!Object.hasOwn(fields, name)) throw new Error(`Campo Django inatteso o non modificabile: ${name}`);
    fields[name] = value === false || value == null ? [] : value === true ? ['on'] :
      Array.isArray(value) ? value.map(String) : [String(value)];
  }
  return fields;
}

function runCurl(args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn('curl', args, { stdio: ['pipe', 'pipe', 'pipe'], shell: false });
    let stdout = '';
    // Do not forward stderr: credentials must never leak through transport errors.
    child.stderr.resume();
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (part) => { stdout += part; });
    child.on('error', () => reject(new Error('Impossibile avviare curl: verificare che sia installato.')));
    child.on('close', (code) => code === 0 ? resolve(stdout) : reject(new Error(`Connessione a Olimanager fallita (curl ${code}).`)));
    child.stdin.on('error', () => {});
    child.stdin.end(input ?? undefined);
  });
}

class Olimanager {
  constructor(cookies, origin = DEFAULT_URL, { run = runCurl, wait = delay, now = () => performance.now(), log = console.log } = {}) {
    let parsed;
    try { parsed = new URL(origin); } catch { throw new Error('URL di base Olimanager non valido.'); }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password ||
        parsed.search || parsed.hash || parsed.pathname !== '/') {
      throw new Error('Specificare un URL di base HTTP/HTTPS, senza percorso o credenziali.');
    }
    this.origin = parsed.origin;
    this.cookies = cookies;
    this.run = run;
    this.wait = wait;
    this.now = now;
    this.log = log;
    this.lastAdminRequest = null;
    this.addForms = new Map();
  }

  async request(target, data = null, graphql = false) {
    const url = new URL(target, this.origin + '/');
    if (url.origin !== this.origin) throw new Error('La richiesta deve restare sull’istanza Olimanager configurata.');
    if (url.pathname.startsWith('/admin/')) {
      // Django admin is limited to one request per second by Olimanager's nginx.
      if (this.lastAdminRequest !== null) {
        const remaining = 1000 - (this.now() - this.lastAdminRequest);
        if (remaining > 0) await this.wait(remaining);
      }
      this.lastAdminRequest = this.now();
    }
    const args = ['--silent', '--show-error', '--max-time', '45', '--cookie', this.cookies,
      '--cookie-jar', this.cookies, '--write-out', '\n%{http_code}', url.href];
    let input;
    if (data !== null) {
      const csrf = fs.readFileSync(this.cookies, 'utf8').split('\n').find((line) => line.includes('\tcsrftoken\t'))?.split('\t').at(-1) || '';
      args.push('-H', `X-CSRFToken: ${csrf}`, '-H', `Referer: ${this.origin}/`, '-H', `Origin: ${this.origin}`,
        '-H', graphql ? 'Content-Type: application/json' : 'Content-Type: application/x-www-form-urlencoded', '--data-binary', '@-');
      if (graphql) input = JSON.stringify(data);
      else {
        const form = new URLSearchParams();
        for (const [key, values] of Object.entries(data)) for (const value of (Array.isArray(values) ? values : [values])) form.append(key, value);
        input = form.toString();
      }
    }
    const output = await this.run(args, input);
    const separator = output.lastIndexOf('\n');
    const status = Number(output.slice(separator + 1));
    if (![200, 302, 303].includes(status)) throw new Error(`HTTP ${status} su ${url.pathname}`);
    return [status, output.slice(0, separator)];
  }

  async graphql(query, variables = {}) {
    const [, body] = await this.request('/graphql/', { query, variables }, true);
    const result = JSON.parse(body);
    if (result.errors) throw new Error('Errori GraphQL: ' + result.errors.map((error) => error.message).join('; '));
    return result.data;
  }

  async login(email, password) {
    await this.request('/admin/login/');
    const result = await this.graphql(`mutation($email:String!,$password:String!){users{
      login(email:$email,password:$password){__typename ... on LoginSuccess {user{id isStaff}}
        ... on OperationInfo {messages{message}}}}}`, { email, password });
    const login = result.users.login;
    if (login.__typename !== 'LoginSuccess' || !login.user.isStaff) throw new Error('Login fallito o account privo dei permessi di amministrazione.');
    return String(login.user.id);
  }

  async find(model, filters, first = false) {
    const [, html] = await this.request(`/admin/${model}/?${new URLSearchParams(filters)}`);
    const nodes = [...elements(parse(html))];
    const table = nodes.find((node) => node.tagName === 'table' && attr(node, 'id') === 'result_list');
    if (!table) {
      if (nodes.some((node) => attr(node, 'id') === 'login-form')) throw new Error('Sessione admin scaduta.');
      if (!nodes.some((node) => attr(node, 'id') === 'changelist')) throw new Error(`Elenco admin non riconosciuto: ${model}`);
      return null;
    }
    const base = `/admin/${model}/`;
    const ids = new Set();
    for (const link of elements(table, 'a')) {
      const url = new URL(attr(link, 'href') || '', this.origin + base);
      if (url.origin !== this.origin || !url.pathname.startsWith(base)) continue;
      const match = url.pathname.slice(base.length).match(/^([^/]+)\/change\/$/);
      if (match) ids.add(match[1]);
    }
    if (ids.size > 1 && !first) throw new Error(`Più oggetti corrispondono al filtro per ${model}: intervento manuale necessario.`);
    return [...ids].sort((a, b) => a.length - b.length || a.localeCompare(b))[0] ?? null;
  }

  async fields(model, pk = null) {
    if (pk === null && this.addForms.has(model)) return structuredClone(this.addForms.get(model));
    const [, html] = await this.request(`/admin/${model}/${pk === null ? 'add' : pk + '/change'}/`);
    const fields = adminForm(html);
    if (pk === null) this.addForms.set(model, structuredClone(fields));
    return fields;
  }

  async ensure(model, filters, values, apply) {
    let pk = await this.find(model, filters);
    if (pk) { this.log(`Riutilizzo ${model}: ${pk}`); return pk; }
    const fields = setFields(await this.fields(model), values);
    this.log(`${apply ? 'Creo' : 'Da creare'} ${model}`);
    if (!apply) return null;
    fields._save = ['Save'];
    const [status, html] = await this.request(`/admin/${model}/add/`, fields);
    if (status === 200) {
      const errors = [...elements(parse(html))].filter((node) => (attr(node, 'class') || '').split(/\s+/).includes('errorlist')).map((node) => text(node).trim());
      throw new Error(`Creazione ${model} rifiutata: ${errors.join('; ') || 'controllare il modulo admin'}`);
    }
    pk = await this.find(model, filters);
    if (!pk) throw new Error(`Oggetto ${model} non trovato dopo la creazione.`);
    return pk;
  }
}

function isoDate(value) {
  if (!value) return null;
  const parts = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const iso = parts ? `${parts[3]}-${parts[2]}-${parts[1]}` : value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !Number.isFinite(Date.parse(iso)) || new Date(iso).toISOString().slice(0, 10) !== iso) {
    throw new Error('Formato della data di nascita non riconosciuto.');
  }
  return iso;
}

function mutationResult(data, group, field, success) {
  const result = data[group][field];
  if (result.__typename !== success) throw new Error(`${field}: ${(result.messages || []).map((item) => item.message).join('; ')}`);
  return result;
}

async function setupOauth(api, args, adminId, log = console.log) {
  const model = 'oauth2_provider/application';
  const callback = new URL(args.oauthRedirectUri);
  if (!['http:', 'https:'].includes(callback.protocol) || callback.username || callback.password || callback.search || callback.hash || !callback.pathname.endsWith(CALLBACK_PATH)) {
    throw new Error(`Callback OAuth non valido: usare un URL HTTP/HTTPS che termina con ${CALLBACK_PATH}.`);
  }
  const nextauthUrl = args.oauthRedirectUri.slice(0, -CALLBACK_PATH.length);
  const local = args.localConfig || {};
  const expectedEnv = { OLIMANAGER_URL: api.origin, OLIMANAGER_GRAPHQL_ENDPOINT: api.origin + '/graphql/',
    NEXTAUTH_URL: nextauthUrl };
  let pk = await api.find(model, { name__exact: args.oauthName });
  let clientId = null;
  let secret = null;
  let changed = false;
  if (pk) {
    const fields = await api.fields(model, pk);
    const required = { client_type: 'confidential', authorization_grant_type: 'authorization-code', algorithm: 'RS256' };
    if (Object.entries(required).some(([key, value]) => one(fields, key) !== value) ||
        !one(fields, 'redirect_uris').split(/\s+/).includes(args.oauthRedirectUri) ||
        fields.skip_authorization?.length || !fields.hash_client_secret?.length) {
      throw new Error('Applicazione OAuth esistente incompatibile: controllare callback, flusso, RS256, consenso e hash del secret. Nessuna modifica applicata.');
    }
    clientId = one(fields, 'client_id');
    log(`Riutilizzo applicazione OAuth: ${pk}`);
    if (args.oauthRegenerateSecret) {
      if (args.apply) {
        secret = crypto.randomBytes(48).toString('base64url');
        setFields(fields, { client_secret: secret });
        fields._save = ['Save'];
        try {
          const [status] = await api.request(`/admin/${model}/${pk}/change/`, fields);
          if (status === 200) throw new Error('Il modulo admin ha rifiutato la modifica.');
        } catch (error) {
          printEnvChanges({ ...expectedEnv, OLIMANAGER_OAUTH_CLIENT_ID: clientId, OLIMANAGER_OAUTH_CLIENT_SECRET: secret }, local, log);
          throw new Error(`Rigenerazione OAuth non confermata: ${error.message} Conservare l’output e verificare lo stato sul server.`);
        }
        changed = true;
        log('Secret OAuth rigenerato: il precedente non è più valido.');
      } else log('Da rigenerare il secret OAuth (richiede --apply).');
    }
    if (!secret && local.OLIMANAGER_OAUTH_CLIENT_ID === clientId && local.OLIMANAGER_OAUTH_CLIENT_SECRET &&
        verifyOauthSecret(local.OLIMANAGER_OAUTH_CLIENT_SECRET, one(fields, 'client_secret'))) secret = local.OLIMANAGER_OAUTH_CLIENT_SECRET;
    if (!secret && !args.oauthRegenerateSecret) log('Secret locale mancante o non valido. Il server conserva solo l’hash: usare --oauth-regenerate-secret --apply per rigenerarlo.');
  } else {
    const reuseLocal = !args.oauthRegenerateSecret && slashless(local.OLIMANAGER_URL) === api.origin && slashless(local.NEXTAUTH_URL) === nextauthUrl &&
      local.OLIMANAGER_OAUTH_CLIENT_ID && local.OLIMANAGER_OAUTH_CLIENT_SECRET;
    const proposedId = reuseLocal ? local.OLIMANAGER_OAUTH_CLIENT_ID : crypto.randomBytes(32).toString('base64url');
    const proposedSecret = reuseLocal ? local.OLIMANAGER_OAUTH_CLIENT_SECRET : crypto.randomBytes(48).toString('base64url');
    const values = { name: args.oauthName, user: adminId, redirect_uris: args.oauthRedirectUri, client_type: 'confidential',
      authorization_grant_type: 'authorization-code', algorithm: 'RS256', skip_authorization: false, hash_client_secret: true,
      client_id: proposedId, client_secret: proposedSecret };
    try { pk = await api.ensure(model, { name__exact: args.oauthName }, values, args.apply); }
    catch (error) {
      if (args.apply) printEnvChanges({ ...expectedEnv, OLIMANAGER_OAUTH_CLIENT_ID: proposedId, OLIMANAGER_OAUTH_CLIENT_SECRET: proposedSecret }, local, log);
      throw new Error(`Creazione OAuth non confermata: ${error.message} Conservare l’output e verificare lo stato sul server.`);
    }
    if (args.apply) { clientId = proposedId; secret = proposedSecret; changed = true; }
  }
  if (changed) {
    try {
      const saved = await api.fields(model, pk);
      if (one(saved, 'client_id') !== clientId || !verifyOauthSecret(secret, one(saved, 'client_secret'))) {
        throw new Error('Le credenziali sul server non corrispondono a quelle proposte.');
      }
    } catch (error) {
      printEnvChanges({ ...expectedEnv, OLIMANAGER_OAUTH_CLIENT_ID: clientId, OLIMANAGER_OAUTH_CLIENT_SECRET: secret }, local, log);
      throw new Error(`Verifica OAuth non completata: ${error.message} Conservare l’output e verificare lo stato sul server.`);
    }
  }
  if (pk) {
    expectedEnv.OLIMANAGER_OAUTH_CLIENT_ID = clientId;
    if (secret) expectedEnv.OLIMANAGER_OAUTH_CLIENT_SECRET = secret;
    printEnvChanges(expectedEnv, local, log);
  }
  return { applicationId: pk, name: args.oauthName, redirectUri: args.oauthRedirectUri, clientId, credentialsAvailable: secret !== null };
}

async function archimedeContests(api, args, editionId, schoolId, school, teacherUserId) {
  const teacher = await api.fields('users/user', teacherUserId);
  const contests = {};
  for (const [category, variant] of [['biennio', '2'], ['triennio', '3']]) {
    const name = `Archimede ${category[0].toUpperCase() + category.slice(1)} — test Olifogli ${args.year}`;
    const contestId = await api.ensure('contests/contest', { edition__id__exact: editionId, name__exact: name }, {
      name, edition: editionId, scope: 0, state: 2, allow_result_upload: true, max_venue_depth: 0,
    }, args.apply);
    for (let index = 1; index <= 16; index++) await api.ensure('contests/contestproblem', { contest__id__exact: contestId || 0, index__exact: index }, {
      contest: contestId || '0', index, codename: `P${index}`, title: `Archimede ${category} — problema ${index}`, min_score: 0, max_score: 5,
    }, args.apply);
    const venueId = await api.ensure('venues/venue', { contest__id__exact: contestId || 0, name__exact: 'Olifogli — sede test' }, {
      name: 'Olifogli — sede test', contest: contestId || '0', location: one(school, 'location'), extra_schools: schoolId,
    }, args.apply);
    await api.ensure('venues/venueadmin', { venue__id__exact: venueId || 0, user__id__exact: teacherUserId }, {
      user: teacherUserId, venue: venueId || '0', read_only: false, name: one(teacher, 'name'), surname: one(teacher, 'surname'),
    }, args.apply);
    contests[category] = { contestId, venueId, schema: `archimede_${category}`, variant: variant + '11' };
  }
  return contests;
}

function archimedeRows(user, student, year, contests) {
  const classYear = Number(one(student, 'class_year'));
  if (!Number.isInteger(classYear) || classYear < 9 || classYear > 13) throw new Error('Archimede richiede uno studente delle superiori (classYear 9–13). Specificare --student EMAIL.');
  const rows = [{ case: 'account-esistente', category: classYear <= 10 ? 'biennio' : 'triennio', name: one(user, 'name'), surname: one(user, 'surname'),
    birthDate: isoDate(one(user, 'birth_date')), classYear, section: one(student, 'section') }];
  for (const [category, schoolYear, age] of [['biennio', 10, 15], ['triennio', 12, 17]]) {
    for (const [kind, surname, month] of [['senza-account', 'SenzaAccount', '03'], ['nuovo-da-abbinare', 'Nuovo', '04']]) {
      rows.push({ case: kind, category, name: 'Studente', surname: `Olifogli${surname}${category[0].toUpperCase() + category.slice(1)}`,
        birthDate: `${year - age}-${month}-14`, classYear: schoolYear, section: 'A' });
    }
  }
  for (const row of rows) {
    const { contestId, schema, variant } = contests[row.category];
    Object.assign(row, { contestId, schema, variant, olifogliData: { name: row.name, surname: row.surname,
      birthDate: row.birthDate ? row.birthDate.split('-').reverse().join('/') : '', classYear: String(row.classYear - 8), classSection: row.section, variant } });
  }
  return rows;
}

async function setup(api, args, adminId, oauth = null, log = console.log) {
  const studentId = await api.find('students/student', args.student ? { q: args.student } : {}, !args.student);
  if (!studentId) throw new Error('Studente non trovato. Specificare --student EMAIL.');
  const student = await api.fields('students/student', studentId);
  const classYear = Number(one(student, 'class_year'));
  if (!Number.isInteger(classYear) || classYear < 9 || classYear > 13) throw new Error('Archimede richiede uno studente delle superiori (classYear 9–13). Specificare --student EMAIL.');
  const schoolId = one(student, 'school');
  const school = await api.fields('schools/school', schoolId);
  const schoolCode = one(school, 'external_id');
  if (!schoolCode) throw new Error('La scuola dello studente non ha un codice ministeriale.');
  const user = await api.fields('users/user', one(student, 'user'));
  if (args.student && one(user, 'email').toLowerCase() !== args.student.toLowerCase()) throw new Error('La ricerca studente non ha restituito l’account richiesto.');
  args.student = one(user, 'email');
  if (!args.teacher) {
    const candidate = await api.find('teachers/teacher', { school__id__exact: schoolId }, true) || await api.find('teachers/teacher', {}, true);
    if (!candidate) throw new Error('Nessun docente disponibile nell’istanza. Specificare --teacher EMAIL.');
    const teacherUserId = one(await api.fields('teachers/teacher', candidate), 'user');
    args.teacher = one(await api.fields('users/user', teacherUserId), 'email');
  }
  const teacherUserId = await api.find('users/user', { email__exact: args.teacher });
  if (!teacherUserId) throw new Error('Docente non trovato. Specificare --teacher EMAIL.');
  const editionId = `olifogli-test-${args.year}`;
  log(`Scuola: ${schoolId} (${schoolCode}); edizione: ${editionId}`);
  const teacherId = await api.ensure('teachers/teacher', { user__id__exact: teacherUserId, school__id__exact: schoolId }, {
    user: teacherUserId, school: schoolId, verified_at_0: new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' }), verified_at_1: '12:00:00', verified_by: adminId,
  }, args.apply);
  const olympiadId = await api.ensure('olympiads/olympiad', { id__exact: 'olifogli-test' }, {
    id: 'olifogli-test', name: 'Olimpiadi di Matematica — test Olifogli', kind: 'Olympiad', contact_email: 'olifogli-test@example.invalid',
  }, args.apply);
  const dates = {};
  for (const [field, date] of [['school_registration_start', '01-01'], ['school_registration_stop', '12-30'],
    ['student_registration_start', '01-02'], ['student_registration_stop', '12-31'], ['student_updates_stop', '12-31']]) {
    dates[field + '_0'] = `${args.year}-${date}`; dates[field + '_1'] = '12:00:00';
  }
  await api.ensure('olympiads/olympiadedition', { id__exact: editionId }, { id: editionId, olympiad: olympiadId || 'olifogli-test',
    name: `Giochi di Archimede — test ${args.year}`, ordinal_number: 1, year: args.year, competitor_kind: 'S', school_types: [one(school, 'type')], ...dates }, args.apply);
  await api.ensure('schools/schoolsubscription', { school__id__exact: schoolId, edition__id__exact: editionId }, {
    school: schoolId, edition: editionId, contact: teacherId || '0', automatic_competitor_verification: true, donation: 0,
  }, args.apply);
  const contests = await archimedeContests(api, args, editionId, schoolId, school, teacherUserId);
  const rows = archimedeRows(user, student, args.year, contests);
  const venueId = contests[rows[0].category].venueId;
  if (args.apply) {
    let competitorId = await api.find('competitors/competitor', { edition__id__exact: editionId, q: args.student });
    if (!competitorId) {
      const data = await api.graphql(`mutation($student:Int!,$edition:String!){competitors{
        manualStudentSubscribe(studentId:$student,editionId:$edition,extraFieldEntries:[]){__typename
          ... on ManualStudentSubscribeSuccess {competitor{id}} ... on OperationInfo {messages{message}}}}}`,
      { student: Number(studentId), edition: editionId });
      competitorId = String(mutationResult(data, 'competitors', 'manualStudentSubscribe', 'ManualStudentSubscribeSuccess').competitor.id);
    }
    let participantId = await api.find('participants/participant', { competitor__id__exact: competitorId, official_venue__id__exact: venueId });
    if (!participantId) {
      const data = await api.graphql(`mutation($competitor:Int!,$venue:Int!){participants{
        manualCreateParticipant(competitorId:$competitor,venueId:$venue){__typename
          ... on ManualParticipantCreateSuccess {participant{id}} ... on OperationInfo {messages{message}}}}}`,
      { competitor: Number(competitorId), venue: Number(venueId) });
      participantId = String(mutationResult(data, 'participants', 'manualCreateParticipant', 'ManualParticipantCreateSuccess').participant.id);
    }
    rows[0].participantId = participantId;
    for (const row of rows.filter((item) => item.case === 'senza-account')) {
      const data = await api.graphql(`mutation($contest:Int!,$school:String!,$name:String!,$surname:String!,$birth:Date,$year:Int!,$section:String!){participants{
        matchOrCreateParticipant(contestId:$contest,schoolExternalId:$school,name:$name,surname:$surname,
          birthDate:$birth,classYear:$year,section:$section){__typename
            ... on ParticipantMatchSuccess {participant{id} multipleCompetitorsMatched} ... on OperationInfo {messages{message}}}}}`,
      { contest: Number(row.contestId), school: schoolCode, name: row.name, surname: row.surname, birth: row.birthDate, year: row.classYear, section: row.section });
      const match = mutationResult(data, 'participants', 'matchOrCreateParticipant', 'ParticipantMatchSuccess');
      if (match.multipleCompetitorsMatched) throw new Error('Abbinamento ambiguo per il concorrente sintetico: verificare Olimanager.');
      row.participantId = String(match.participant.id);
    }
  }
  const workbookCommonData = { ...require('./fixtures/archimede.json'), contest_year: String(args.year),
    olimanager_archimede_biennio_contest_id: contests.biennio.contestId, olimanager_archimede_triennio_contest_id: contests.triennio.contestId,
    olimanager_contest_id: contests.triennio.contestId };
  const manifest = { origin: api.origin, applied: args.apply, editionId, contests, schoolId, schoolExternalId: schoolCode,
    teacherEmail: args.teacher, studentEmail: args.student, workbookCommonData, sheetCommonData: { Codice_meccanografico: schoolCode }, rows };
  if (oauth !== null) manifest.oauth = oauth;
  if (args.output) { fs.writeFileSync(args.output, JSON.stringify(manifest, null, 2) + '\n'); log(`Manifest salvato in ${args.output}`); }
  log(JSON.stringify(manifest, null, 2));
  if (!args.apply) log('Verifica completata. Per creare i dati: npm run olimanager:setup -- --apply');
  return manifest;
}

const HELP = `Setup dati Archimede e applicazione OAuth di Olimanager.
Uso: npm run olimanager:setup -- [opzioni]
  --url URL                 URL di base (predefinito: staging)
  --username EMAIL          Amministratore; password: OLIMANAGER_SETUP_PASSWORD
  --apply                   Crea gli oggetti mancanti; altrimenti sola anteprima
  --oauth-only              Verifica/configura soltanto OAuth
  --oauth-name NOME          Predefinito: Olifogli locale
  --oauth-redirect-uri URI   Predefinito: http://localhost:3000/api/auth/callback/olimanager
  --oauth-regenerate-secret Rigenera il secret sul server (con --apply)
  --year ANNO               Anno dei dati di prova
  --teacher EMAIL           Docente esistente (altrimenti selezione automatica)
  --student EMAIL           Studente esistente delle superiori
  --output FILE             Manifest JSON senza secret
  --help                    Mostra questo messaggio`;

function options(argv, env) {
  const { values } = parseArgs({ args: argv, options: {
    url: { type: 'string', default: env.OLIMANAGER_SETUP_URL || DEFAULT_URL }, username: { type: 'string', default: env.OLIMANAGER_SETUP_USERNAME || '' },
    apply: { type: 'boolean', default: false }, 'oauth-only': { type: 'boolean', default: false },
    'oauth-name': { type: 'string', default: 'Olifogli locale' }, 'oauth-redirect-uri': { type: 'string', default: 'http://localhost:3000/api/auth/callback/olimanager' },
    'oauth-regenerate-secret': { type: 'boolean', default: false }, year: { type: 'string', default: new Intl.DateTimeFormat('en', { timeZone: 'Europe/Rome', year: 'numeric' }).format(new Date()) },
    teacher: { type: 'string' }, student: { type: 'string' }, output: { type: 'string' }, help: { type: 'boolean', default: false },
  } });
  const args = Object.fromEntries(Object.entries(values).map(([key, value]) => [key.replace(/-([a-z])/g, (_, char) => char.toUpperCase()), value]));
  args.year = Number(args.year);
  if (!Number.isInteger(args.year) || args.year < 2000 || args.year > 2099) throw new Error('--year deve essere compreso tra 2000 e 2099');
  args.localConfig = env;
  args.username = args.username.trim() || 'admin@olimanager.it';
  args.password = env.OLIMANAGER_SETUP_PASSWORD || (slashless(args.url) === DEFAULT_URL && args.username === 'admin@olimanager.it' ? args.username : '');
  if (!args.help && !args.password) throw new Error('Impostare OLIMANAGER_SETUP_PASSWORD per l’istanza scelta.');
  return args;
}

async function main(argv = process.argv.slice(2), { env = process.env, envPath = '.env', log = console.log,
  createClient = (cookies, origin) => new Olimanager(cookies, origin, { log }) } = {}) {
  const args = options(argv, loadProjectEnv(envPath, env));
  if (args.help) { log(HELP); return; }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'olifogli-olimanager-'));
  try {
    const api = createClient(path.join(tmp, 'cookies'), args.url);
    const adminId = await api.login(args.username, args.password);
    log('Accesso admin a Olimanager riuscito.');
    const oauth = await setupOauth(api, args, adminId, log);
    if (args.oauthOnly) {
      const manifest = { origin: api.origin, applied: args.apply, oauth };
      if (args.output) fs.writeFileSync(args.output, JSON.stringify(manifest, null, 2) + '\n');
      log(JSON.stringify(manifest, null, 2));
      return manifest;
    }
    return await setup(api, args, adminId, oauth, log);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

module.exports = { DEFAULT_URL, Olimanager, adminForm, setFields, isoDate, mutationResult, loadProjectEnv,
  verifyOauthSecret, printEnvChanges, setupOauth,
  archimedeContests, archimedeRows, setup, options, main };

if (require.main === module) main().catch((error) => { console.error(`Errore: ${error.message}`); process.exitCode = 1; });
