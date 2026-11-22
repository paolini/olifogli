const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const workbook = 'w'.repeat(24), sheet = 's'.repeat(24);
const scanJob = 'a'.repeat(24), oldScanJob = 'b'.repeat(24), sheetJob = 'c'.repeat(24), orphanJob = 'd'.repeat(24);
const group = fields => ({
  kind: 'scan', jobId: null, jobExists: true, sheetId: sheet, sheetName: 'Liceo Galilei',
  workbookId: workbook, workbookName: 'Archimede 2026', status: 'completed', timestamp: '2026-11-20T10:00:00Z',
  fileCount: 2, totalSize: 2048, folders: ['data'], lastModified: '2026-11-20T10:00:00Z', ...fields,
});
const GROUPS = [
  group({ jobId: scanJob }),
  group({ jobId: oldScanJob, status: 'error', fileCount: 1, totalSize: 4096 }),
  group({ kind: 'sheet', jobId: sheetJob }),
  group({ jobId: orphanJob, jobExists: false, sheetId: null, sheetName: null, workbookId: null, workbookName: null, status: null }),
  group({ jobExists: false, sheetId: null, sheetName: null, workbookId: null, workbookName: null, status: null, fileCount: 1 }),
];

function render(params) {
  const queries = [];
  const dependencies = {
    react: React, 'react/jsx-runtime': require('react/jsx-runtime'),
    '@apollo/client': {
      gql: strings => strings.join(''),
      useMutation: () => [() => {}, { loading: false }],
      useQuery(document, options) {
        queries.push({ document, options });
        if (document.includes('workerFileGroupFiles')) return { data: { workerFileGroupFiles: [
          { area: 'scans-data', path: `${scanJob}/${scanJob}_001.png`, folder: 'data', size: 1024, modifiedAt: '2026-11-20T10:00:00Z' },
          { area: 'scans-spool', path: `aborted/archimede-${scanJob}.pdf`, folder: 'aborted', size: 1024, modifiedAt: '2026-11-20T10:00:00Z' },
        ] } };
        return { data: { workerFiles: { areas: [
          { area: 'scans-data', label: 'Dati delle scansioni', kind: 'scan', available: true },
          { area: 'scans-spool', label: 'Spool delle scansioni', kind: 'scan', available: false },
        ], groups: GROUPS } } };
      },
    },
    'next/link': { __esModule: true, default: ({ href, children }) => React.createElement('a', { href }, children) },
    'next/image': { __esModule: true, default: ({ src }) => React.createElement('img', { src }) },
    'next/navigation': {
      useRouter: () => ({ push() {} }), usePathname: () => '/files',
      useSearchParams: () => new URLSearchParams(params),
    },
    './Button': { __esModule: true, default: ({ children }) => React.createElement('button', {}, children) },
    // The header breadcrumbs, rendered in place as the NavBar shows them.
    './BreadcrumbsProvider': { HeaderBreadcrumbs: ({ breadcrumbs }) => React.createElement('nav', {}, breadcrumbs.map((crumb, i) =>
      crumb.href ? React.createElement('a', { key: i, href: crumb.href }, crumb.label) : React.createElement('b', { key: i }, crumb.label))) },
    './Error': { __esModule: true, default: () => null },
    './Loading': { __esModule: true, default: () => 'loading' },
    '../lib/util': {
      myTimestamp: date => `data:${date}`,
      pluralize: (count, singular, plural) => `${count} ${count === 1 ? singular : plural}`,
    },
    '../lib/useProfile': { __esModule: true, default: () => ({ isAdmin: true }) },
  };
  const exports = {};
  const source = ts.transpileModule(readFileSync('app/components/WorkerFiles.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(source, { exports, URLSearchParams, require(id) {
    if (Object.hasOwn(dependencies, id)) return dependencies[id];
    throw new Error('Unexpected dependency: ' + id);
  } });
  return { html: renderToStaticMarkup(React.createElement(exports.default)), queries };
}

const decode = html => html.replace(/&amp;/g, '&').replace(/%3A/g, ':');

test('the root lists scans, generated sheets and orphans, and warns about missing directories', () => {
  const html = decode(render('').html);
  assert.match(html, /href="\/files\?kind=scan">📁 Scansioni/);
  assert.match(html, /href="\/files\?kind=sheet">📁 Fogli generati/);
  assert.match(html, /href="\/files\?kind=orphans">📁 Orfani/);
  assert.match(html, /Spool delle scansioni: directory non disponibile/);
});

test('scans are grouped by workbook, then by sheet, then by job', () => {
  let html = decode(render('kind=scan').html);
  assert.match(html, new RegExp(`href="/files\\?kind=scan&workbook=${workbook}">📁 Archimede 2026`));
  assert.match(html, /<b>Scansioni<\/b>/);

  html = decode(render(`kind=scan&workbook=${workbook}`).html);
  assert.match(html, new RegExp(`href="/files\\?kind=scan&workbook=${workbook}&sheet=${sheet}">📁 Liceo Galilei`));

  html = decode(render(`kind=scan&workbook=${workbook}&sheet=${sheet}`).html);
  assert.match(html, new RegExp(`&job=scan:${scanJob}">📁 data:2026-11-20T10:00:00Z`));
  assert.match(html, new RegExp(`&job=scan:${oldScanJob}"`));
  assert.ok(!html.includes(sheetJob), 'generated sheets are not listed among scans');
  assert.match(html, /completato/);
  assert.match(html, /errore/);
  assert.match(html, /<b>Liceo Galilei<\/b>/);
  // The path is in the header breadcrumbs, each level linked but the current one.
  assert.match(html, new RegExp(`<nav><a href="/files">file</a><a href="/files\\?kind=scan">Scansioni</a><a href="/files\\?kind=scan&workbook=${workbook}">Archimede 2026</a><b>Liceo Galilei</b></nav>`));
});

test('orphans list deleted jobs and files without a job', () => {
  const html = decode(render('kind=orphans').html);
  assert.match(html, new RegExp(`job=scan:${orphanJob}">📁 scansione del data:`));
  assert.match(html, /job=scan:">📁 scansione: file senza lavoro/);
  assert.ok(!html.includes(`job=scan:${scanJob}`));
});

test('a job shows its files with their phase, and a missing job links back', () => {
  const { html, queries } = render(`kind=scan&workbook=${workbook}&sheet=${sheet}&job=scan:${scanJob}`);
  assert.ok(queries.some(query => query.options?.variables?.jobId === scanJob));
  assert.match(html, new RegExp(`${scanJob}_001.png`));
  assert.match(html, /annullato/);
  assert.match(html, /Elimina tutti i file del lavoro/);
  assert.match(html, /mostra le anteprime delle immagini/);

  const missing = decode(render(`kind=scan&workbook=${workbook}&sheet=${sheet}&job=scan:${'e'.repeat(24)}`).html);
  assert.match(missing, /Questo lavoro non ha più file/);
  assert.match(missing, new RegExp(`href="/files\\?kind=scan&workbook=${workbook}&sheet=${sheet}">Torna indietro`));
});
