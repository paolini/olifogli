const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { ObjectId } = require('mongodb');

const source = ts.transpileModule(readFileSync(path.join(__dirname, '../app/graphql/resolvers/workbookAgeDistributionReport.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

function fixture(rows, sheets = [{ _id: new ObjectId(), schema: 'archimede_biennio' }], realFilters = false) {
  const calls = [];
  const exports = {};
  const workbookId = new ObjectId();
  function matches(sheet, query) {
    return Object.entries(query).every(([key, expected]) => {
      if (key === '$or') return expected.some(part => matches(sheet, part));
      const value = key.split('.').reduce((obj, part) => obj?.[part], sheet);
      if (expected && Object.hasOwn(expected, '$ne')) return value !== expected.$ne;
      return String(value) === String(expected);
    });
  }
  const helpers = {};
  if (realFilters) {
    const helperSource = ts.transpileModule(readFileSync(path.join(__dirname, '../app/graphql/resolvers/sheetsReportHelper.ts'), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    vm.runInNewContext(helperSource, { exports: helpers, require(name) {
      if (name === 'mongodb') return { ObjectId };
      if (name === './utils') return { get_authenticated_user: async context => context.user };
      if (name === '@/app/lib/mongodb') return { getSheetsCollection: async () => ({
        find: query => ({ toArray: async () => sheets.map(sheet => ({ workbookId, ...sheet })).filter(sheet => matches(sheet, query)) }),
      }) };
      throw new Error(`Unexpected import: ${name}`);
    } });
  }
  vm.runInNewContext(source, {
    exports,
    Date: class extends Date {
      constructor(...args) { super(...(args.length ? args : ['2026-01-01T12:00:00Z'])); }
    },
    require(name) {
      if (name === 'mongodb') return { ObjectId };
      if (name === '@/app/lib/schema') return { schemas: {
        archimede_biennio: { extract_ranking: true }, archimede_triennio: { extract_ranking: true }, other: {},
      } };
      if (name === './sheetsReportHelper') return { async getAllSheets(...args) {
        calls.push(args);
        return realFilters ? helpers.getAllSheets(...args) : sheets;
      } };
      if (name === '@/app/lib/mongodb') return { async getRowsCollection() { return {
        find(query) {
          const allowed = query.sheetId.$in.map(String);
          return { async toArray() { return rows.filter(row => allowed.includes(String(row.sheetId ?? sheets[0]._id))); } };
        },
      }; } };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  return { calls, run: async (args = {}, context = {}) => JSON.parse(JSON.stringify(await exports.default(null, {
    workbookId, ...args,
  }, context))) };
}

test('class years include all participants independently of birth date and preserve age statistics', async () => {
  const f = fixture([
    { data: { classYear: '1', birthDate: '2012-05-12' } },
    { data: { classYear: '2', birthDate: '2010-05-12' } },
    { data: { classYear: '2' } },
    { data: { classYear: '5', birthDate: 'invalid' } },
    { data: { classYear: ' 3 ', birthDate: '2012-05-12' } },
    { data: { birthDate: '2012-05-12' } },
    { data: { classYear: '6' } },
    { data: { classYear: '2x' } },
  ]);
  const [report] = await f.run();
  assert.deepEqual(report.items, [{ age: 14, rows: 3 }, { age: 16, rows: 1 }]);
  assert.equal(report.totalRows, 8);
  assert.equal(report.unknownAgeRows, 4);
  assert.equal(report.items.reduce((sum, item) => sum + item.rows, report.unknownAgeRows), report.totalRows);
  assert.equal(report.mean, 14.5);
  assert.equal(report.variance, 0.75);
  assert.deepEqual(report.classYearItems, [1, 2, 3, 4, 5].map((classYear, i) => ({ classYear, rows: [1, 2, 1, 0, 1][i] })));
  assert.equal(report.unknownClassYearRows, 3);
  assert.equal(report.classYearItems.reduce((sum, item) => sum + item.rows, report.unknownClassYearRows), 8);
});

test('schema, district and state selections restrict both distributions through the real sheet filter', async () => {
  const sheets = [
    { _id: new ObjectId(), schema: 'archimede_biennio', commonData: { Distretto: 'Pisa' }, closed: false },
    { _id: new ObjectId(), schema: 'archimede_biennio', commonData: { Distretto: 'Pisa' }, closed: true },
    { _id: new ObjectId(), schema: 'archimede_biennio', commonData: { Distretto: 'Lucca' }, closed: true },
    { _id: new ObjectId(), schema: 'archimede_triennio', commonData: { Distretto: 'Pisa' }, closed: true },
  ];
  const f = fixture(sheets.map(sheet => ({ sheetId: sheet._id, data: { classYear: '2', birthDate: '2012-05-12' } })), sheets, true);
  const context = { user: { isAdmin: true } };
  const scenarios = [
    [{}, 4],
    [{ schema: 'archimede_biennio' }, 3],
    [{ commonData: { Distretto: 'Pisa' } }, 3],
    [{ state: 'open' }, 1],
    [{ state: 'closed_not_locked' }, 3],
    [{ schema: 'archimede_biennio', commonData: { Distretto: 'Pisa' }, state: 'closed_not_locked' }, 1],
    [{ schema: 'archimede_biennio', commonData: { Distretto: 'Pisa' }, state: 'locked' }, 0],
  ];
  for (const [filters, expected] of scenarios) {
    const reports = await f.run(filters, context);
    assert.equal(reports.reduce((sum, report) => sum + report.totalRows, 0), expected, JSON.stringify(filters));
    assert.equal(reports.reduce((sum, report) => sum + report.classYearItems.reduce((n, item) => n + item.rows, report.unknownClassYearRows), 0), expected, JSON.stringify(filters));
  }
});

test('empty reports contain zero counts and missing or malformed years are counted as unknown', async () => {
  const [empty] = await fixture([]).run();
  assert.equal(empty.totalRows, 0);
  assert.equal(empty.mean, null);
  assert.equal(empty.unknownClassYearRows, 0);
  assert.equal(empty.unknownAgeRows, 0);
  assert.ok(empty.classYearItems.every(item => item.rows === 0));
  const [unknown] = await fixture([{}, { data: {} }, ...['', '0', '6', '1.0', '2abc'].map(classYear => ({ data: { classYear } }))]).run();
  assert.equal(unknown.unknownClassYearRows, 7);
  assert.equal(unknown.unknownAgeRows, 7);
  assert.equal(unknown.totalRows, 7);
  assert.equal(unknown.mean, null);
  assert.equal(unknown.variance, null);
  assert.ok(unknown.classYearItems.every(item => item.rows === 0));
});

test('age and class year distributions use the same authorized sheet filters and stay separated by schema', async () => {
  const first = { _id: new ObjectId(), schema: 'archimede_biennio' };
  const second = { _id: new ObjectId(), schema: 'archimede_triennio' };
  const ignored = { _id: new ObjectId(), schema: 'other' };
  const f = fixture([
    { sheetId: first._id, data: { classYear: '1' } },
    { sheetId: second._id, data: { classYear: '4' } },
    { sheetId: ignored._id, data: { classYear: '1' } },
    { sheetId: new ObjectId(), data: { classYear: '1' } },
  ], [first, second, ignored]);
  const context = { user_id: new ObjectId() };
  const commonData = { Distretto: 'Test' };
  const workbookId = new ObjectId();
  const reports = await f.run({ workbookId, schema: 'archimede_biennio', commonData, state: 'closed' }, context);
  assert.equal(String(f.calls[0][0]), String(workbookId));
  assert.equal(f.calls[0][1], 'archimede_biennio');
  assert.ok(f.calls[0][2] === commonData);
  assert.equal(f.calls[0][3], 'closed');
  assert.ok(f.calls[0][4] === context);
  assert.equal(reports.length, 2);
  assert.equal(reports[0].classYearItems[0].rows, 1);
  assert.equal(reports[1].classYearItems[0].rows, 0);
  assert.equal(reports[1].classYearItems[3].rows, 1);
});

test('the statistics page renders both charts with separate labels and counts', async () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const reports = await fixture([
    { data: { birthDate: '2012-05-12', classYear: '1' } },
    { data: { classYear: '2' } },
    { data: {} },
  ]).run();
  const charts = [];
  let reportVariables;
  const exports = {};
  const code = ts.transpileModule(readFileSync(path.join(__dirname, '../app/components/WorkbookAgeDistribution.tsx'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, { exports, require(name) {
    if (name === 'react/jsx-runtime') return require(name);
    if (name === '@apollo/client') return { gql: () => ({}) };
    if (name === 'chart.js') return { Chart: { register() {} } };
    if (name === 'react-chartjs-2') return { Chart: props => { charts.push(props); return null; } };
    if (name === '../graphql/generated') return {
      useGetSheetsQuery: () => ({ data: { sheets: [] }, refetch() {} }),
      useGetWorkbookAgeDistributionReportQuery: ({ variables }) => {
        reportVariables = variables;
        return { data: { workbookAgeDistributionReport: reports }, refetch() {} };
      },
    };
    if (name === './SheetsFilter') return { default: () => null, filterSheets: (_, sheets) => sheets };
    if (name === './SheetsFilterQuery') return { useSheetsFilterWithQuerystring: () => ({ filterState: {
      schemaFilter: 'archimede_biennio', distrettoFilter: 'Pisa', statoFilter: 'closed_not_locked',
    } }) };
    if (name === './useWorkbookUpdated') return { useWorkbookUpdated() {} };
    if (name === '../lib/schema') return { schemas: { archimede_biennio: { header: 'Biennio' } } };
    if (name === './Error' || name === './Loading') return { default: () => null };
    throw new Error(`Unexpected import: ${name}`);
  } });
  const markup = renderToStaticMarkup(React.createElement(exports.default, { workbookId: new ObjectId() }));
  assert.match(markup, /Distribuzione per età/);
  assert.match(markup, /Distribuzione per anno di corso/);
  assert.equal(charts.length, 2);
  assert.deepEqual(Array.from(charts[0].data.labels), ['14', 'Età non indicata']);
  assert.deepEqual(Array.from(charts[0].data.datasets[0].data), [1, 2]);
  assert.deepEqual(Array.from(charts[1].data.labels), ['1°', '2°', '3°', '4°', '5°', 'Non indicato']);
  assert.deepEqual(Array.from(charts[1].data.datasets[0].data), [1, 1, 0, 0, 0, 1]);
  assert.equal(charts[1].options.scales.x.title.text, 'Anno di corso');
  assert.equal((markup.match(/Totale studenti: 3/g) ?? []).length, 2);
  assert.equal(charts[0].data.datasets[0].data.reduce((sum, count) => sum + count, 0), 3);
  assert.equal(charts[1].data.datasets[0].data.reduce((sum, count) => sum + count, 0), 3);
  assert.equal(reportVariables.schema, 'archimede_biennio');
  assert.equal(reportVariables.commonData.Distretto, 'Pisa');
  assert.equal(reportVariables.state, 'closed_not_locked');
});
