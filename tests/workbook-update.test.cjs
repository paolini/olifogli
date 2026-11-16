const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { ObjectId } = require('bson');

// Workbooks have no owner: only global administrators may change them.
function fixture(user) {
  const workbookId = new ObjectId();
  const updates = [];
  const workbook = { _id: workbookId, name: 'Raccoglitore', createdBy: user.email, ownerId: user._id, commonData: {} };
  const exports = {};
  const source = ts.transpileModule(readFileSync(path.join(__dirname, '../app/graphql/resolvers/updateWorkbook.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(source, { exports, require(name) {
    if (name === '@/app/lib/mongodb') return { getWorkbooksCollection: async () => ({
      findOne: async () => workbook,
      updateOne: async (...args) => { updates.push(args); return { acknowledged: true }; },
    }) };
    if (name === './utils') return {
      get_authenticated_user: async () => user,
      check_admin: u => { if (!u.isAdmin) throw new Error('Forbidden'); },
    };
    throw new Error(`Unexpected import ${name}`);
  } });
  return { updates, run: args => exports.default(null, { _id: workbookId, ...args }, {}) };
}

test('the creator of a workbook cannot change it without being an administrator', async () => {
  const f = fixture({ _id: new ObjectId(), email: 'creator@example.org', isAdmin: false });
  await assert.rejects(f.run({ name: 'Nuovo' }), /Forbidden/);
  assert.equal(f.updates.length, 0);
});

test('a global administrator can change any workbook', async () => {
  const f = fixture({ _id: new ObjectId(), email: 'admin@example.org', isAdmin: true });
  assert.equal(await f.run({ name: 'Nuovo' }), true);
  assert.deepEqual(Object.keys(f.updates[0][1].$set).sort(), ['name', 'updatedBy', 'updatedOn']);
});
