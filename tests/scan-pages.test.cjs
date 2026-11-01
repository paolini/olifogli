const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { ObjectId } = require('bson');

function page(file) {
  const sheet = { _id: new ObjectId(), schema: 'example' };
  const job = { _id: new ObjectId(), sheetId: sheet._id,
    timestamp: new Date(), messages: [{ status: 'completed', message: 'done', timestamp: new Date() }] };
  const subscriptions = [], queries = [], refreshed = [];
  const dependencies = {
    react: React, 'react/jsx-runtime': require('react/jsx-runtime'), bson: { ObjectId },
    '@apollo/client': {
      gql: strings => strings.join(''),
      useApolloClient: () => ({}),
      useMutation: () => [() => {}, {}],
      useSubscription(document, options) { subscriptions.push({ document, options }); return {}; },
      useQuery(document, options) {
        queries.push({ document, options });
        return { data: { scanResults: [] }, refetch: () => { refreshed.push('results'); } };
      },
    },
    './Button': { __esModule: true, default: ({ children }) => React.createElement('button', {}, children) },
    './Error': { __esModule: true, default: () => null },
    './Loading': { __esModule: true, default: () => 'loading' },
    '../lib/util': { myTimestamp: () => 'date', pluralize: () => '' },
    '../lib/schema': { schemas: { example: { scans_to_data_dict: () => ({}) } } },
  };
  const generated = {
    useAddRowMutation: () => [() => {}, {}], usePatchRowMutation: () => [() => {}, {}],
    useScanJobsQuery(options) {
      queries.push({ document: 'jobs', options });
      return { data: { scanJobs: [job] }, refetch: () => { refreshed.push('jobs'); } };
    },
    useScanSheetJobsQuery(options) {
      queries.push({ document: 'pdf', options });
      return { data: { scanSheetJobs: [{ ...job, status: 'completed' }] },
        refetch: () => { refreshed.push('pdf'); } };
    },
  };
  dependencies['@/app/graphql/generated'] = generated;
  dependencies['../graphql/generated'] = generated;
  const exports = {};
  const source = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(source, { exports, require(id) {
    if (Object.hasOwn(dependencies, id)) return dependencies[id];
    throw new Error('Unexpected dependency: ' + id);
  } });
  const html = renderToStaticMarkup(React.createElement(exports.default, { sheet, data_rows: [] }));
  return { subscriptions, queries, refreshed, sheet, job, html };
}

test('scan events refresh both the progress log and results already on screen', () => {
  const f = page('app/components/ScansImport.tsx');
  assert.ok(f.html.includes('Nessun dato acquisito'));
  assert.equal(f.subscriptions.length, 2);
  for (const { document, options } of f.subscriptions) {
    assert.ok(document.includes('scanJobUpdated'));
    assert.equal(String(options.variables.sheetId), String(f.sheet._id));
    // Initial/reconnect invalidation uses false, which must also refresh.
    options.onData({ data: { data: { scanJobUpdated: false } } });
    options.onData({ data: { data: { scanJobUpdated: true } } });
  }
  assert.deepEqual(f.refreshed, ['jobs', 'jobs', 'results', 'results']);
  assert.ok(f.queries.every(query => query.options.fetchPolicy === 'cache-and-network'));
  assert.equal(String(f.queries[1].options.variables.jobId), String(f.job._id));
});

test('generated PDFs refresh after worker events and reconnect invalidations', () => {
  const f = page('app/components/ScansSheetExport.tsx');
  assert.ok(f.html.includes(`/scansheet/${f.job._id}/pdf`));
  const { document, options } = f.subscriptions[0];
  assert.ok(document.includes('scanSheetJobUpdated'));
  assert.equal(String(options.variables.sheetId), String(f.sheet._id));
  options.onData({ data: { data: { scanSheetJobUpdated: false } } });
  options.onData({ data: { data: { scanSheetJobUpdated: true } } });
  assert.deepEqual(f.refreshed, ['pdf', 'pdf']);
  assert.equal(f.queries[0].options.fetchPolicy, 'cache-and-network');
});
