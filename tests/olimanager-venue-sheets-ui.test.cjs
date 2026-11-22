const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { act } = React;
const { JSDOM } = require('jsdom');

function transpile(relative, dependencies = {}) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(path.join(__dirname, relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(source, { exports, require(name) {
    if (name in dependencies) return dependencies[name];
    throw new Error(`Unexpected import ${name}`);
  } });
  return exports;
}
const config = transpile('../app/lib/olimanagerVenueSheetConfig.ts');

for (const scenario of ['unchanged', 'permissions', 'not-selected', 'stale', 'keep-helper', 'addition-only', 'no-permissions', 'assign-contest', 'other-contest']) test(`venue sheet preview: ${scenario}`, async t => {
  const unchanged = ['unchanged', 'no-permissions', 'assign-contest', 'other-contest'].includes(scenario);
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
  const data = { workbook: { commonData: { olimanager_olympiad_id: 'math', olimanager_edition_id: '2025' } } };
  const sheetContest = { 'assign-contest': {}, 'other-contest': { olimanager_contest_id: '99' } }[scenario] || { olimanager_contest_id: '31' };
  const choices = { olimanagerVenueSheetChoices: [{ id: 'math', name: 'Matematica', editions: [{ id: '2025', name: 'Archimede', year: 2025,
    contests: [{ id: 31, name: 'Biennio', scope: 'SCHOOL' }, { id: 32, name: 'Triennio', scope: 'SCHOOL' }, { id: 33, name: 'Distrettuale', scope: 'ZONE' }],
  }] }] };
  const existing = [{ _id: 'existing-sheet', name: 'CODE', schema: 'archimede_biennio', commonData: { Nome_scuola: 'Manuale', ...sheetContest }, permissions: scenario === 'no-permissions' ? [] : unchanged
    ? [{ email: 'ref@example.org', role: 'manager' }]
    : [{ email: 'old@example.org', role: 'manager' }, { email: 'coord@example.org', role: 'editor' }, { email: 'helper@example.org', role: 'editor' }] }];
  const preview = { sheets: ['CODE', 'CODE2'].map(name => ({ name, schema: 'archimede_biennio', commonData: { Nome_scuola: 'Test', Distretto: 'Pisa', olimanager_contest_id: '31' }, permissions: [{ email: 'ref@example.org', role: 'manager', __typename: 'Permission' }] })), warnings: [] };
  if (scenario === 'no-permissions') preview.sheets.forEach(s => { s.permissions = []; });
  else if (!unchanged) preview.sheets.forEach(s => s.permissions.push({ email: 'coord@example.org', role: 'viewer', __typename: 'Permission' }));
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
    if (name === '../lib/olimanagerVenueSheetConfig') return config;
    if (name === '../lib/olimanagerVenueSheetPlan') return transpile('../app/lib/olimanagerVenueSheetPlan.ts', { './olimanagerVenueSheetConfig': config });
    if (name === './Button') return { default: props => React.createElement('button', props) };
    if (name === './Error') return { default: props => React.createElement('div', {}, props.error ? String(props.error) : '') };
    if (name === './Loading') return { default: () => null };
    throw new Error(`Unexpected import ${name}`);
  } });
  await act(async () => root.render(React.createElement(exports.default, { workbookId: 'workbook', done: () => { completed = true; } })));
  const selects = () => [...container.querySelectorAll('select')];
  const choose = async (index, value) => act(async () => { const select = selects()[index]; select.value = value; select.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
  assert.deepEqual(selects().map(s => s.value), ['math', '2025', '', '']);
  assert.equal(selects()[3].textContent.includes('Distrettuale'), false);
  const button = text => [...container.querySelectorAll('button')].find(b => b.textContent.includes(text));
  assert.equal(button('anteprima').disabled, true);
  // Each schema offers only the contests of its scope.
  const contestOptions = () => [...selects()[3].querySelectorAll('option')].map(o => o.value).filter(Boolean);
  await choose(2, 'gara_prime');
  assert.deepEqual(contestOptions(), ['33']);
  await choose(2, 'archimede_biennio');
  assert.deepEqual(contestOptions(), ['31', '32']);
  // The contest already assigned to the schema's sheets is proposed.
  assert.equal(selects()[3].value, scenario === 'assign-contest' || scenario === 'other-contest' ? '' : '31');
  await choose(1, '');
  assert.equal(button('anteprima').textContent, 'Salva configurazione e carica anteprima');
  await choose(1, '2025');
  await choose(3, '31');
  assert.equal(button('anteprima').textContent, 'Carica anteprima');
  await act(async () => button('anteprima').click());
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0].variables)), { workbookId: 'workbook', olympiadId: 'math', editionId: '2025', schema: 'archimede_biennio', contestId: 31 });
  const counts = { 'assign-contest': '1 fogli da creare; 1 da aggiornare; 0 invariati; 0 in conflitto', 'other-contest': '1 fogli da creare; 0 da aggiornare; 0 invariati; 1 in conflitto' }[scenario]
    || (unchanged ? '1 fogli da creare; 0 da aggiornare; 1 invariati; 0 in conflitto' : '1 fogli da creare; 1 da aggiornare; 0 invariati; 0 in conflitto');
  assert.match(container.textContent, new RegExp(counts));
  const rows = container.querySelectorAll('tbody tr');
  assert.equal(rows[0].querySelector('input').disabled, ['unchanged', 'no-permissions', 'other-contest'].includes(scenario));
  if (scenario === 'other-contest') assert.match(rows[0].textContent, /associato al contest #99/);
  // The status cell is colored by action; unchanged sheets stay white.
  const statusColor = row => row.querySelector('td:last-child').className;
  const expectedColor = { 'other-contest': 'bg-red-100', 'assign-contest': 'bg-yellow-100' }[scenario] || (unchanged ? '' : 'bg-yellow-100');
  assert.equal(statusColor(rows[0]), expectedColor);
  assert.equal(statusColor(rows[1]), 'bg-green-100');
  assert.equal(rows[0].className, '');
  assert.equal(rows[0].querySelector('input').checked, false);
  assert.equal(rows[1].querySelector('input').checked, true);
  // «Nascondi righe invariate» hides only the unchanged sheets, and shows them again.
  const hide = [...container.querySelectorAll('label')].find(label => label.textContent.includes('Nascondi righe invariate')).querySelector('input');
  await act(async () => hide.click());
  assert.equal(container.querySelectorAll('tbody tr').length, ['unchanged', 'no-permissions'].includes(scenario) ? 1 : 2);
  await act(async () => hide.click());
  assert.equal(container.querySelectorAll('tbody tr').length, 2);
  if (scenario === 'assign-contest') {
    assert.match(rows[0].textContent, /associa al contest #31/);
    await act(async () => rows[0].querySelector('input').click());
    assert.equal(rows[0].querySelector('li input').checked, true);
  }
  if (!unchanged) {
    assert.match(rows[0].textContent, /old@example.org: rimuovi \(responsabile\)/);
    assert.match(rows[0].textContent, /ref@example.org: aggiungi \(responsabile\)/);
    assert.match(rows[0].textContent, /coord@example.org: aiutante → osservatore/);
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
  assert.equal(updated.length, ['permissions', 'keep-helper', 'addition-only', 'assign-contest'].includes(scenario) ? 1 : 0);
  if (scenario === 'assign-contest') {
    assert.deepEqual(JSON.parse(JSON.stringify(updated[0].variables)), { _id: 'existing-sheet', commonData: { Nome_scuola: 'Manuale', olimanager_contest_id: '31' } });
  } else if (updated.length) {
    assert.equal(updated[0].variables._id, 'existing-sheet');
    const desired = [{ email: 'ref@example.org', role: 'manager' }, { email: 'coord@example.org', role: 'viewer' }];
    const expected = scenario === 'permissions' ? desired
      : scenario === 'keep-helper' ? [{ email: 'helper@example.org', role: 'editor' }, ...desired]
      : [...existing[0].permissions, desired[0]];
    assert.deepEqual(JSON.parse(JSON.stringify(updated[0].variables.permissions)), expected);
    assert.deepEqual(Object.keys(updated[0].variables).sort(), ['_id', 'permissions']);
  }
  assert.equal(created[0].variables.sheets.length, 1);
  assert.deepEqual([created[0].variables.sheets[0].name, created[0].variables.sheets[0].schema, created[0].variables.sheets[0].commonData.olimanager_contest_id], ['CODE2', 'archimede_biennio', '31']);
  if (scenario === 'no-permissions') assert.equal(created[0].variables.sheets[0].permissions.length, 0);
  else assert.equal('__typename' in created[0].variables.sheets[0].permissions[0], false);
  assert.equal(completed, true);
});
