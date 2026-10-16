const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');
const Papa = require('papaparse');
const filename = path.resolve(__dirname, '../app/lib/csv.ts');
const exported = {};
// Execute in the same realm as Papa Parse, which checks RegExp with instanceof.
new Function('exports', 'require', ts.transpileModule(readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText)(exported, (id) => {
    assert.equal(id, 'papaparse');
    return Papa;
});
const { unparseCsv } = exported;
function parse(csv) {
  const result = Papa.parse(csv, { delimiter: ',' });
  assert.deepEqual(result.errors, []);
  return result.data;
}
const formulas = ['=1+1', '+SUM(A1:A2)', '-1+2', '@SUM(A1:A2)', '\t=1+1', '\r=1+1', '\n=1+1', '=SUM(1,\n2)', '=HYPERLINK("https://example.invalid","test")'];
// Both shapes are used by the actual exports: Sheet uses fields/data, while
// Sheets and WorkbookRanking use objects (including user-provided headers).
for (const shape of ['fields/data', 'objects']) {
  for (const value of formulas) {
    test(`${shape}: exports suspicious header and cell as text ${JSON.stringify(value)}`, () => {
      const input = shape === 'objects' ? [{ [value]: value }] : { fields: [value], data: [[value]] };
      assert.deepEqual(parse(unparseCsv(input)), [["'" + value], ["'" + value]]);
    });
  }
  test(`${shape}: preserves separators, quotes, Unicode and ordinary data`, () => {
    const values = ['Rossi, Bianchi', 'uno;due', 'dice "ciao"', 'Città 東京 🧮', 'prima\nseconda', '00123', '', 'a=b', "'testo", '2026-10-16'];
    const fields = values.map((_, i) => 'campo' + i);
    const input = shape === 'objects' ? [Object.fromEntries(fields.map((key, i) => [key, values[i]]))] : { fields, data: [values] };
    assert.deepEqual(parse(unparseCsv(input)), [fields, values]);
  });
}
test('numeric scores stay numeric while negative text is escaped', () => {
  assert.deepEqual(parse(unparseCsv([{ score: -12, text: '-12', zero: 0, missing: null }])),
    [['score', 'text', 'zero', 'missing'], ['-12', "'-12", '0', '']]);
});
test('empty exports remain valid', () => {
  assert.equal(unparseCsv([]), '');
  assert.equal(unparseCsv({ fields: ['Nome'], data: [] }), 'Nome\r\n');
});
