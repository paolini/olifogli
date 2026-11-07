const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { act } = React;
const { JSDOM } = require('jsdom');

for (const scenario of ['unchanged', 'permissions', 'not-selected', 'stale', 'keep-helper', 'addition-only', 'no-permissions']) test(`venue sheet preview: ${scenario}`, async t => {
  const unchanged = ['unchanged', 'no-permissions'].includes(scenario);
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' });
  const previous = new Map();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const { createRoot } = require('react-dom/client');
  const container = document.getElementById('root'), root = createRoot(container);
  t.after(async () => {
    await act(async () => root.unmount()); dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  });
  const calls = [], created = [], updated = [];
  let refreshes = 0;
  let completed = false;
  const data = { workbook: { commonData: { olimanager_archimede_biennio_contest_id: '31', olimanager_archimede_triennio_contest_id: '32' } } };
  const choices = { olimanagerVenueSheetChoices: [{ id: 'math', name: 'Matematica', editions: [{ id: '2025', name: 'Archimede', year: 2025,
    contests: [{ id: 31, name: 'Biennio', scope: 'SCHOOL' }, { id: 32, name: 'Triennio', scope: 'SCHOOL' }, { id: 33, name: 'Distrettuale', scope: 'ZONE' }],
  }] }] };
  const existing = [{ _id: 'existing-sheet', name: 'CODE', schema: 'archimede_biennio', commonData: {}, permissions: scenario === 'no-permissions' ? [] : unchanged
    ? [{ email: 'ref@example.org', role: 'admin' }]
    : [{ email: 'old@example.org', role: 'admin' }, { email: 'coord@example.org', role: 'editor' }, { email: 'helper@example.org', role: 'editor' }] }];
  const preview = { sheets: ['archimede_biennio', 'archimede_triennio'].map(schema => ({ name: 'CODE', schema, commonData: { Nome_scuola: 'Test', Distretto: 'Pisa' }, permissions: [{ email: 'ref@example.org', role: 'admin', __typename: 'Permission' }] })), warnings: [] };
  if (scenario === 'no-permissions') preview.sheets.forEach(s => { s.permissions = []; });
  else if (!unchanged) preview.sheets.forEach(s => s.permissions.push({ email: 'coord@example.org', role: 'view', __typename: 'Permission' }));
  const hooks = {
    useGetWorkbookQuery: () => ({ data }),
    useGetSheetsQuery: () => ({ data: { sheets: existing }, refetch: async () => {
      refreshes++;
      return { data: { sheets: scenario === 'stale' && refreshes > 1 ? existing.map(s => ({ ...s, permissions: [] })) : existing } };
    } }),
    useOlimanagerVenueSheetChoicesQuery: () => ({ data: choices }),
    usePrepareOlimanagerVenueSheetsMutation() {
      const [data, setData] = React.useState();
      return [async args => { calls.push(args); const data = { prepareOlimanagerVenueSheets: preview }; setData(data); return { data }; }, { data, reset: () => setData(undefined) }];
    },
    useAddSheetsMutation: () => [async args => { created.push(args); }, {}],
    useUpdateSheetMutation: () => [async args => { updated.push(args); }, {}],
  };
  const filename = path.join(__dirname, '../app/components/OlimanagerVenueSheetsCreation.tsx');
  const source = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  vm.runInNewContext(source, { exports, require(name) {
    if (name === 'react' || name === 'react/jsx-runtime') return require(name);
    if (name === '@apollo/client') return { gql: () => ({}) };
    if (name === '../graphql/generated') return hooks;
    if (name === '../lib/olimanagerVenueSheetConfig') return { ARCHIMEDE_CONTEST_KEYS: { biennio: 'olimanager_archimede_biennio_contest_id', triennio: 'olimanager_archimede_triennio_contest_id' } };
    if (name === '../lib/olimanagerVenueSheetPlan') {
      const exports = {};
      const helper = ts.transpileModule(readFileSync(path.join(__dirname, '../app/lib/olimanagerVenueSheetPlan.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
      vm.runInNewContext(helper, { exports });
      return exports;
    }
    if (name === './Button') return { default: props => React.createElement('button', props) };
    if (name === './Error') return { default: props => React.createElement('div', {}, props.error ? String(props.error) : '') };
    if (name === './Loading') return { default: () => null };
    throw new Error(`Unexpected import ${name}`);
  } });
  await act(async () => root.render(React.createElement(exports.default, { workbookId: 'workbook', done: () => { completed = true; } })));
  assert.deepEqual([...container.querySelectorAll('select')].map(s => s.value), ['math', '2025', '31', '32']);
  assert.equal(container.querySelectorAll('select')[2].textContent.includes('Distrettuale'), false);
  const button = text => [...container.querySelectorAll('button')].find(b => b.textContent.includes(text));
  assert.equal(button('anteprima').textContent, 'Carica anteprima');
  const biennio = container.querySelectorAll('select')[2];
  await act(async () => { biennio.value = '32'; biennio.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
  assert.equal(button('anteprima').textContent, 'Salva configurazione e carica anteprima');
  await act(async () => { biennio.value = '31'; biennio.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
  assert.equal(button('anteprima').textContent, 'Carica anteprima');
  await act(async () => button('anteprima').click());
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0].variables)), { workbookId: 'workbook', olympiadId: 'math', biennioContestId: 31, triennioContestId: 32 });
  assert.match(container.textContent, unchanged ? /1 fogli da creare; 0 da aggiornare; 1 invariati/ : /1 fogli da creare; 1 da aggiornare; 0 invariati/);
  const rows = container.querySelectorAll('tbody tr');
  assert.equal(rows[0].querySelector('input').disabled, unchanged);
  assert.equal(rows[0].querySelector('input').checked, false);
  assert.equal(rows[1].querySelector('input').checked, true);
  if (!unchanged) {
    assert.match(rows[0].textContent, /old@example.org: rimuovi \(amministratore\)/);
    assert.match(rows[0].textContent, /ref@example.org: aggiungi \(amministratore\)/);
    assert.match(rows[0].textContent, /coord@example.org: editor → supervisore/);
    const modification = email => [...rows[0].querySelectorAll('li label')].find(label => label.textContent.includes(email)).querySelector('input');
    assert.equal([...rows[0].querySelectorAll('li input')].every(input => !input.checked), true);
    if (scenario === 'addition-only') {
      await act(async () => modification('ref@example.org').click());
      assert.equal(rows[0].querySelector('input').indeterminate, true);
    } else if (scenario !== 'not-selected') {
      await act(async () => rows[0].querySelector('input').click());
      assert.equal([...rows[0].querySelectorAll('li input')].every(input => input.checked), true);
      if (scenario === 'keep-helper') {
        await act(async () => modification('helper@example.org').click());
        assert.equal(rows[0].querySelector('input').indeterminate, true);
      }
    }
  }
  await act(async () => button('modifiche ai permessi').click());
  if (scenario === 'stale') {
    assert.equal(created.length, 0);
    assert.equal(updated.length, 0);
    assert.equal(completed, false);
    assert.match(container.textContent, /è cambiato dopo l’anteprima/);
    return;
  }
  assert.equal(updated.length, ['permissions', 'keep-helper', 'addition-only'].includes(scenario) ? 1 : 0);
  if (updated.length) {
    assert.equal(updated[0].variables._id, 'existing-sheet');
    const desired = [{ email: 'ref@example.org', role: 'admin' }, { email: 'coord@example.org', role: 'view' }];
    const expected = scenario === 'permissions' ? desired
      : scenario === 'keep-helper' ? [{ email: 'helper@example.org', role: 'editor' }, ...desired]
      : [...existing[0].permissions, desired[0]];
    assert.deepEqual(JSON.parse(JSON.stringify(updated[0].variables.permissions)), expected);
    assert.deepEqual(Object.keys(updated[0].variables).sort(), ['_id', 'permissions']);
  }
  assert.equal(created[0].variables.sheets.length, 1);
  assert.equal(created[0].variables.sheets[0].schema, 'archimede_triennio');
  if (scenario === 'no-permissions') assert.equal(created[0].variables.sheets[0].permissions.length, 0);
  else assert.equal('__typename' in created[0].variables.sheets[0].permissions[0], false);
  assert.equal(completed, true);
});
