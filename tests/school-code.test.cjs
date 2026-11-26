const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = ts.transpileModule(readFileSync(path.join(__dirname, '../app/lib/schoolCode.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const schoolCode = {};
vm.runInNewContext(source, { exports: schoolCode });
const { classifySchoolCode, sheetSchoolCode } = schoolCode;

const plain = value => JSON.parse(JSON.stringify(value));

test('ricava regione e macroarea dalla sigla della provincia', () => {
  const cases = [
    ['TOPS01000X', 'Piemonte', 'NO'],
    ['AOPS00101A', "Valle d'Aosta", 'NO'],
    ['MBPS04000R', 'Lombardia', 'NO'],
    ['TNPS01000Q', 'Trentino-Alto Adige', 'NE'],
    ['FOPS02000D', 'Emilia-Romagna', 'NE'],
    ['PIPS01000X', 'Toscana', 'C'],
    ['PSPS01000T', 'Marche', 'C'],
    ['RMPS5H500L', 'Lazio', 'C'],
    ['AQPS01000C', 'Abruzzo', 'C'],
    ['ISPS01000P', 'Molise', 'S'],
    ['BTPS01000E', 'Puglia', 'S'],
    ['RCPS01000T', 'Calabria', 'IS'],
    ['PAPS01000N', 'Sicilia', 'IS'],
    ['VSPS01000A', 'Sardegna', 'IS'],
  ];
  for (const [code, region, macroarea] of cases) {
    const result = classifySchoolCode(code);
    assert.equal(result.region, region, code);
    assert.equal(result.macroarea, macroarea, code);
  }
});

test('ogni macroarea comprende le regioni della issue', () => {
  const regionsByMacroarea = {};
  for (const province of ['TO', 'AO', 'GE', 'MI', 'VE', 'TN', 'TS', 'BO', 'FI', 'PG', 'AN', 'RM', 'AQ', 'NA', 'CB', 'PZ', 'BA', 'CA', 'PA', 'CZ']) {
    const { region, macroarea } = classifySchoolCode(`${province}PS01000X`);
    (regionsByMacroarea[macroarea] ??= new Set()).add(region);
  }
  assert.deepEqual(Object.fromEntries(Object.entries(regionsByMacroarea).map(([k, v]) => [k, v.size])),
    { NO: 4, NE: 4, C: 5, S: 4, IS: 3 });
});

test('ricava l\'indirizzo dal tipo di scuola', () => {
  const cases = [
    ['PIPS01000X', 'LS'],
    ['PIPC01000X', 'AL'],
    ['PIPM01000X', 'AL'],
    ['PIPL01000X', 'AL'],
    ['PISL01000X', 'AL'],
    ['PISD01000X', 'AL'],
    ['PITF01000X', 'TP'],
    ['PITD01000X', 'TP'],
    ['PIRI01000X', 'TP'],
    ['PIRH01000X', 'TP'],
    ['PIIS01000X', 'NI'],
  ];
  for (const [code, indirizzo] of cases) assert.equal(classifySchoolCode(code).indirizzo, indirizzo, code);
});

test('accetta minuscole e spazi', () => {
  assert.deepEqual(plain(classifySchoolCode(' pips01000x ')), { region: 'Toscana', macroarea: 'C', indirizzo: 'LS' });
});

test('codici non riconosciuti: indirizzo NI e nessuna macroarea', () => {
  for (const code of ['', null, undefined, 'Liceo Dini', 'PIPS0100', 'PIPS01000XY', '12PS01000X']) {
    assert.deepEqual(plain(classifySchoolCode(code)), { region: null, macroarea: null, indirizzo: 'NI' }, String(code));
  }
});

test('provincia sconosciuta: indirizzo dal tipo, nessuna macroarea', () => {
  assert.deepEqual(plain(classifySchoolCode('XXPS01000X')), { region: null, macroarea: null, indirizzo: 'LS' });
});

test('il codice del foglio viene dai dati comuni, altrimenti dal nome', () => {
  assert.equal(sheetSchoolCode({ name: 'Liceo', commonData: { Codice_meccanografico: ' PIPS01000X ' } }), 'PIPS01000X');
  assert.equal(sheetSchoolCode({ name: 'PIPS01000X', commonData: { Codice_meccanografico: '' } }), 'PIPS01000X');
  assert.equal(sheetSchoolCode({ name: 'PIPS01000X' }), 'PIPS01000X');
  assert.equal(sheetSchoolCode({}), '');
});
