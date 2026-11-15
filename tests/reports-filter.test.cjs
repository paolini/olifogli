const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const { ObjectId } = require('mongodb');

// Minimal MongoDB matcher for the operators used by getAllSheets.
function matches(doc, query) {
  return Object.entries(query).every(([key, expected]) => {
    if (key === '$and') return expected.every(part => matches(doc, part));
    if (key === '$or') return expected.some(part => matches(doc, part));
    const value = key.split('.').reduce((obj, part) => Array.isArray(obj) ? obj.map(o => o?.[part]) : obj?.[part], doc);
    if (expected && typeof expected === 'object' && '$ne' in expected) return value !== expected.$ne;
    if (Array.isArray(value)) return value.some(v => String(v) === String(expected));
    return String(value) === String(expected);
  });
}

function load(sheets) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(path.join(__dirname, '../app/graphql/resolvers/sheetsReportHelper.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(source, { exports, require(name) {
    if (name === 'mongodb') return { ObjectId };
    if (name === './utils') return { get_authenticated_user: async context => context.user };
    if (name === '@/app/lib/mongodb') return { getSheetsCollection: async () => ({
      find: query => ({ toArray: async () => sheets.filter(sheet => matches(sheet, query)) }),
    }) };
    throw new Error(`Unexpected import: ${name}`);
  } });
  return exports;
}

const workbookId = new ObjectId();
const teacher = { _id: new ObjectId(), email: 'teacher@example.org' };
const sheet = (name, extra) => ({ _id: new ObjectId(), name, workbookId, permissions: [{ email: 'teacher@example.org', role: 'editor' }], ...extra });
const sheets = [
  sheet('open'),
  sheet('closed', { closed: true }),
  sheet('locked', { locked: true }),
  sheet('other teacher closed', { closed: true, permissions: [{ email: 'other@example.org', role: 'editor' }] }),
];

for (const [user, expected] of [
  [teacher, ['closed', 'locked']],
  [{ ...teacher, isAdmin: true }, ['closed', 'locked', 'other teacher closed']],
]) {
  test(`regression #64: "closed or locked" keeps both filters for ${user.isAdmin ? 'admins' : 'teachers'}`, async () => {
    const { getAllSheets } = load(sheets);
    const found = await getAllSheets(workbookId, null, null, 'closed_or_locked', { user });
    assert.deepEqual(found.map(s => s.name).sort(), expected);
  });
}

test('teachers see only their sheets in every state', async () => {
  const { getAllSheets } = load(sheets);
  for (const state of [null, 'open', 'closed_not_locked', 'locked']) {
    const found = await getAllSheets(workbookId, null, null, state, { user: teacher });
    assert.ok(found.every(s => s.permissions.some(p => p.email === teacher.email)), String(state));
  }
});
