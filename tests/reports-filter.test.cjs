const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const { ObjectId } = require('mongodb');

const schoolCode = {};
vm.runInNewContext(ts.transpileModule(readFileSync(path.join(__dirname, '../app/lib/schoolCode.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, { exports: schoolCode });

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
    if (name === '@/app/lib/schoolCode') return schoolCode;
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

const schoolSheets = [
  sheet('liceo pisa', { commonData: { Codice_meccanografico: 'PIPS01000X' } }),
  sheet('tecnico pisa', { commonData: { Codice_meccanografico: 'PITF01000X' } }),
  sheet('MIPS01000X'),
  sheet('senza codice'),
];

test('#88: macroarea and indirizzo come from the school code, or from the sheet name', async () => {
  const { getAllSheets } = load(schoolSheets);
  const admin = { ...teacher, isAdmin: true };
  const names = async school => (await getAllSheets(workbookId, null, null, null, { user: admin }, school)).map(s => s.name).sort();
  assert.deepEqual(await names({}), ['MIPS01000X', 'liceo pisa', 'senza codice', 'tecnico pisa']);
  assert.deepEqual(await names({ macroarea: 'C' }), ['liceo pisa', 'tecnico pisa']);
  assert.deepEqual(await names({ indirizzo: 'LS' }), ['MIPS01000X', 'liceo pisa']);
  assert.deepEqual(await names({ macroarea: 'C', indirizzo: 'LS' }), ['liceo pisa']);
  assert.deepEqual(await names({ indirizzo: 'NI' }), ['senza codice']);
});

test('#88: the school filters keep the permission filter', async () => {
  const { getAllSheets } = load([...schoolSheets, sheet('altro liceo', {
    commonData: { Codice_meccanografico: 'PIPS02000X' }, permissions: [{ email: 'other@example.org', role: 'editor' }],
  })]);
  const found = await getAllSheets(workbookId, null, null, null, { user: teacher }, { macroarea: 'C', indirizzo: 'LS' });
  assert.deepEqual(found.map(s => s.name), ['liceo pisa']);
});

test('#88: filterSheets applies macroarea and indirizzo on the client too', () => {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(path.join(__dirname, '../app/components/SheetsFilter.tsx'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, require(name) {
    if (name === 'react' || name === 'react/jsx-runtime') return require(name);
    if (name === '../lib/schoolCode') return schoolCode;
    if (name === '../graphql/generated' || name === '../lib/util') return {};
    if (name === '../lib/schema') return { schemas: {} };
    throw new Error(`Unexpected import: ${name}`);
  } });
  const state = { schemaFilter: '', distrettoFilter: '', statoFilter: '', macroareaFilter: 'NO', indirizzoFilter: 'LS', classYearFilter: '2' };
  const sheets = schoolSheets.map(s => ({ ...s, schema: 'archimede_biennio' }));
  assert.deepEqual(exports.filterSheets(state, sheets).map(s => s.name), ['MIPS01000X']);
  assert.deepEqual(JSON.parse(JSON.stringify(exports.reportFilterVariables(state))),
    { schema: null, commonData: null, state: null, macroarea: 'NO', indirizzo: 'LS' });
});

for (const report of ['workbookDistributionReport', 'workbookExerciseReport']) {
  test(`#88: ${report} restricts rows to the selected class year`, async () => {
    const queries = [];
    const gotSheets = [];
    const exports = {};
    const Competition = class {};
    vm.runInNewContext(ts.transpileModule(readFileSync(path.join(__dirname, `../app/graphql/resolvers/${report}.ts`), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText, { exports, require(name) {
      if (name === 'mongodb' || name === 'bson') return { ObjectId };
      if (name === './sheetsReportHelper') return { async getAllSheets(...args) {
        gotSheets.push(args);
        return [{ _id: new ObjectId(), schema: 'archimede_biennio' }];
      } };
      if (name === '@/app/lib/mongodb') return { async getRowsCollection() { return {
        find(query) { queries.push(query); return { async toArray() { return []; } }; },
      }; } };
      if (name === '@/app/lib/schema/Competition') return { default: Competition };
      if (name === '@/app/lib/schema') return { schemas: {
        archimede_biennio: Object.assign(new Competition(), { extract_ranking: true, fields: [] }),
      } };
      if (name === '@/app/lib/schema/fields') return { AnswerField: class {}, ChoiceAnswerField: class {} };
      if (name === '../../lib/logging') return { logDiagnostic() {} };
      throw new Error(`Unexpected import: ${name}`);
    } });
    const args = { workbookId, schema: null, commonData: null, state: null, macroarea: 'S', indirizzo: 'TP' };
    await exports.default(null, { ...args, classYear: '3' }, {});
    await exports.default(null, args, {});
    assert.deepEqual(JSON.parse(JSON.stringify(gotSheets.map(a => a[5]))), [{ macroarea: 'S', indirizzo: 'TP' }, { macroarea: 'S', indirizzo: 'TP' }]);
    assert.equal(queries[0]['data.classYear'], '3');
    assert.ok(!('data.classYear' in queries[1]));
  });
}
