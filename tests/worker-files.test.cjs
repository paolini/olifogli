const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { ObjectId } = require('bson');

function load(file, dependencies = {}) {
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(source, {
    exports, process, Buffer, URLSearchParams, ReadableStream,
    require: name => name in dependencies ? dependencies[name] : require(name),
  });
  return exports;
}

const scanJob = '6a1d12e12a58b3bf020e413b';
const sheetJob = '6a1d12e12a58b3bf020e4140';

// Builds the four areas with the layouts produced by oliscan and olisheet.
function areas(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'olifogli-worker-files-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const write = (relative, content = 'x') => {
    fs.mkdirSync(path.dirname(path.join(base, relative)), { recursive: true });
    fs.writeFileSync(path.join(base, relative), content);
  };
  write(`scans-spool/archimede_biennio-${scanJob}.pdf`, '%PDF-queued');
  write(`scans-spool/archimede_biennio-${scanJob}.pdf.part`);
  write(`scans-spool/completed/gara_prime-${'a'.repeat(24)}.pdf`);
  write(`scans-spool/tmp/${scanJob}/input/page.png`);
  fs.mkdirSync(path.join(base, 'scans-spool/processing'));
  write(`scans-spool/notes.txt`);
  write(`scans-data/${scanJob}/${scanJob}_001.png`, 'PNG');
  write(`sheets-spool/processing/archimede_biennio-${sheetJob}.jsonl`);
  write(`sheets-data/${sheetJob}/archimede_biennio-${sheetJob}.pdf`, '%PDF-sheet');
  write('outside/secret.txt', 'secret');
  fs.symlinkSync(path.join(base, 'outside/secret.txt'), path.join(base, 'scans-data/link.txt'));
  fs.symlinkSync(path.join(base, 'outside'), path.join(base, `scans-data/${'b'.repeat(24)}`));
  const env = {
    SCANS_SPOOL_DIR: path.join(base, 'scans-spool'), SCANS_DATA_DIR: path.join(base, 'scans-data'),
    SHEETGENSPOOL_DIR: path.join(base, 'sheets-spool'), SHEETGENDATA_DIR: path.join(base, 'sheets-data'),
  };
  return { base, env };
}

const lib = () => load('app/lib/workerFiles.ts');
// Arrays built inside the vm context have another prototype.
const plain = value => JSON.parse(JSON.stringify(value));

test('files are listed with their job and folder, without following symlinks', async t => {
  const { env } = areas(t);
  const { files, areas: listed } = await lib().listWorkerFiles(env);

  assert.deepEqual(plain(listed.map(area => [area.area, area.available])),
    [['scans-spool', true], ['scans-data', true], ['sheets-spool', true], ['sheets-data', true]]);
  const summary = plain(files.map(file => `${file.area}|${file.path}|${file.folder}|${file.jobId}`).sort());
  assert.deepEqual(summary, [
    `scans-data|${scanJob}/${scanJob}_001.png|data|${scanJob}`,
    `scans-spool|archimede_biennio-${scanJob}.pdf.part|staging|${scanJob}`,
    `scans-spool|archimede_biennio-${scanJob}.pdf|queued|${scanJob}`,
    `scans-spool|completed/gara_prime-${'a'.repeat(24)}.pdf|completed|${'a'.repeat(24)}`,
    'scans-spool|notes.txt|queued|null',
    `scans-spool|tmp/${scanJob}/input/page.png|tmp|${scanJob}`,
    `sheets-data|${sheetJob}/archimede_biennio-${sheetJob}.pdf|data|${sheetJob}`,
    `sheets-spool|processing/archimede_biennio-${sheetJob}.jsonl|processing|${sheetJob}`,
  ]);
});

test('unconfigured scan areas are omitted and missing directories are reported', async () => {
  const { areas: listed, files } = await lib().listWorkerFiles({ SHEETGENSPOOL_DIR: '/nonexistent/spool', SHEETGENDATA_DIR: '/nonexistent/data' });
  assert.deepEqual(plain(listed.map(area => [area.area, area.available])), [['sheets-spool', false], ['sheets-data', false]]);
  assert.deepEqual(plain(files), []);
});

test('only regular files inside an area resolve', async t => {
  const { env } = areas(t);
  const { resolveWorkerFile } = lib();
  assert.ok(await resolveWorkerFile('scans-data', `${scanJob}/${scanJob}_001.png`, env));
  for (const [area, relative] of [
    ['scans-data', '../outside/secret.txt'], ['scans-data', `${scanJob}/../../outside/secret.txt`],
    ['scans-data', '/etc/passwd'], ['scans-data', 'link.txt'], ['scans-data', `${'b'.repeat(24)}/secret.txt`],
    ['scans-data', scanJob], ['scans-data', ''], ['scans-data', `${scanJob}\\x.png`], ['unknown', 'x'],
    ['scans-spool', './notes.txt'], ['scans-spool', 'processing//x'],
  ]) assert.equal(await resolveWorkerFile(area, relative, env), null, `${area}:${relative}`);
});

test('deleting a file removes empty job directories but keeps the spool folders', async t => {
  const { base, env } = areas(t);
  const { deleteWorkerFile } = lib();

  assert.equal(await deleteWorkerFile('scans-data', `${scanJob}/${scanJob}_001.png`, env), 'deleted');
  assert.equal(fs.existsSync(path.join(base, `scans-data/${scanJob}`)), false);
  assert.equal(await deleteWorkerFile('scans-spool', `tmp/${scanJob}/input/page.png`, env), 'deleted');
  assert.equal(fs.existsSync(path.join(base, `scans-spool/tmp/${scanJob}`)), false);
  assert.equal(fs.existsSync(path.join(base, 'scans-spool/tmp')), true);
  assert.equal(await deleteWorkerFile('sheets-spool', `processing/archimede_biennio-${sheetJob}.jsonl`, env), 'deleted');
  assert.equal(fs.existsSync(path.join(base, 'sheets-spool/processing')), true);

  assert.equal(await deleteWorkerFile('scans-data', 'link.txt', env), 'not_found');
  assert.equal(fs.existsSync(path.join(base, 'outside/secret.txt')), true);
  assert.equal(await deleteWorkerFile('scans-data', '../outside/secret.txt', env), 'not_found');
});

class NextResponse {
  constructor(body, init = {}) { this.body = body; this.status = init.status ?? 200; this.headers = init.headers ?? {}; }
  static json(body, init) { return new NextResponse(body, init); }
}

function route(user) {
  return load('app/api/worker-files/route.ts', {
    'next/server': { NextResponse },
    '@/app/graphql/types': { get_context: async () => ({}) },
    '@/app/graphql/resolvers/utils': { get_authenticated_user: async () => { if (!user) throw new Error('anonymous'); return user; } },
    '@/app/lib/workerFiles': lib(),
  });
}

const request = params => ({ nextUrl: { searchParams: new URLSearchParams(params) } });

async function text(body) {
  const chunks = [];
  for await (const chunk of body) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString();
}

test('the download route is reserved to admins and serves only area files', async t => {
  const { env } = areas(t);
  Object.assign(process.env, env);
  t.after(() => { for (const key of Object.keys(env)) delete process.env[key]; });
  const params = { area: 'scans-data', path: `${scanJob}/${scanJob}_001.png` };

  assert.equal((await route(null).GET(request(params))).status, 403);
  assert.equal((await route({ isAdmin: false }).GET(request(params))).status, 403);

  const admin = route({ isAdmin: true });
  const inline = await admin.GET(request(params));
  assert.equal(inline.status, 200);
  assert.equal(inline.headers['Content-Type'], 'image/png');
  assert.match(inline.headers['Content-Disposition'], /^inline;/);
  assert.equal(await text(inline.body), 'PNG');

  const download = await admin.GET(request({ ...params, download: '1' }));
  assert.equal(download.headers['Content-Type'], 'application/octet-stream');
  assert.match(download.headers['Content-Disposition'], /^attachment;/);
  await text(download.body);

  const jsonl = await admin.GET(request({ area: 'sheets-spool', path: `processing/archimede_biennio-${sheetJob}.jsonl` }));
  assert.match(jsonl.headers['Content-Disposition'], /^attachment;/);
  await text(jsonl.body);

  for (const bad of [{ area: 'scans-data', path: '../outside/secret.txt' }, { area: 'scans-data', path: 'link.txt' }, {}]) {
    assert.equal((await admin.GET(request(bad))).status, 404);
  }
});

function resolvers(user, jobs) {
  const collection = docs => ({
    find: query => ({ toArray: async () => docs.filter(doc => query._id.$in.some(id => id.equals(doc._id))) }),
  });
  return load('app/graphql/resolvers/workerFiles.ts', {
    mongodb: { ObjectId },
    '@/app/lib/mongodb': {
      getScanJobsCollection: async () => collection(jobs.scan),
      getScanSheetJobsCollection: async () => collection(jobs.sheet),
      getSheetsCollection: async () => collection(jobs.sheets),
      getWorkbooksCollection: async () => collection(jobs.workbooks ?? []),
    },
    '@/app/lib/workerFiles': lib(),
    '@/app/lib/appLog': { appLog() {} },
    './utils': {
      get_authenticated_user: async () => user,
      check_admin: u => { if (!u?.isAdmin) throw new Error('non autorizzato'); },
    },
  });
}

test('groups join the database jobs and group deletion leaves other jobs alone', async t => {
  const { base, env } = areas(t);
  Object.assign(process.env, env);
  t.after(() => { for (const key of Object.keys(env)) delete process.env[key]; });
  const sheetId = new ObjectId(), workbookId = new ObjectId();
  const jobs = {
    scan: [{ _id: new ObjectId(scanJob), sheetId, timestamp: new Date(), messages: [{ status: 'completed' }] }],
    sheet: [],
    sheets: [{ _id: sheetId, name: 'Liceo Galilei', workbookId }],
    workbooks: [{ _id: workbookId, name: 'Archimede 2026' }],
  };

  await assert.rejects(resolvers({ isAdmin: false }, jobs).workerFiles(null, {}, {}), /non autorizzato/);
  await assert.rejects(resolvers({ isAdmin: false }, jobs).deleteWorkerFileGroup(null, { kind: 'scan', jobId: new ObjectId(scanJob) }, {}), /non autorizzato/);

  const admin = resolvers({ isAdmin: true }, jobs);
  const { groups } = await admin.workerFiles(null, {}, {});
  const scan = groups.find(group => group.kind === 'scan' && group.jobId?.toString() === scanJob);
  assert.equal(scan.jobExists, true);
  assert.equal(scan.sheetName, 'Liceo Galilei');
  assert.equal(scan.workbookId.toString(), workbookId.toString());
  assert.equal(scan.workbookName, 'Archimede 2026');
  assert.equal(scan.status, 'completed');
  assert.equal(scan.fileCount, 4);
  assert.deepEqual(plain(scan.folders).sort(), ['data', 'queued', 'staging', 'tmp']);
  const sheet = groups.find(group => group.kind === 'sheet');
  assert.equal(sheet.jobExists, false);
  assert.equal(sheet.workbookId, null);
  assert.equal(groups.find(group => group.kind === 'scan' && group.jobId === null).fileCount, 1);

  assert.deepEqual(plain(await admin.deleteWorkerFileGroup(null, { kind: 'scan', jobId: new ObjectId(scanJob) }, {})),
    { deleted: 4, failed: [] });
  const remaining = plain((await lib().listWorkerFiles(env)).files.map(file => file.path).sort());
  assert.deepEqual(remaining, [
    `${sheetJob}/archimede_biennio-${sheetJob}.pdf`,
    `completed/gara_prime-${'a'.repeat(24)}.pdf`,
    'notes.txt',
    `processing/archimede_biennio-${sheetJob}.jsonl`,
  ]);
  assert.equal(fs.existsSync(path.join(base, 'outside/secret.txt')), true);
});

test('files in a directory the application cannot write are reported as a permission failure', {
  skip: process.getuid?.() === 0 && 'root ignores directory permissions',
}, async t => {
  const { base, env } = areas(t);
  Object.assign(process.env, env);
  t.after(() => { for (const key of Object.keys(env)) delete process.env[key]; });
  // A job directory created by a worker running as root, as seen by another user.
  const jobDir = path.join(base, `scans-data/${scanJob}`);
  fs.chmodSync(jobDir, 0o555);
  try {
    assert.equal(await lib().deleteWorkerFile('scans-data', `${scanJob}/${scanJob}_001.png`, env), 'permission');
    assert.equal(fs.existsSync(path.join(jobDir, `${scanJob}_001.png`)), true);

    const admin = resolvers({ isAdmin: true }, { scan: [], sheet: [], sheets: [] });
    const result = plain(await admin.deleteWorkerFiles(null, { files: [
      { area: 'scans-data', path: `${scanJob}/${scanJob}_001.png` },
      { area: 'scans-spool', path: `archimede_biennio-${scanJob}.pdf` },
      { area: 'scans-data', path: '../outside/secret.txt' },
    ] }, {}));
    assert.deepEqual(result, { deleted: 1, failed: [
      { area: 'scans-data', path: `${scanJob}/${scanJob}_001.png`, reason: 'permission' },
      { area: 'scans-data', path: '../outside/secret.txt', reason: 'not_found' },
    ] });
  } finally {
    // Restored before the temporary directory is removed.
    fs.chmodSync(jobDir, 0o755);
  }
});
