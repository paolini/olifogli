const assert = require('node:assert/strict');
const { test } = require('node:test');
const { mountTable } = require('./helpers/table-fixture.cjs');

test('typing from navigation replaces the old text and focuses the editor after the first character', async t => {
  const f = await mountTable(t);
  await f.click(f.cell('name'));
  assert.equal(f.active(), f.cell('name'));
  assert.equal(f.input(), null);
  const event = await f.key('m');
  assert.equal(event.defaultPrevented, true);
  assert.equal(f.input().value, 'm');
  assert.equal(f.active(), f.input());
  assert.equal(f.input().selectionStart, 1);
  assert.equal(f.input().selectionEnd, 1);
  await f.change('ma');
  assert.equal(f.input().value, 'ma');
});

for (const key of ['F2', 'Enter']) {
  test(`${key} opens the existing value and selects it`, async t => {
    const f = await mountTable(t);
    await f.click(f.cell('name'));
    await f.key(key);
    assert.equal(f.input().value, 'Name0');
    assert.equal(f.active(), f.input());
    assert.equal(f.input().selectionStart, 0);
    assert.equal(f.input().selectionEnd, 5);
  });
}

test('clicking the active cell opens its editor without losing its value', async t => {
  const f = await mountTable(t);
  await f.click(f.cell('name'));
  await f.click(f.cell('name'));
  assert.equal(f.input().value, 'Name0');
  assert.equal(f.active(), f.input());
});

test('keyboard shortcuts do not start text editing', async t => {
  const f = await mountTable(t);
  await f.click(f.cell('name'));
  for (const options of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
    await f.key('a', options);
    assert.equal(f.input(), null);
    assert.equal(f.focusCell(), f.cell('name'));
  }
});

for (const key of ['Delete', 'Backspace']) {
  test(`${key} clears a cell in navigation without opening its editor`, async t => {
    const f = await mountTable(t);
    await f.click(f.cell('name'));
    await f.key(key);
    assert.equal(f.cell('name').textContent, '');
    assert.equal(f.input(), null);
    assert.equal(f.focusCell(), f.cell('name'));
  });
}

test('Tab and Shift+Tab move between editable columns', async t => {
  const f = await mountTable(t);
  await f.click(f.cell('name'));
  await f.key('Tab');
  assert.equal(f.active(), f.cell('surname'));
  await f.key('Tab', { shiftKey: true });
  assert.equal(f.active(), f.cell('name'));
  await f.click(f.cell('r01'));
  await f.key('Tab');
  assert.equal(f.active(), f.cell('r02')); // hidden/read-only fields are skipped
});

test('left/right arrows stay in the text except at its boundaries', async t => {
  const f = await mountTable(t);
  await f.click(f.cell('surname'));
  await f.key('F2');
  f.input().setSelectionRange(2, 2);
  assert.equal((await f.key('ArrowLeft')).defaultPrevented, false);
  assert.equal(f.focusCell(), f.cell('surname'));
  f.input().setSelectionRange(0, 0);
  assert.equal((await f.key('ArrowLeft')).defaultPrevented, true);
  assert.equal(f.focusCell(), f.cell('name'));
  f.input().setSelectionRange(f.input().value.length, f.input().value.length);
  await f.key('ArrowRight');
  assert.equal(f.focusCell(), f.cell('surname'));
});

test('Enter saves edited text and moves to the next row', async t => {
  const f = await mountTable(t);
  await f.click(f.cell('name'));
  await f.key('F2');
  await f.change('Updated');
  await f.key('Enter');
  assert.equal(f.patches.length, 1);
  assert.equal(f.patches[0].data.name, 'Updated');
  assert.equal(f.focusCell(), f.cell('name', 1));
});

test('up/down navigation changes row and saves pending edits', async t => {
  const f = await mountTable(t);
  await f.click(f.cell('name'));
  await f.key('F2');
  await f.change('Updated');
  await f.key('ArrowDown');
  assert.equal(f.patches[0].data.name, 'Updated');
  assert.equal(f.active(), f.cell('name', 1));
  await f.key('ArrowUp');
  assert.equal(f.active(), f.cell('name'));
});

test('Escape preserves edited text, saves the row and returns to navigation', async t => {
  const f = await mountTable(t);
  await f.click(f.cell('name'));
  await f.key('F2');
  await f.change('Updated');
  await f.key('Escape');
  assert.equal(f.patches.length, 1);
  assert.equal(f.patches[0].data.name, 'Updated');
  assert.equal(f.cell('name').textContent, 'Updated');
  assert.equal(f.input(), null);
  assert.equal(f.active(), f.cell('name'));
});

test('clicking another row saves the pending value and moves focus', async t => {
  const f = await mountTable(t);
  await f.click(f.cell('name'));
  await f.key('F2');
  await f.change('Updated');
  await f.click(f.cell('surname', 1));
  assert.equal(f.patches.length, 1);
  assert.equal(f.patches[0].data.name, 'Updated');
  assert.equal(f.focusCell(), f.cell('surname', 1));
});

for (const editing of [false, true]) {
  test(`answers normalize one character and advance from ${editing ? 'the editor' : 'navigation'}`, async t => {
    const f = await mountTable(t);
    await f.click(f.cell('r01'));
    if (editing) await f.key('F2');
    await f.key('b');
    await f.flushTimers();
    assert.equal(f.cell('r01').textContent, 'B');
    assert.equal(f.focusCell(), f.cell('r02'));
    assert.equal(f.active(), f.input());
    await f.key('3');
    await f.flushTimers();
    assert.equal(f.input().value, 'C');
    assert.equal(f.focusCell(), f.cell('r02')); // last editable column stays put
  });
}

test('answer shortcuts convert digits, absence and invalid answers consistently', async t => {
  const f = await mountTable(t);
  for (const [key, expected] of [['1', 'A'], ['2', 'B'], ['3', 'C'], ['4', 'D'], ['5', 'E'], ['9', 'X'], ['0', '-'], [' ', '-'], ['x', 'X'], ['-', '-']]) {
    await f.click(f.cell('r01'));
    if (!f.input()) await f.key('F2');
    await f.key(key);
    await f.flushTimers();
    assert.equal(f.cell('r01').textContent, expected, key);
    assert.equal(f.focusCell(), f.cell('r02'));
  }
  await f.click(f.cell('r01'));
  await f.key('?');
  await f.flushTimers();
  assert.equal(f.focusCell(), f.cell('r01'));
});

test('Delete clears an answer without advancing; Backspace clears and moves left', async t => {
  const f = await mountTable(t);
  await f.click(f.cell('r02'));
  await f.key('F2');
  await f.key('Delete');
  await f.flushTimers();
  assert.equal(f.input().value, '');
  assert.equal(f.focusCell(), f.cell('r02'));
  await f.key('Backspace');
  await f.flushTimers();
  assert.equal(f.cell('r02').textContent, '');
  assert.equal(f.focusCell(), f.cell('r01'));
});

test('typing a date inserts separators and keeps the cursor after them', async t => {
  const f = await mountTable(t);
  await f.click(f.cell('birthDate'));
  await f.key('1');
  await f.key('2');
  await f.flushTimers();
  assert.equal(f.input().value, '12/');
  assert.equal(f.input().selectionStart, 3);
  await f.key('0');
  await f.key('5');
  await f.flushTimers();
  assert.equal(f.input().value, '12/05/');
  assert.equal(f.input().selectionStart, 6);
});

test('clearing a date and leaving its editor keeps the cell empty', async t => {
  const f = await mountTable(t);
  await f.click(f.cell('birthDate'));
  await f.key('F2');
  await f.change('');
  await f.key('Tab');
  assert.equal(f.cell('birthDate').textContent, '');
  assert.equal(f.focusCell(), f.cell('r01'));
});

test('read-only tables do not enter editing or save', async t => {
  const f = await mountTable(t, { edit: false });
  await f.click(f.cell('name'));
  await f.key('F2');
  await f.key('m');
  assert.equal(f.input(), null);
  assert.equal(f.cell('name').textContent, 'Name0');
  assert.equal(f.patches.length, 0);
});

// Pending product fixes are not treated as behavior the refactor must preserve.
test.todo('invalid answer keys preserve the previous value (#23)');
test.todo('invalid or out-of-range dates block leaving the editor (#31)');
