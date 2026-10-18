const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const { ObjectId } = require('mongodb');
const { NextRequest } = require('next/server');

const compiled = new Map();
async function fixture(t, configured = true) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'olifogli-image-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const root = path.join(directory, 'scans');
  const jobId = new ObjectId().toString();
  const otherId = new ObjectId().toString();
  const userId = new ObjectId();
  await fs.mkdir(path.join(root, jobId), { recursive: true });
  await fs.mkdir(path.join(root, otherId));
  const image = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  await fs.writeFile(path.join(root, jobId, 'page-1.png'), image);
  await fs.writeFile(path.join(root, otherId, 'private.png'), 'OTHER_JOB_SECRET');
  const outside = path.join(directory, 'outside.png');
  await fs.writeFile(outside, 'OUTSIDE_SECRET');
  const state = { user: { _id: userId }, job: { _id: new ObjectId(jobId), ownerId: userId }, jobReads: 0, fileReads: 0, handles: [] };
  const database = {
    async getUsersCollection() { return { async findOne() { return state.user; } }; },
    async getScanJobsCollection() {
      return { async findOne(query) {
        state.jobReads++;
        assert.equal(String(query._id), jobId);
        return state.job;
      } };
    },
  };
  function load(relative) {
    const filename = path.resolve(__dirname, '..', relative);
    if (!compiled.has(relative)) compiled.set(relative, ts.transpileModule(readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    }).outputText);
    const exports = {};
    vm.runInNewContext(compiled.get(relative), {
      exports, Uint8Array, process: { env: { SCANS_DATA_DIR: configured ? root : '' } },
      require(id) {
        if (id === '@/app/graphql/types') return { get_context: async () => ({ user_id: state.user ? userId : undefined }) };
        if (id === '@/app/lib/mongodb') return database;
        if (id === '@/app/graphql/resolvers/utils') return load('app/graphql/resolvers/utils.ts');
        if (id === 'fs/promises') return {
          async realpath(value) { state.fileReads++; return fs.realpath(value); },
          async open(...args) {
            if (state.beforeOpen) await state.beforeOpen();
            const handle = await fs.open(...args);
            state.handles.push(handle);
            return handle;
          },
        };
        if (['next/server', 'path', 'fs', 'mongodb', 'apollo-server-errors'].includes(id)) return require(id);
        throw new Error(`Unexpected dependency: ${id}`);
      },
    }, { filename });
    return exports;
  }
  const { GET } = load('app/scan/[jobId]/image/[filename]/route.ts');
  return {
    state, root, directory, jobId, otherId, image, outside,
    request: (filename = 'page-1.png', id = jobId) => GET(new NextRequest('https://app.invalid/scan/image'), { params: Promise.resolve({ jobId: id, filename }) }),
  };
}

test('authorized job owner receives the image and the file handle is closed', async t => {
  const f = await fixture(t);
  const response = await f.request();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/png');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), f.image);
  assert.equal(f.state.handles[0].fd, -1);
});

for (const [filename, type] of [['page.jpeg', 'image/jpeg'], ['page.JPG', 'image/jpeg'], ['page.webp', 'image/webp'], ['page.gif', 'image/gif'], ['pagina città.png', 'image/png']]) {
  test(`valid image filename ${filename}`, async t => {
    const f = await fixture(t);
    await fs.writeFile(path.join(f.root, f.jobId, filename), f.image);
    const response = await f.request(filename);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), type);
  });
}

test('invalid filenames and traversal are rejected before job or filesystem access', async t => {
  const f = await fixture(t);
  for (const filename of ['', '.', '..', '../outside.png', `../${f.otherId}/private.png`, '/etc/passwd',
    'nested/image.png', 'nested\\image.png', '..\\outside.png', '%2e%2e%2foutside.png',
    '%252e%252e%252foutside.png', 'image%00.png', 'image\0.png', 'image\n.png', 'file:outside.png',
    '.hidden.png', 'image.svg', 'image.html', 'image.pdf', 'image.png/..']) {
    const response = await f.request(filename);
    assert.equal(response.status, 404, JSON.stringify(filename));
    assert.equal((await response.text()).includes('SECRET'), false);
  }
  assert.equal(f.state.jobReads, 0);
  assert.equal(f.state.fileReads, 0);
});

test('jobId must be a canonical ObjectId path component', async t => {
  const f = await fixture(t);
  for (const id of ['', '..', '../other', 'not-an-id', `${f.jobId}/..`, `%2e%2e`, `${f.jobId}\0`]) {
    assert.equal((await f.request('page-1.png', id)).status, 404);
  }
  assert.equal(f.state.jobReads, 0);
  assert.equal(f.state.fileReads, 0);
});

test('anonymous and unauthorized users cannot reach the filesystem', async t => {
  const f = await fixture(t);
  f.state.user = null;
  await assert.rejects(f.request(), e => e.extensions.code === 'UNAUTHENTICATED');
  f.state.user = { _id: new ObjectId() };
  assert.equal((await f.request()).status, 403);
  assert.equal(f.state.fileReads, 0);
});

for (const role of ['admin', 'supervisor']) {
  test(`${role} retains access to scan images`, async t => {
    const f = await fixture(t);
    f.state.user = { _id: new ObjectId(), isAdmin: role === 'admin', isSupervisor: role === 'supervisor' };
    assert.equal((await f.request()).status, 200);
  });
}

test('missing jobs, files and configuration do not expose filesystem details', async t => {
  const f = await fixture(t);
  f.state.job = null;
  assert.equal((await f.request()).status, 403);
  f.state.job = { _id: new ObjectId(f.jobId), ownerId: f.state.user._id };
  assert.equal((await f.request('missing.png')).status, 404);
  const disabled = await fixture(t, false);
  assert.equal((await disabled.request()).status, 404);
  assert.equal(disabled.state.jobReads, 0);
});

test('symlinked images cannot read outside the job, another job, or even the same job', async t => {
  const f = await fixture(t);
  for (const [name, destination] of [
    ['outside.png', f.outside],
    ['other.png', path.join(f.root, f.otherId, 'private.png')],
    ['local.png', path.join(f.root, f.jobId, 'page-1.png')],
  ]) {
    await fs.symlink(destination, path.join(f.root, f.jobId, name));
    const response = await f.request(name);
    assert.equal(response.status, 404);
    assert.equal(await response.text(), 'Not Found');
  }
});

test('symlinked job directories cannot read another job or an external directory', async t => {
  const f = await fixture(t);
  await fs.rm(path.join(f.root, f.jobId), { recursive: true });
  for (const destination of [path.join(f.root, f.otherId), f.directory]) {
    await fs.symlink(destination, path.join(f.root, f.jobId));
    assert.equal((await f.request(destination === f.directory ? 'outside.png' : 'private.png')).status, 404);
    await fs.unlink(path.join(f.root, f.jobId));
  }
});

test('directories with image extensions are rejected and handles are closed', async t => {
  const f = await fixture(t);
  await fs.mkdir(path.join(f.root, f.jobId, 'directory.png'));
  assert.equal((await f.request('directory.png')).status, 404);
  assert.equal(f.state.handles[0].fd, -1);
});

test('a file replaced by a symlink after path validation is not followed', async t => {
  const f = await fixture(t);
  f.state.beforeOpen = async () => {
    const file = path.join(f.root, f.jobId, 'page-1.png');
    await fs.unlink(file);
    await fs.symlink(f.outside, file);
  };
  const response = await f.request();
  assert.equal(response.status, 404);
  assert.equal(await response.text(), 'Not Found');
});
