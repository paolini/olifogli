const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(relative, dependencies = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(path.join(__dirname, '..', relative), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, { exports, require: name => {
    if (name in dependencies) return dependencies[name];
    throw new Error(`Unexpected import: ${name}`);
  } });
  return exports;
}
const schoolCode = load('app/lib/schoolCode.ts');
const { schoolsByIndirizzo } = load('app/lib/schoolsByIndirizzo.ts', { './schoolCode': schoolCode });

const plain = value => JSON.parse(JSON.stringify(value));
const sheet = (code, schema, nValidRows, extra = {}) => ({ name: code, schema, nValidRows, ...extra });

test('counts schools once and valid rows by biennio and triennio', () => {
  const rows = schoolsByIndirizzo([
    sheet('PIPS01000X', 'archimede_biennio', 10),
    sheet('PIPS01000X', 'archimede_triennio', 7),
    sheet('Liceo Dini', 'archimede_triennio', 3, { commonData: { Codice_meccanografico: 'pips02000x' } }),
    sheet('PIPC01000X', 'archimede_biennio', 4),
    sheet('PITF01000X', 'archimede_triennio', 5),
    sheet('PIIS01000X', 'archimede_biennio', 2),
    sheet('senza codice', 'archimede_biennio', 1),
  ]);
  assert.deepEqual(plain(rows), [
    { indirizzo: 'LS', schools: 2, biennio: 10, triennio: 10, total: 20 },
    { indirizzo: 'AL', schools: 1, biennio: 4, triennio: 0, total: 4 },
    { indirizzo: 'TP', schools: 1, biennio: 0, triennio: 5, total: 5 },
    { indirizzo: 'NI', schools: 2, biennio: 3, triennio: 0, total: 3 },
    { indirizzo: 'totale', schools: 6, biennio: 17, triennio: 15, total: 32 },
  ]);
});

test('no sheets: all rows are zero', () => {
  const rows = schoolsByIndirizzo([]);
  assert.equal(rows.length, 5);
  assert.ok(rows.every(r => r.schools === 0 && r.total === 0));
});
