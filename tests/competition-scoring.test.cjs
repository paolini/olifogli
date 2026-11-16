const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

// Run the real schema classes: scoring must not depend on stubs.
const root = path.resolve(__dirname, '..');
const cache = new Map();
function load(relative) {
  const filename = path.resolve(root, relative);
  if (cache.has(filename)) return cache.get(filename);
  const exports = {};
  cache.set(filename, exports);
  const source = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(source, {
    exports, console,
    require(id) {
      if (id === 'date-fns') return require(id);
      if (id.startsWith('@/')) return load(id.slice(2) + '.ts');
      if (id.startsWith('.')) return load(path.relative(root, path.resolve(path.dirname(filename), id + '.ts')));
      throw new Error(`Unexpected dependency: ${id}`);
    },
  }, { filename });
  return exports;
}

const archimedeKeys = JSON.parse(readFileSync(path.join(root, 'scripts/fixtures/archimede.json'), 'utf8'));
const student = { surname: 'Rossi', name: 'Anna', birthDate: '01/02/2012', classSection: 'A' };
const answers = (letters) => Object.fromEntries([...letters].map((letter, i) => [`r${String(i + 1).padStart(2, '0')}`, letter]));

function score(schema, data, sheetData, workbookData) {
  const context = schema.validationContext(sheetData, workbookData);
  return schema.computeDerivedData(schema.clean(data), context);
}

test('regression #57: Gara delle prime computes the score from the workbook keys', () => {
  const GaraPrime = load('app/lib/schema/GaraPrime.ts').default;
  const schema = new GaraPrime();
  const correct = 'ABCDEABCDEABCDEABC';
  const workbook = {
    contest_year: '2026',
    permutations_correct: correct,
    permutations_questions_1: JSON.stringify(Array.from({ length: 18 }, (_, i) => i + 1)),
    permutations_answers_1: 'ABCDE',
    permutations_points_correct: '5', permutations_points_wrong: '0',
    permutations_points_empty: '1', permutations_points_invalid: '0',
  };
  const row = { ...student, codice_meccanografico: 'PIPS000001', variant: '1' };

  const allCorrect = score(schema, { ...row, ...answers(correct) }, {}, workbook);
  assert.equal(allCorrect.error, '');
  assert.equal(allCorrect.data.score, '90');

  const mixed = score(schema, { ...row, ...answers('-B' + 'A'.repeat(16)) }, {}, workbook);
  assert.equal(mixed.error, '');
  // r01 empty (1), r02 correct (5), r06/r11/r16 correct (A), the rest wrong (0).
  assert.equal(mixed.data.score, '21');
});

test('Gara delle prime without permutation settings reports the configuration error', () => {
  const GaraPrime = load('app/lib/schema/GaraPrime.ts').default;
  assert.throws(() => new GaraPrime().validationContext({}, { contest_year: '2026' }), /Permutation object is empty/);
});

test('Archimede biennio scores all-correct answers with the standard variant', () => {
  const ArchimedeBiennio = load('app/lib/schema/ArchimedeBiennio.ts').default;
  const schema = new ArchimedeBiennio();
  const result = score(schema, { ...student, classYear: '1', variant: '211', ...answers(archimedeKeys.permutations_correct_2) },
    { Codice_meccanografico: 'PIPS000001' }, { contest_year: '2026', ...archimedeKeys });
  assert.equal(result.error, '');
  assert.equal(result.data.score, '80');
});

function archimede(file = 'app/lib/schema/ArchimedeBiennio.ts') {
  const Schema = load(file).default;
  return new Schema();
}
const sheetData = { Codice_meccanografico: 'PIPS000001' };
const workbook = (overrides = {}) => {
  const data = { contest_year: '2026', ...archimedeKeys, ...overrides };
  for (const [key, value] of Object.entries(data)) if (value === undefined) delete data[key];
  return data;
};

test('regression #66: a missing points setting is a configuration error, not a -Infinity score', () => {
  assert.throws(() => archimede().validationContext(sheetData, workbook({ permutations_points_wrong: undefined })),
    /permutations_points_wrong/);
});

for (const [setting, value, message] of [
  ['permutations_questions_2', '[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,15]', /non è una permutazione dei numeri da 1 a 16/],
  ['permutations_questions_3', '[1,2,3]', /lunghezze diverse/],
  ['permutations_answers_2', 'ABCDD', /non è una permutazione di ABCDE/],
  ['permutations_correct_2', 'ABC', /ha 3 risposte invece di 16/],
  ['permutations_correct_3', 'ABCDEABCDEABCDEZ', /caratteri diversi/],
]) {
  test(`regression #66: inconsistent ${setting} is rejected when the context is built`, () => {
    assert.throws(() => archimede().validationContext(sheetData, workbook({ [setting]: value })), message);
  });
}

test('regression #66: Archimede biennio rejects a triennio task code (and vice versa)', () => {
  const biennio = archimede();
  const row = { ...student, classYear: '1', variant: '311', ...answers(archimedeKeys.permutations_correct_3) };
  const result = score(biennio, row, sheetData, workbook());
  assert.match(result.error, /deve iniziare con 2/);
  assert.equal(result.data.score, '');
  const triennio = archimede('app/lib/schema/ArchimedeTriennio.ts');
  const ok = score(triennio, { ...row, classYear: '3' }, sheetData, workbook());
  assert.equal(ok.error, '');
  assert.equal(ok.data.score, '80');
  assert.match(score(triennio, { ...row, classYear: '3', variant: '211' }, sheetData, workbook()).error, /deve iniziare con 3/);
});

test('regression #66: an unknown answers code is reported as an invalid task code', () => {
  const result = score(archimede(), { ...student, classYear: '1', variant: '291', ...answers(archimedeKeys.permutations_correct_2) }, sheetData, workbook());
  assert.equal(result.error, 'codice compito non valido');
});

test('the Olimanager contest is read from the sheet, never from the workbook', () => {
  const workbookData = { contest_year: '2026', ...archimedeKeys, olimanager_contest_id: '7', olimanager_archimede_biennio_contest_id: '8' };
  assert.equal(archimede().validationContext({ ...sheetData, olimanager_contest_id: '31' }, workbookData).contest_id, 31);
  assert.ok(Number.isNaN(archimede().validationContext(sheetData, workbookData).contest_id));
});
