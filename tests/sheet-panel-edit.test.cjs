const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { act } = React;
const { JSDOM } = require('jsdom');

test('sheet panel edits stay local until save, preserve a failed draft, and can be cancelled', async t => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  const previous = new Map();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const { createRoot } = require('react-dom/client');
  const calls = [];
  let resolveSave, rejectSave, closed = 0;
  function useMutation() {
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState(null);
    return [async options => {
      calls.push(options);
      setLoading(true);
      try {
        await new Promise((resolve, reject) => { resolveSave = resolve; rejectSave = reject; });
      } catch (err) {
        setError(err);
        throw err;
      } finally {
        setLoading(false);
      }
    }, { loading, error, reset: () => setError(null) }];
  }
  const source = readFileSync(path.join(__dirname, '../app/components/SheetInfo.tsx'), 'utf8');
  const panel = source.slice(source.indexOf('function PanelEdit('), source.indexOf('\nfunction SheetConfigure'));
  const exports = {};
  vm.runInNewContext(ts.transpileModule(panel + '\nexports.PanelEdit = PanelEdit;', {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, {
    exports, require, useState: React.useState, useMutation, UPDATE_SHEET: {},
    Button: ({ children, ...props }) => React.createElement('button', props, children),
    Error: ({ error }) => error ? React.createElement('div', { role: 'alert' }, error.message) : null,
  });
  const container = document.getElementById('root');
  const root = createRoot(container);
  t.after(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  const sheet = { _id: 'sheet', commonData: { name: 'Old', remove: 'value', zero: 0 } };
  await act(async () => root.render(React.createElement(exports.PanelEdit, { sheet, profile: { isAdmin: true }, onClose: () => closed++ })));
  const input = key => [...container.querySelectorAll('tr')].find(row => row.querySelector('th')?.textContent === key)?.querySelector('input');
  const setValue = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
  async function type(element, value) {
    await act(async () => {
      setValue.call(element, value);
      element.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });
  }
  async function click(button) {
    await act(async () => button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })));
  }
  const button = label => [...container.querySelectorAll('button')].find(el => el.textContent === label);
  input('name').focus();
  for (const value of ['N', 'Ne', 'New', 'New value']) await type(input('name'), value);
  assert.equal(input('name').value, 'New value');
  assert.equal(input('name').disabled, false);
  assert.equal(document.activeElement, input('name'));
  assert.equal(calls.length, 0);
  await click(input('remove').closest('tr').querySelector('button'));
  assert.equal(container.querySelector('[placeholder="nome campo"]'), null);
  await click(button('Aggiungi'));
  await click(button('Salva'));
  assert.match(container.querySelector('[role="alert"]').textContent, /nome di ogni nuovo campo/);
  assert.equal(calls.length, 0);
  await type(container.querySelector('[placeholder="nome campo"]'), 'added');
  await type(container.querySelector('[placeholder="valore"]'), 'new');
  await click(button('Aggiungi'));
  const secondKey = container.querySelectorAll('[placeholder="nome campo"]')[1];
  const secondValue = container.querySelectorAll('[placeholder="valore"]')[1];
  await type(secondKey, 'added');
  await type(secondValue, 'another');
  await click(button('Salva'));
  assert.match(container.querySelector('[role="alert"]').textContent, /già presente/);
  assert.equal(calls.length, 0);
  await type(secondKey, 'second');
  await click(button('Aggiungi'));
  const emptyRow = container.querySelectorAll('[placeholder="nome campo"]')[2].closest('tr');
  await click(emptyRow.querySelector('button'));
  assert.equal(container.querySelectorAll('[placeholder="nome campo"]').length, 2);
  assert.equal(calls.length, 0);
  assert.equal(sheet.commonData.name, 'Old');
  assert.equal(sheet.commonData.remove, 'value');
  await click(button('Salva'));
  assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0].variables)), { _id: 'sheet', commonData: { name: 'New value', zero: 0, added: 'new', second: 'another' } });
  assert.equal(calls[0].awaitRefetchQueries, true);
  assert.equal(closed, 0);
  await act(async () => rejectSave(new Error('Save failed')));
  assert.equal(container.querySelector('[role="alert"]').textContent, 'Save failed');
  assert.equal(input('name').value, 'New value');
  assert.equal(closed, 0);
  await click(button('Salva'));
  await act(async () => resolveSave());
  assert.equal(closed, 1);
  await type(input('name'), 'Unsaved');
  await click(button('Annulla'));
  assert.equal(closed, 2);
  assert.equal(calls.length, 2);
  assert.equal(sheet.commonData.name, 'Old');
});
