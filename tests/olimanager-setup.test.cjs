const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { test } = require('node:test');
const setup = require('../scripts/setup-olimanager.cjs');

function temporary(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'olifogli-setup-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
const noop = () => {};
function args(dir, overrides = {}) {
  return { oauthRedirectUri: 'http://localhost:3000/api/auth/callback/olimanager', oauthName: 'Olifogli locale', apply: true, localConfig: {}, year: 2026, student: 'student@example.invalid', teacher: 'teacher@example.invalid', ...overrides };
}
function hash(secret, type = 'sha256') {
  return `pbkdf2_${type}$1000$synthetic-salt$${crypto.pbkdf2Sync(secret, 'synthetic-salt', 1000, type === 'sha256' ? 32 : 20, type).toString('base64')}`;
}

const FORM = `<form id="contest_form"><input type="hidden" name="csrfmiddlewaretoken" value="synthetic-csrf">
<input name="name" value="Gara &amp; test"><input type="checkbox" name="enabled" checked>
<input type="checkbox" name="disabled_flag"><input name="readonly" value="ignored" disabled>
<input type="radio" name="radio" value="no"><input type="radio" name="radio" value="yes" checked>
<select name="state"><option value="0">Draft</option><option value="2" selected>Public</option></select>
<select name="schools" multiple><option value="1" selected>A</option><option value="2" selected>B</option></select>
<textarea name="notes">Test &lt;note&gt;</textarea><input name="form-TOTAL_FORMS" value="0">
<input type="submit" name="_save" value="Save"></form>`;

test('Django forms preserve controls, selected radio, CSRF and management fields', () => {
  const fields = setup.adminForm(FORM);
  assert.deepEqual(fields, { csrfmiddlewaretoken: ['synthetic-csrf'], name: ['Gara & test'], enabled: ['on'], disabled_flag: [],
    radio: ['yes'], state: ['2'], schools: ['1', '2'], notes: ['Test <note>'], 'form-TOTAL_FORMS': ['0'] });
  setup.setFields(fields, { enabled: false, disabled_flag: true, state: 0, schools: ['3', '4'] });
  assert.deepEqual(fields.enabled, []);
  assert.deepEqual(fields.disabled_flag, ['on']);
  assert.deepEqual(fields.state, ['0']);
  assert.deepEqual(fields.schools, ['3', '4']);
  assert.throws(() => setup.setFields(fields, { unknown: 'value' }), /inatteso/);
});

test('a login page is never accepted as an admin add form', () => {
  assert.throws(() => setup.adminForm('<form id="login-form"></form>'), /Modulo Django/);
});

test('dotenv loads quotes, comments, empty values and preserves exported variables without writing .env', (t) => {
  const file = path.join(temporary(t), '.env');
  const source = '#comment\nexport EXPORTED=file\nEMPTY=\nNEXT=value # comment\nSECRET="abc#def=="\nSINGLE=\'literal $VALUE\'\nMULTI="line1\\nline2"\nLITERAL=$(touch should-not-exist)\n';
  fs.writeFileSync(file, source);
  const loaded = setup.loadProjectEnv(file, { EXPORTED: 'shell' });
  assert.deepEqual(loaded, { EXPORTED: 'shell', EMPTY: '', NEXT: 'value', SECRET: 'abc#def==', SINGLE: 'literal $VALUE', MULTI: 'line1\nline2', LITERAL: '$(touch should-not-exist)' });
  assert.equal(fs.readFileSync(file, 'utf8'), source);
});

test('missing .env leaves the environment unchanged', (t) => {
  assert.deepEqual(setup.loadProjectEnv(path.join(temporary(t), 'missing'), { EXPORTED: 'value' }), { EXPORTED: 'value' });
});

for (const env of [{}, { OLIMANAGER_SETUP_USERNAME: '', OLIMANAGER_SETUP_PASSWORD: '' }, { OLIMANAGER_SETUP_USERNAME: '  ', OLIMANAGER_SETUP_PASSWORD: '' }]) {
  test(`public staging credentials are used when unset or empty: ${JSON.stringify(env)}`, () => {
    const parsed = setup.options([], env);
    assert.equal(parsed.username, 'admin@olimanager.it');
    assert.equal(parsed.password, 'admin@olimanager.it');
  });
}
test('explicit credentials and target are preserved', () => {
  const parsed = setup.options(['--url', 'http://localhost:8000', '--username', 'admin@example.invalid'], { OLIMANAGER_SETUP_PASSWORD: 'synthetic' });
  assert.equal(parsed.url, 'http://localhost:8000');
  assert.equal(parsed.username, 'admin@example.invalid');
  assert.equal(parsed.password, 'synthetic');
});
test('Olimanager app URL in .env does not silently change the setup target', () => {
  assert.equal(setup.options([], { OLIMANAGER_URL: 'https://production.invalid' }).url, setup.DEFAULT_URL);
});
test('invalid years, unknown options and missing custom-instance password fail before login', () => {
  for (const argv of [['--year', '1999'], ['--year', '2026.5'], ['--year', 'NaN'], ['--unknown'], ['--url', 'http://localhost:8000']]) {
    assert.throws(() => setup.options(argv, {}));
  }
  assert.equal(setup.options(['--oauth-regenerate-secret'], {}).oauthRegenerateSecret, true);
});

test('foreign origins and credentials embedded in base URL are rejected before network access', async () => {
  const api = new setup.Olimanager('unused', setup.DEFAULT_URL, { run: () => assert.fail('network'), wait: noop });
  for (const url of ['https://olimpiadi-scientifiche.it/graphql/', 'https://evil.invalid/', 'http://staging.olimpiadi-scientifiche.it/']) {
    await assert.rejects(api.request(url), /istanza Olimanager configurata/);
  }
  for (const url of ['https://user:pass@example.invalid', 'https://example.invalid/graphql/', 'ftp://example.invalid', 'https://example.invalid/?secret=value']) {
    assert.throws(() => new setup.Olimanager('unused', url));
  }
});

test('transport uses the configured origin, cookies and CSRF; credentials go through stdin', async (t) => {
  const cookieFile = path.join(temporary(t), 'cookies');
  fs.writeFileSync(cookieFile, '# Netscape HTTP Cookie File\nexample.invalid\tFALSE\t/\tFALSE\t0\tcsrftoken\tsynthetic-csrf\n');
  let calls = 0;
  const api = new setup.Olimanager(cookieFile, 'http://localhost:8000', { wait: noop, run: async (argv, input) => {
    calls++;
    assert.ok(argv.includes('http://localhost:8000/graphql/'));
    assert.ok(argv.includes(cookieFile));
    assert.ok(argv.includes('X-CSRFToken: synthetic-csrf'));
    assert.ok(!argv.some((value) => value.includes('synthetic-password')));
    assert.equal(JSON.parse(input).variables.password, 'synthetic-password');
    return '{"data":{"ok":true}}\n200';
  } });
  assert.deepEqual(await api.graphql('query Test', { password: 'synthetic-password' }), { ok: true });
  assert.equal(calls, 1);
});

test('admin pacing starts immediately, accounts for request duration and leaves GraphQL unthrottled', async () => {
  let time = 0;
  let duration = 200;
  const waits = [];
  const api = new setup.Olimanager('unused', setup.DEFAULT_URL, {
    now: () => time,
    wait: async (ms) => { waits.push(ms); time += ms; },
    run: async () => { time += duration; return 'ok\n200'; },
  });
  await api.request('/admin/');
  assert.deepEqual(waits, []);
  await api.request('/admin/');
  assert.deepEqual(waits, [800]);
  await api.request('/graphql/');
  assert.deepEqual(waits, [800]);
  duration = 1500;
  await api.request('/admin/');
  assert.deepEqual(waits, [800, 600]);
  await api.request('/admin/');
  assert.deepEqual(waits, [800, 600]);
});

test('transport distinguishes HTTP and GraphQL errors from successful responses', async () => {
  const api = new setup.Olimanager('unused', setup.DEFAULT_URL, { wait: noop, run: async () => 'rate limited\n429' });
  await assert.rejects(api.request('/admin/'), /HTTP 429/);
  api.request = async () => [200, JSON.stringify({ errors: [{ message: 'permission denied' }] })];
  await assert.rejects(api.graphql('{}'), /permission denied/);
});

test('relative admin links are resolved, ambiguous results rejected and login pages detected', async () => {
  const api = new setup.Olimanager('unused');
  let html = '<table id="result_list"><tr><td><a href="123/change/">test</a></td></tr></table>';
  api.request = async () => [200, html];
  assert.equal(await api.find('students/student', {}), '123');
  html = html.replace('</table>', '<tr><td><a href="124/change/">other</a></td></tr></table>');
  await assert.rejects(api.find('students/student', {}), /Più oggetti/);
  assert.equal(await api.find('students/student', {}, true), '123');
  html = '<form id="login-form"></form>';
  await assert.rejects(api.find('students/student', {}), /scaduta/);
  html = '<div id="changelist"></div>';
  assert.equal(await api.find('students/student', {}), null);
});

test('real ensure() previews without POST and reuses objects on repeated execution', async () => {
  const api = new setup.Olimanager('unused', setup.DEFAULT_URL, { log: noop });
  let pk = null, writes = 0;
  api.find = async () => pk;
  api.request = async (url, data) => {
    if (!data) return [200, FORM];
    writes++;
    assert.deepEqual(data.csrfmiddlewaretoken, ['synthetic-csrf']);
    assert.deepEqual(data.name, ['test']);
    pk = '123'; return [302, ''];
  };
  assert.equal(await api.ensure('contests/contest', {}, { name: 'test' }, false), null);
  assert.equal(writes, 0);
  assert.equal(await api.ensure('contests/contest', {}, { name: 'test' }, true), '123');
  assert.equal(await api.ensure('contests/contest', {}, { name: 'changed' }, true), '123');
  assert.equal(writes, 1);
});

test('a rejected Django form is not reported as a successful creation', async () => {
  const api = new setup.Olimanager('unused', setup.DEFAULT_URL, { log: noop });
  api.find = async () => null;
  api.request = async (url, data) => [200, data ? '<ul class="errorlist"><li>Required field</li></ul>' : FORM];
  await assert.rejects(api.ensure('contests/contest', {}, { name: 'test' }, true), /Required field/);
});

for (const algorithm of ['sha256', 'sha1']) test(`Django PBKDF2 ${algorithm} verifies the secret without sending it`, () => {
  assert.equal(setup.verifyOauthSecret('synthetic', hash('synthetic', algorithm)), true);
  assert.equal(setup.verifyOauthSecret('wrong', hash('synthetic', algorithm)), false);
  assert.throws(() => setup.verifyOauthSecret('synthetic', 'unsupported'), /Hash/);
});

class OAuthAPI {
  origin = 'https://example.invalid';
  pk = null;
  saved = null;
  creations = 0;
  interrupted = false;
  async find(model, filters) {
    assert.equal(model, 'oauth2_provider/application');
    assert.deepEqual(filters, { name__exact: 'Olifogli locale' });
    return this.pk;
  }
  async fields(model, pk = null) {
    if (pk) return Object.fromEntries(Object.entries({ ...this.saved, client_secret: hash(this.saved.client_secret) })
      .map(([key, value]) => [key, value === false ? [] : value === true ? ['on'] : [String(value)]]));
    return Object.fromEntries(['name', 'user', 'redirect_uris', 'client_type', 'authorization_grant_type', 'algorithm',
      'skip_authorization', 'hash_client_secret', 'client_id', 'client_secret'].map((key) => [key, []]));
  }
  updates = 0;
  async request(target, fields) {
    assert.equal(target, `/admin/oauth2_provider/application/${this.pk}/change/`);
    this.updates++;
    this.saved.client_secret = fields.client_secret[0];
    if (this.interrupted) throw new Error('response lost');
    return [302, ''];
  }
  async ensure(model, filters, values, apply) {
    if (apply) {
      this.creations++;
      this.saved = { ...values }; this.pk = '99';
      if (this.interrupted) throw new Error('response lost');
    }
    return this.pk;
  }
}
async function oauth(api, options) {
  const output = [];
  const metadata = await setup.setupOauth(api, options, '1', (line) => output.push(line));
  return { metadata, output: output.join('\n') };
}

function copiedConfig(api) {
  return { OLIMANAGER_URL: api.origin, NEXTAUTH_URL: 'http://localhost:3000',
    OLIMANAGER_GRAPHQL_ENDPOINT: api.origin + '/graphql/',
    OLIMANAGER_OAUTH_CLIENT_ID: api.saved.client_id, OLIMANAGER_OAUTH_CLIENT_SECRET: api.saved.client_secret };
}

test('OAuth creation prints credentials without writing files and uses the required settings', async (t) => {
  const dir = temporary(t), api = new OAuthAPI(), options = args(dir);
  const { metadata, output } = await oauth(api, options);
  for (const [key, value] of Object.entries({ client_type: 'confidential', authorization_grant_type: 'authorization-code', algorithm: 'RS256', hash_client_secret: true, skip_authorization: false })) assert.equal(api.saved[key], value);
  assert.equal(api.saved.redirect_uris, 'http://localhost:3000/api/auth/callback/olimanager');
  assert.ok(output.includes(api.saved.client_secret));
  assert.ok(!JSON.stringify(metadata).includes(api.saved.client_secret));
  assert.deepEqual(fs.readdirSync(dir), []);
});

test('credentials copied to .env are reused after a database reset and not printed when matching', async (t) => {
  const api = new OAuthAPI(), options = args(temporary(t));
  await oauth(api, options);
  options.localConfig = copiedConfig(api);
  const saved = { ...api.saved };
  const result = await oauth(api, options);
  assert.match(result.output, /corrispondono/);
  assert.ok(!result.output.includes(saved.client_secret));
  api.pk = null;
  await oauth(api, options);
  assert.deepEqual(api.saved, saved);
  assert.equal(api.creations, 2);
});

test('missing or invalid .env secret requests explicit regeneration without changing the server', async (t) => {
  const api = new OAuthAPI(), options = args(temporary(t));
  await oauth(api, options);
  const saved = { ...api.saved };
  options.localConfig = { ...copiedConfig(api), OLIMANAGER_OAUTH_CLIENT_SECRET: 'wrong-secret', OLIMANAGER_GRAPHQL_ENDPOINT: 'wrong' };
  const { metadata, output } = await oauth(api, options);
  assert.equal(metadata.credentialsAvailable, false);
  assert.match(output, /--oauth-regenerate-secret --apply/);
  assert.ok(output.includes('OLIMANAGER_GRAPHQL_ENDPOINT='));
  assert.ok(!output.includes('OLIMANAGER_OAUTH_CLIENT_SECRET='));
  assert.deepEqual(api.saved, saved);
  assert.equal(api.updates, 0);
});

test('regenerating a secret preserves client ID and application settings, prints new secret and writes no files', async (t) => {
  const dir = temporary(t), api = new OAuthAPI(), options = args(dir);
  await oauth(api, options);
  options.localConfig = copiedConfig(api);
  const original = { ...api.saved };
  options.oauthRegenerateSecret = true;
  const { metadata, output } = await oauth(api, options);
  assert.notEqual(api.saved.client_secret, original.client_secret);
  assert.deepEqual({ ...api.saved, client_secret: original.client_secret }, original);
  assert.equal(api.updates, 1);
  assert.equal(api.creations, 1);
  assert.equal(metadata.credentialsAvailable, true);
  assert.ok(output.includes('OLIMANAGER_OAUTH_CLIENT_SECRET=' + JSON.stringify(api.saved.client_secret)));
  assert.deepEqual(fs.readdirSync(dir), []);
});

test('preview creates and rotates nothing and does not disclose a proposed secret', async (t) => {
  const dir = temporary(t), api = new OAuthAPI(), options = args(dir, { apply: false, oauthRegenerateSecret: true });
  let result = await oauth(api, options);
  assert.equal(result.metadata.credentialsAvailable, false);
  assert.equal(api.creations, 0);
  options.apply = true;
  await oauth(api, options);
  const original = { ...api.saved };
  options.apply = false;
  result = await oauth(api, options);
  assert.match(result.output, /Da rigenerare/);
  assert.deepEqual(api.saved, original);
  assert.equal(api.updates, 0);
  assert.ok(!result.output.includes('OLIMANAGER_OAUTH_CLIENT_SECRET='));
  assert.deepEqual(fs.readdirSync(dir), []);
});

for (const rotation of [false, true]) test(`lost response prints proposed credentials for recovery (rotation=${rotation})`, async (t) => {
  const api = new OAuthAPI(), options = args(temporary(t));
  if (rotation) { await oauth(api, options); options.oauthRegenerateSecret = true; }
  api.interrupted = true;
  const output = [];
  await assert.rejects(setup.setupOauth(api, options, '1', (line) => output.push(line)), /non confermata/);
  assert.ok(output.join('\n').includes(api.saved.client_secret));
  options.localConfig = copiedConfig(api);
  options.oauthRegenerateSecret = false;
  assert.equal((await oauth(api, options)).metadata.credentialsAvailable, true);
});

test('incompatible existing application is unchanged even when regeneration was requested', async (t) => {
  const api = new OAuthAPI(), options = args(temporary(t));
  await oauth(api, options);
  api.saved.redirect_uris = 'https://other.invalid/callback';
  options.oauthRegenerateSecret = true;
  const original = { ...api.saved };
  await assert.rejects(oauth(api, options), /incompatibile/);
  assert.deepEqual(api.saved, original);
  assert.equal(api.updates, 0);
});

test('credentials for a different instance are never sent when creating an application', async (t) => {
  const api = new OAuthAPI(), options = args(temporary(t), { localConfig: { OLIMANAGER_URL: 'https://other.invalid',
    NEXTAUTH_URL: 'http://localhost:3000', OLIMANAGER_OAUTH_CLIENT_ID: 'other-client', OLIMANAGER_OAUTH_CLIENT_SECRET: 'other-secret' } });
  await oauth(api, options);
  assert.notEqual(api.saved.client_id, 'other-client');
  assert.notEqual(api.saved.client_secret, 'other-secret');
});

class FixtureAPI {
  origin = 'https://example.invalid';
  objects = new Map(); creations = []; calls = []; participants = new Map(); competitor = null; classYear = 11;
  async find(model, filters) {
    if (model === 'students/student') return '1';
    if (model === 'users/user') return '2';
    if (model === 'competitors/competitor') return this.competitor;
    if (model === 'participants/participant') return this.participants.get(String(filters.official_venue__id__exact)) ?? null;
    throw new Error('Unexpected find: ' + model);
  }
  async fields(model, pk) {
    if (model === 'users/user' && pk === '2') return { email: ['teacher@example.invalid'], name: ['Docente'], surname: ['Referente'] };
    const values = {
      'students/student': { school: '10', user: '3', class_year: this.classYear, section: 'A' },
      'schools/school': { external_id: 'TEST0001', type: '4', location: '5' },
      'users/user': { email: 'student@example.invalid', name: 'Nome', surname: 'Test', birth_date: '14/03/2010' },
    }[model];
    return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, [String(value)]]));
  }
  async ensure(model, filters, values, apply) {
    if (model === 'venues/venueadmin') assert.ok(values.name && values.surname, 'required historical name/surname');
    const key = model + JSON.stringify(filters);
    if (!this.objects.has(key) && apply) { this.objects.set(key, String(100 + this.objects.size)); this.creations.push([model, { ...values }]); }
    return this.objects.get(key) ?? null;
  }
  async graphql(query, variables) {
    this.calls.push([query, variables]);
    if (query.includes('manualStudentSubscribe')) {
      this.competitor = '21';
      return { competitors: { manualStudentSubscribe: { __typename: 'ManualStudentSubscribeSuccess', competitor: { id: 21 } } } };
    }
    if (query.includes('manualCreateParticipant')) {
      this.participants.set(String(variables.venue), '31');
      return { participants: { manualCreateParticipant: { __typename: 'ManualParticipantCreateSuccess', participant: { id: 31 } } } };
    }
    if (query.includes('matchOrCreateParticipant')) return { participants: { matchOrCreateParticipant: {
      __typename: 'ParticipantMatchSuccess', participant: { id: variables.contest + 1000 }, multipleCompetitorsMatched: false,
    } } };
    throw new Error('Unexpected GraphQL call');
  }
}

test('Archimede preview has two categories without any mutations', async (t) => {
  const api = new FixtureAPI();
  const manifest = await setup.setup(api, args(temporary(t), { apply: false }), '1', null, noop);
  assert.deepEqual(Object.keys(manifest.contests), ['biennio', 'triennio']);
  assert.equal(api.creations.length, 0);
  assert.equal(api.calls.length, 0);
});

test('two contests, 32 canonical problems, teacher names, participants and workbook survive repeat', async (t) => {
  const api = new FixtureAPI(), options = args(temporary(t));
  const first = await setup.setup(api, options, '1', null, noop), count = api.creations.length;
  const second = await setup.setup(api, options, '1', null, noop);
  assert.deepEqual(second, first); assert.equal(api.creations.length, count);
  assert.equal(api.creations.filter(([model]) => model === 'contests/contest').length, 2);
  for (const category of ['biennio', 'triennio']) {
    const id = first.contests[category].contestId;
    const problems = api.creations.filter(([model, values]) => model === 'contests/contestproblem' && values.contest === id).map(([, values]) => values);
    assert.deepEqual(problems.map((item) => item.index), Array.from({ length: 16 }, (_, i) => i + 1));
    assert.ok(problems.every((item) => item.min_score === 0 && item.max_score === 5));
    assert.equal(first.workbookCommonData[`olimanager_archimede_${category}_contest_id`], id);
  }
  const admins = api.creations.filter(([model]) => model === 'venues/venueadmin');
  assert.equal(admins.length, 2);
  assert.ok(admins.every(([, value]) => value.name === 'Docente' && value.surname === 'Referente'));
  for (const row of first.rows) {
    const category = row.classYear <= 10 ? 'biennio' : 'triennio';
    assert.equal(row.category, category); assert.equal(row.contestId, first.contests[category].contestId);
    assert.equal(row.variant, category === 'biennio' ? '211' : '311');
    assert.equal(Number(row.olifogliData.classYear), row.classYear - 8);
    assert.equal(Object.hasOwn(row, 'participantId'), row.case !== 'nuovo-da-abbinare');
  }
  assert.ok(api.calls.filter(([query]) => query.includes('matchOrCreateParticipant')).every(([, value]) => value.surname.includes('SenzaAccount')));
  const workbook = first.workbookCommonData;
  assert.equal(workbook.contest_year, '2026');
  assert.equal(workbook.permutations_correct_2, 'EBDACADEEBCDAEBC');
  assert.equal(workbook.permutations_correct_3, 'CBAEAECBDCBEEDAB');
  for (let i = 1; i <= 8; i++) assert.deepEqual(JSON.parse(workbook[`permutations_questions_${i}`]).sort((a, b) => a - b), Array.from({ length: 16 }, (_, i) => i + 1));
});

test('Archimede setup resumes after first venue admin creation fails', async (t) => {
  const api = new FixtureAPI(), options = args(temporary(t)), ensure = api.ensure.bind(api);
  api.ensure = async (...input) => { if (input[0] === 'venues/venueadmin') throw new Error('simulated failure'); return ensure(...input); };
  await assert.rejects(setup.setup(api, options, '1', null, noop), /simulated/);
  const previous = new Map(api.objects); api.ensure = ensure;
  await setup.setup(api, options, '1', null, noop);
  for (const [key, id] of previous) assert.equal(api.objects.get(key), id);
  assert.equal(api.creations.filter(([model]) => model === 'contests/contestproblem').length, 32);
});

for (const classYear of [6, 14, 9.5]) test(`non-high-school or malformed class year ${classYear} fails before writes`, async (t) => {
  const api = new FixtureAPI(); api.classYear = classYear;
  await assert.rejects(setup.setup(api, args(temporary(t)), '1', null, noop), /superiori/);
  assert.equal(api.creations.length, 0);
});

test('CLI OAuth-only loads .env and never invokes contest setup; public manifest has no secret', async (t) => {
  const dir = temporary(t), api = new OAuthAPI(); let loggedIn;
  api.login = async (email, password) => { loggedIn = [email, password]; return '1'; };
  const envPath = path.join(dir, '.env'); fs.writeFileSync(envPath, 'OLIMANAGER_SETUP_USERNAME=\nOLIMANAGER_SETUP_PASSWORD=\n');
  const output = path.join(dir, 'public.json');
  const result = await setup.main(['--oauth-only', '--apply', '--output', output], {
    env: {}, envPath, log: noop, createClient: () => api,
  });
  assert.deepEqual(loggedIn, ['admin@olimanager.it', 'admin@olimanager.it']);
  assert.equal(result.oauth.applicationId, '99');
  assert.ok(!fs.readFileSync(output, 'utf8').includes(api.saved.client_secret));
  assert.equal(fs.readFileSync(envPath, 'utf8'), 'OLIMANAGER_SETUP_USERNAME=\nOLIMANAGER_SETUP_PASSWORD=\n');
});

test('date parsing and unexpected mutation payloads fail clearly', () => {
  assert.equal(setup.isoDate('14/03/2010'), '2010-03-14');
  assert.equal(setup.isoDate('2010-03-14'), '2010-03-14');
  assert.throws(() => setup.isoDate('31/02/2010'), /data di nascita/);
  assert.throws(() => setup.mutationResult({ participants: { create: { __typename: 'OperationInfo', messages: [{ message: 'permission denied' }] } } }, 'participants', 'create', 'Success'), /permission denied/);
});
