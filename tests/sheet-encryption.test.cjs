const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createDecipheriv, pbkdf2Sync } = require('node:crypto');
const { MongoClient, ObjectId } = require('mongodb');
require('tsx/cjs');
const { schemas } = require('../app/lib/schema.ts');
const { deriveSheetEncryptionKey, createSheetEncryptor, sealSheetEncryptionKey, openSheetEncryptionKey, createSheetDecryptor, sealSheetDecryptionPassword, openSheetDecryptionPassword } = require('../app/lib/sheetEncryption.ts');
const { queueOlimanagerJob, runNextOlimanagerJob } = require('../app/lib/olimanagerJobs.ts');
const schema = Object.values(schemas).find(schema => schema.fields_sensitive_names.includes('name') && schema.fields_sensitive_dates.includes('birthDate'));
const sheet = { schema: schema.name };
const password = 'synthetic-test-password';
const row = () => ({ data: { name: 'Mario Luigi', surname: 'Rossi', birthDate: '12/05/2010' } });

// Uses the same payload decoding and derivation as the existing Decripta resolver.
function decrypt(payloadB64, password) {
  const payload = JSON.parse(Buffer.from(payloadB64, 'base64'));
  const key = pbkdf2Sync(password, Buffer.from(payload.salt, 'base64'), 200000, 32, 'sha256');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(payload.ct, 'base64')), decipher.final()]));
}

test('worker encryption preserves the existing Decripta format and skips encrypted rows', async () => {
  const material = await deriveSheetEncryptionKey(password);
  const encrypt = createSheetEncryptor(material);
  const input = row();
  const update = encrypt(input, sheet);
  assert.equal(update['data.name'], 'ML');
  assert.equal(update['data.surname'], 'R');
  assert.equal(update['data.birthDate'], '01/01/2010');
  const restored = decrypt(update.encrypted_data, password);
  for (const field of ['name', 'surname', 'birthDate']) assert.equal(restored[field], input.data[field]);
  assert.throws(() => decrypt(update.encrypted_data, 'wrong password'));
  assert.deepEqual(encrypt({ ...input, encrypted_data: update.encrypted_data }, sheet), {});
  assert.deepEqual(input, row(), 'encryption must not mutate rows outside the transaction');
  assert.notEqual(encrypt(input, sheet).encrypted_data, update.encrypted_data);
  material.key.fill(0);
});

test('transient key envelope is authenticated, randomized and bound to the job and server secret', async () => {
  const material = await deriveSheetEncryptionKey(password);
  const jobId = new ObjectId().toString(), secret = 'synthetic-server-secret';
  const sealed = sealSheetEncryptionKey(jobId, material, secret);
  assert.notEqual(sealed, sealSheetEncryptionKey(jobId, material, secret));
  assert.ok(!sealed.includes(password));
  assert.deepEqual(openSheetEncryptionKey(jobId, sealed, secret), material);
  assert.throws(() => openSheetEncryptionKey(new ObjectId().toString(), sealed, secret));
  assert.throws(() => openSheetEncryptionKey(jobId, sealed, 'wrong secret'));
  const tampered = Buffer.from(sealed, 'base64'); tampered[40] ^= 1;
  assert.throws(() => openSheetEncryptionKey(jobId, tampered.toString('base64'), secret));
  assert.throws(() => sealSheetEncryptionKey(jobId, material, ''), /NEXTAUTH_SECRET/);
  material.key.fill(0);
});

const integrationUri = process.env.OLIMANAGER_WORKER_TEST_URI;
test('MongoDB encryption worker integration', { skip: !integrationUri }, async t => {
  assert.match(integrationUri, /^mongodb:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//);
  const client = new MongoClient(integrationUri, { serverSelectionTimeoutMS: 4000 });
  await client.connect();
  t.after(() => client.close());
  async function fixture(t, count = 3) {
    const db = client.db('olifogli_worker_test_' + new ObjectId());
    t.after(() => db.dropDatabase());
    const user = { _id: new ObjectId(), email: 'admin@example.invalid', isAdmin: true };
    const workbook = { _id: new ObjectId(), commonData: {} };
    const selectedSheet = { ...sheet, _id: new ObjectId(), name: 'Test', locked: false, workbookId: workbook._id };
    const rows = Array.from({ length: count }, () => ({ ...row(), _id: new ObjectId(), sheetId: selectedSheet._id, error: '' }));
    await db.collection('users').insertOne(user);
    await db.collection('workbooks').insertOne(workbook);
    await db.collection('sheets').insertOne(selectedSheet);
    await db.collection('rows').insertMany(rows);
    const transaction = async fn => {
      const session = client.startSession();
      try { return await session.withTransaction(() => fn(session)); } finally { await session.endSession(); }
    };
    const queue = (operation = 'crypt_sheets') => queueOlimanagerJob(db, transaction, user, { sheetIds: [selectedSheet._id] }, '', undefined, operation);
    const run = options => runNextOlimanagerJob(db, transaction, { workerId: 'test', validate() { assert.fail('No Olimanager validation for encryption'); }, ...options });
    return { db, queue, run, rows, selectedSheet };
  }
  await t.test('unlocked sheets are encrypted only by a worker holding their in-memory key', async t => {
    const f = await fixture(t);
    const material = await deriveSheetEncryptionKey(password);
    const job = await f.queue();
    assert.equal(job.status, 'queued');
    await assert.rejects(f.queue(), /già un lavoro/);
    assert.equal(await f.run(), false);
    assert.equal(await f.db.collection('olimanager_job_credentials').countDocuments(), 0);
    const persisted = JSON.stringify(await f.db.collection('olimanager_jobs').findOne());
    for (const secret of [password, material.key.toString('base64'), material.key.toString('hex')]) assert.equal(persisted.includes(secret), false);
    const keys = new Map([[job._id.toString(), createSheetEncryptor(material)]]);
    assert.equal(await f.run({ encryptionKeys: keys }), true);
    const finished = await f.db.collection('olimanager_jobs').findOne();
    assert.equal(finished.status, 'completed');
    assert.equal(finished.succeededRows, 3);
    assert.equal((await f.db.collection('sheets').findOne()).olimanagerJobId, undefined);
    for (const encrypted of await f.db.collection('rows').find().toArray()) {
      assert.equal(encrypted.data.name, 'ML');
      assert.equal(decrypt(encrypted.encrypted_data, password).name, 'Mario Luigi');
    }
    material.key.fill(0);
  });
  await t.test('lost key fails a partially committed job; a new request skips encrypted rows', async t => {
    const f = await fixture(t, 205);
    const material = await deriveSheetEncryptionKey(password);
    const job = await f.queue();
    let calls = 0;
    const encrypt = createSheetEncryptor(material);
    const keys = new Map([[job._id.toString(), (row, sheet) => { calls++; return encrypt(row, sheet); }]]);
    await f.run({ encryptionKeys: keys, shouldStop: () => calls >= 200 });
    assert.equal((await f.db.collection('olimanager_jobs').findOne()).succeededRows, 200);
    const first = await f.db.collection('rows').findOne({ _id: f.rows[0]._id });
    material.key.fill(0); keys.clear();
    await f.db.collection('olimanager_jobs').updateOne({ _id: job._id }, { $set: { cryptKeyExpiresAt: new Date(0) } });
    await f.run();
    assert.equal((await f.db.collection('olimanager_jobs').findOne()).status, 'failed');
    assert.equal((await f.db.collection('sheets').findOne()).olimanagerJobId, undefined);
    const retryMaterial = await deriveSheetEncryptionKey(password);
    const retry = await f.queue();
    await f.run({ encryptionKeys: new Map([[retry._id.toString(), createSheetEncryptor(retryMaterial)]]) });
    assert.equal((await f.db.collection('olimanager_jobs').findOne({ _id: retry._id })).status, 'completed');
    assert.equal((await f.db.collection('rows').findOne({ _id: first._id })).encrypted_data, first.encrypted_data);
    assert.equal(await f.db.collection('rows').countDocuments({ encrypted_data: { $exists: true, $ne: '' } }), 205);
    for (const id of [f.rows[0]._id, f.rows.at(-1)._id]) {
      const encrypted = await f.db.collection('rows').findOne({ _id: id });
      assert.equal(decrypt(encrypted.encrypted_data, password).name, 'Mario Luigi');
    }
    retryMaterial.key.fill(0);
  });
  await t.test('decryption restores mixed salts, leaves plaintext untouched and preserves failures', async t => {
    const f = await fixture(t, 4);
    const materialA = await deriveSheetEncryptionKey(password), materialB = await deriveSheetEncryptionKey(password);
    const wrongMaterial = await deriveSheetEncryptionKey('other password');
    const updates = [createSheetEncryptor(materialA)(f.rows[0], sheet), createSheetEncryptor(materialB)(f.rows[1], sheet),
      createSheetEncryptor(wrongMaterial)(f.rows[2], sheet)];
    for (let index = 0; index < updates.length; index++) await f.db.collection('rows').updateOne({ _id: f.rows[index]._id }, { $set: updates[index] });
    const job = await f.queue('decrypt_sheets');
    assert.equal(await f.run(), false, 'a worker without the transient password must not claim the job');
    const decryptor = createSheetDecryptor(Buffer.from(password));
    await f.run({ encryptionKeys: new Map([[job._id.toString(), decryptor]]) });
    const finished = await f.db.collection('olimanager_jobs').findOne();
    assert.equal(finished.status, 'completed_with_errors');
    assert.equal(finished.failedRows, 1);
    for (const id of [f.rows[0]._id, f.rows[1]._id]) {
      const restored = await f.db.collection('rows').findOne({ _id: id });
      assert.deepEqual(restored.data, row().data);
      assert.equal(restored.encrypted_data, undefined);
    }
    const failed = await f.db.collection('rows').findOne({ _id: f.rows[2]._id });
    assert.equal(failed.encrypted_data, updates[2].encrypted_data);
    assert.equal(failed.data.name, 'ML');
    const untouched = await f.db.collection('rows').findOne({ _id: f.rows[3]._id });
    assert.deepEqual(untouched, f.rows[3]);
    assert.equal(await f.db.collection('olimanager_job_credentials').countDocuments(), 0);
    assert.equal((await f.db.collection('sheets').findOne()).olimanagerJobId, undefined);
    decryptor.dispose(); materialA.key.fill(0); materialB.key.fill(0); wrongMaterial.key.fill(0);
  });
  await t.test('decryption loses its password after a restart and can be relaunched after a committed batch', async t => {
    const f = await fixture(t, 25);
    const material = await deriveSheetEncryptionKey(password), encrypt = createSheetEncryptor(material);
    await f.db.collection('rows').bulkWrite(f.rows.map(row => ({ updateOne: { filter: { _id: row._id }, update: { $set: encrypt(row, sheet) } } })));
    const job = await f.queue('decrypt_sheets');
    const decryptor = createSheetDecryptor(Buffer.from(password));
    let calls = 0;
    await f.run({ encryptionKeys: new Map([[job._id.toString(), async row => { calls++; return decryptor(row); }]]), shouldStop: () => calls >= 20 });
    assert.equal((await f.db.collection('olimanager_jobs').findOne()).succeededRows, 20);
    const alreadyRestored = await f.db.collection('rows').findOne({ _id: f.rows[0]._id });
    decryptor.dispose();
    await f.db.collection('olimanager_jobs').updateOne({ _id: job._id }, { $set: { cryptKeyExpiresAt: new Date(0) } });
    await f.run();
    const failed = await f.db.collection('olimanager_jobs').findOne();
    assert.equal(failed.status, 'failed'); assert.match(failed.error, /Decripta/);
    const retry = await f.queue('decrypt_sheets'), retryDecryptor = createSheetDecryptor(Buffer.from(password));
    await f.run({ encryptionKeys: new Map([[retry._id.toString(), retryDecryptor]]) });
    assert.equal((await f.db.collection('olimanager_jobs').findOne({ _id: retry._id })).status, 'completed');
    assert.equal(await f.db.collection('rows').countDocuments({ encrypted_data: { $exists: true } }), 0);
    assert.deepEqual(await f.db.collection('rows').findOne({ _id: alreadyRestored._id }), alreadyRestored);
    assert.equal((await f.db.collection('sheets').findOne()).olimanagerJobId, undefined);
    retryDecryptor.dispose(); material.key.fill(0);
  });
});

const redisUrl = process.env.SHEET_ENCRYPTION_TEST_REDIS_URL;
test('Redis Pub/Sub delivers the key only to a listening worker', { skip: !redisUrl }, async t => {
  assert.match(redisUrl, /^redis:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/\d+)?$/);
  const previous = process.env.REDIS_URL;
  process.env.REDIS_URL = redisUrl;
  t.after(() => { if (previous === undefined) delete process.env.REDIS_URL; else process.env.REDIS_URL = previous; });
  const { deliverSheetEncryptionKey, receiveSheetEncryptionKeys } = require('../app/lib/sheetEncryptionTransport.ts');
  const jobId = new ObjectId().toString(), secret = 'synthetic-server-secret';
  const material = await deriveSheetEncryptionKey(password);
  const envelope = sealSheetEncryptionKey(jobId, material, secret);
  let received;
  const stop = await receiveSheetEncryptionKeys(async (id, value) => {
    assert.equal(id, jobId);
    received = openSheetEncryptionKey(id, value, secret);
    return true;
  });
  t.after(stop);
  await deliverSheetEncryptionKey(jobId, envelope);
  assert.deepEqual(received, material);
  stop();
  await assert.rejects(deliverSheetEncryptionKey(jobId, envelope), /worker/);
  material.key.fill(0);
});

function resolverWith(dependencies, decrypt = false) {
  const { readFileSync } = require('node:fs');
  const { transpileModule, ModuleKind } = require('typescript');
  const exports = {};
  const code = transpileModule(readFileSync(require('node:path').resolve(__dirname, '../app/graphql/resolvers/cryptSheets.ts'), 'utf8'), {
    compilerOptions: { module: ModuleKind.CommonJS },
  }).outputText;
  require('node:vm').runInNewContext(code, { exports, Buffer, Date, Error, require(id) {
    if (Object.hasOwn(dependencies, id)) return dependencies[id];
    throw new Error('Unexpected dependency: ' + id);
  } });
  return decrypt ? (_, args, context) => exports.requestSheetCryptography(args, context, 'decrypt_sheets') : exports.default;
}

test('Cripta checks administrator privileges before deriving or delivering keys', async () => {
  const crypt = resolverWith({
    './utils': { get_authenticated_user: async () => ({ isAdmin: false }) },
    '@/app/lib/mongodb': {}, '@/app/lib/olimanagerJobs': {}, '@/app/lib/sheetEncryption': {}, '@/app/lib/sheetEncryptionTransport': {},
  });
  await assert.rejects(crypt(null, { sheetIds: [new ObjectId()], password }, {}), /only admins/);
});

test('failed key delivery cancels queued work, releases sheets and erases the local key', async () => {
  const jobId = new ObjectId(), material = { key: Buffer.alloc(32, 7), salt: Buffer.alloc(16, 4) };
  let cancelled = false, released = false;
  const transaction = fn => fn('session');
  const jobs = {
    async updateOne(filter, update, options) {
      assert.equal(filter.status, 'queued'); assert.equal(update.$set.status, 'failed'); assert.equal(options.session, 'session');
      cancelled = true; return { matchedCount: 1 };
    },
    async findOne() { return { status: 'failed' }; },
  };
  const crypt = resolverWith({
    './utils': { get_authenticated_user: async () => ({ isAdmin: true }) },
    '@/app/lib/mongodb': { getDb: async () => 'db', withTransaction: transaction },
    '@/app/lib/olimanagerJobs': {
      async queueOlimanagerJob(db, tx, user, targets, endpoint, protect, operation) {
        assert.equal(operation, 'crypt_sheets'); assert.equal(protect, undefined); assert.equal(endpoint, '');
        assert.deepEqual(Object.keys(targets), ['sheetIds']); return { _id: jobId };
      },
      jobCollections() { return { jobs, sheets: { async updateMany(filter, update) {
        assert.ok(filter.olimanagerJobId.equals(jobId)); assert.ok(update.$unset); released = true;
      } } }; },
    },
    '@/app/lib/sheetEncryption': { deriveSheetEncryptionKey: async () => material, sealSheetEncryptionKey: () => 'synthetic-envelope' },
    '@/app/lib/sheetEncryptionTransport': { async deliverSheetEncryptionKey(id, envelope) {
      assert.equal(id, jobId.toString()); assert.equal(envelope, 'synthetic-envelope'); throw new Error('offline');
    } },
  });
  await assert.rejects(crypt(null, { sheetIds: [new ObjectId()], password }, {}), /Worker non disponibile/);
  assert.ok(cancelled && released);
  assert.ok(material.key.every(value => value === 0));
});

test('decryption supports different salts, skips plaintext, rejects tampering and erases secrets', async () => {
  const first = await deriveSheetEncryptionKey(password), second = await deriveSheetEncryptionKey(password);
  const encrypted = [first, second].map(material => ({ ...row(), encrypted_data: createSheetEncryptor(material)(row(), sheet).encrypted_data }));
  const passwordBuffer = Buffer.from(password), decryptor = createSheetDecryptor(passwordBuffer);
  for (const input of encrypted) {
    const before = JSON.stringify(input);
    const restored = await decryptor(input);
    for (const [field, value] of Object.entries(row().data)) assert.equal(restored[`data.${field}`], value);
    assert.equal(JSON.stringify(input), before);
  }
  assert.deepEqual(await decryptor(row()), {});
  const wrong = createSheetDecryptor(Buffer.from('wrong password'));
  await assert.rejects(wrong(encrypted[0])); wrong.dispose();
  const payload = JSON.parse(Buffer.from(encrypted[0].encrypted_data, 'base64'));
  const ct = Buffer.from(payload.ct, 'base64'); ct[0] ^= 1; payload.ct = ct.toString('base64');
  await assert.rejects(decryptor({ encrypted_data: Buffer.from(JSON.stringify(payload)).toString('base64') }));
  await assert.rejects(decryptor({ encrypted_data: 'invalid payload' }));
  decryptor.dispose();
  assert.ok(passwordBuffer.every(byte => byte === 0));
  await assert.rejects(decryptor(encrypted[0]), /non più disponibile/);
  first.key.fill(0); second.key.fill(0);
});

test('transient password envelope is bound to decryption and to the job', () => {
  const jobId = new ObjectId().toString(), secret = 'synthetic-server-secret';
  const buffer = Buffer.from(password), envelope = sealSheetDecryptionPassword(jobId, buffer, secret);
  assert.notEqual(envelope, sealSheetDecryptionPassword(jobId, buffer, secret));
  assert.deepEqual(openSheetDecryptionPassword(jobId, envelope, secret), buffer);
  assert.throws(() => openSheetDecryptionPassword(new ObjectId().toString(), envelope, secret));
  assert.throws(() => openSheetDecryptionPassword(jobId, envelope, 'wrong secret'));
  assert.throws(() => openSheetEncryptionKey(jobId, envelope, secret));
  buffer.fill(0);
});

test('Decripta checks administrator privileges before preparing or delivering secrets', async () => {
  const decrypt = resolverWith({
    './utils': { get_authenticated_user: async () => ({ isAdmin: false }) },
    '@/app/lib/mongodb': {}, '@/app/lib/olimanagerJobs': {}, '@/app/lib/sheetEncryption': {}, '@/app/lib/sheetEncryptionTransport': {},
  }, true);
  await assert.rejects(decrypt(null, { sheetIds: [new ObjectId()], password }, {}), /only admins can decrypt/);
});

test('Decripta delivery failure releases queued work and zeroes the transient password', async () => {
  const jobId = new ObjectId();
  let passwordBuffer, released = false;
  const jobs = {
    async updateOne(filter, update) { assert.equal(filter.status, 'queued'); assert.equal(update.$set.status, 'failed'); return { matchedCount: 1 }; },
    async findOne() { return { status: 'failed' }; },
  };
  const decrypt = resolverWith({
    './utils': { get_authenticated_user: async () => ({ isAdmin: true }) },
    '@/app/lib/mongodb': { getDb: async () => 'db', withTransaction: async fn => fn('session') },
    '@/app/lib/olimanagerJobs': {
      async queueOlimanagerJob(db, tx, user, targets, endpoint, protect, operation) {
        assert.equal(operation, 'decrypt_sheets'); assert.equal(protect, undefined);
        assert.deepEqual(Object.keys(targets), ['sheetIds']); return { _id: jobId };
      },
      jobCollections: () => ({ jobs, sheets: { async updateMany() { released = true; } } }),
    },
    '@/app/lib/sheetEncryption': { sealSheetDecryptionPassword(id, buffer) { passwordBuffer = buffer; return 'synthetic-envelope'; } },
    '@/app/lib/sheetEncryptionTransport': { async deliverSheetEncryptionKey() { throw new Error('offline'); } },
  }, true);
  await assert.rejects(decrypt(null, { sheetIds: [new ObjectId()], password }, {}), /Worker non disponibile per la decrittazione/);
  assert.ok(released); assert.ok(passwordBuffer.every(byte => byte === 0));
});
