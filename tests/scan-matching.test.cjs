const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

// Real schema classes: matching scanned pages to rows decides which student's
// answers are overwritten.
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
      if (id.endsWith('/logging')) return { logDiagnostic() {} };
      if (id.startsWith('@/')) return load(id.slice(2) + '.ts');
      if (id.startsWith('.')) return load(path.relative(root, path.resolve(path.dirname(filename), id + '.ts')));
      throw new Error(`Unexpected dependency: ${id}`);
    },
  }, { filename });
  return exports;
}

const schemas = {
  ArchimedeBiennio: 'app/lib/schema/ArchimedeBiennio.ts',
  GaraPrime: 'app/lib/schema/GaraPrime.ts',
  Distrettuale: 'app/lib/schema/Distrettuale.ts',
  AmmissioneSenior: 'app/lib/schema/AmmissioneSenior.ts',
};
const scan = (id, StudentCode) => ({ _id: id, rawData: { StudentCode, TestCode: '211', StudentYear: '1', Section: 'A', Answer1: 'B' } });
const row = (id, data) => ({ _id: `row-${id}`, data: { surname: `Student${id}`, ...data } });

for (const [name, file] of Object.entries(schemas)) {
  const Schema = load(file).default;
  const schema = new Schema();

  test(`${name}: regression #65: a blank or zero student code matches no existing row`, () => {
    // Rows created by earlier blank-code imports have id "0" (old behavior) or "".
    const rows = [row('a', { id: '0' }), row('b', { id: '' }), row('c', { id: '12' })];
    const result = schema.scans_to_data_dict([scan('s1', 'XXXX'), scan('s2', ''), scan('s3', '0000'), scan('s4', 'X0X0')], rows);
    for (const id of ['s1', 's2', 's3', 's4']) {
      assert.equal(result[id].row, undefined, id);
      assert.equal(result[id].data.id ?? '', '', id);
      assert.equal(result[id].data.surname ?? '', '', id);
      assert.equal(result[id].error, undefined, id);
    }
  });

  test(`${name}: a student code matches the row with the same id, ignoring leading zeros`, () => {
    const rows = [row('c', { id: '12' }), row('d', { id: '7' })];
    const result = schema.scans_to_data_dict([scan('s1', '0012'), scan('s2', 'X007')], rows);
    assert.equal(result.s1.row._id, 'row-c');
    assert.equal(result.s1.data.surname, 'Studentc');
    assert.equal(result.s2.row._id, 'row-d');
  });

  test(`${name}: pages of one upload with the same student code are flagged and not matched silently`, () => {
    const rows = [row('c', { id: '12' })];
    const result = schema.scans_to_data_dict([scan('s1', '0012'), scan('s2', '0012'), scan('s3', '0099'), scan('s4', '0099'), scan('s5', '0005')], rows);
    for (const id of ['s1', 's2', 's3', 's4']) assert.match(result[id].error, /ripetuto/, id);
    assert.equal(result.s5.error, undefined);
  });
}
