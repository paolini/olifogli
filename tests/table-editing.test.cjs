const assert = require('node:assert/strict');
const { test } = require('node:test');
const { mountTable } = require('./helpers/table-fixture.cjs');

// DOM nodes carry large cyclic React/jsdom graphs. Compare identity without
// asking assert to format those graphs when a focus regression is detected.
function assertElement(actual, expected) {
  const describe = element => element ? `${element.tagName}.${element.className}` : 'null';
  assert.ok(actual === expected, `Expected ${describe(expected)}, got ${describe(actual)}`);
}

test('typing from navigation replaces the old text and focuses the editor after the first character', async t => {
  const f = await mountTable(t);
  await f.click(f.cell('name'));
  assertElement(f.active(), f.cell('name'));
  assertElement(f.input(), null);
  const event = await f.key('m');
  assert.equal(event.defaultPrevented, true);
  assert.equal(f.input().value, 'm');
  assertElement(f.active(), f.input());
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
    assertElement(f.active(), f.input());
    assert.equal(f.input().selectionStart, 0);
    assert.equal(f.input().selectionEnd, 5);
  });
}

test('clicking the active cell opens its editor without losing its value', async t => {
  const f = await mountTable(t);
  await f.click(f.cell('name'));
  await f.click(f.cell('name'));
  assert.equal(f.input().value, 'Name0');
  assertElement(f.active(), f.input());
});

test('keyboard shortcuts do not start text editing', async t => {
  const f = await mountTable(t);
  await f.click(f.cell('name'));
  for (const options of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
    await f.key('a', options);
    assertElement(f.input(), null);
    assertElement(f.focusCell(), f.cell('name'));
  }
});

for (const key of ['Delete', 'Backspace']) {
  test(`${key} clears a cell in navigation without opening its editor`, async t => {
    const f = await mountTable(t);
    await f.click(f.cell('name'));
    await f.key(key);
    assert.equal(f.cell('name').textContent, '');
    assertElement(f.input(), null);
    assertElement(f.focusCell(), f.cell('name'));
  });
}

test('Tab and Shift+Tab move between editable columns', async t => {
  const f = await mountTable(t);
  await f.click(f.cell('name'));
  await f.key('Tab');
  assertElement(f.active(), f.cell('surname'));
  await f.key('Tab', { shiftKey: true });
  assertElement(f.active(), f.cell('name'));
  await f.click(f.cell('r01'));
  await f.key('Tab');
  assertElement(f.active(), f.cell('r02')); // hidden/read-only fields are skipped
});

test('left/right arrows stay in the text except at its boundaries', async t => {
  const f = await mountTable(t);
  await f.click(f.cell('surname'));
  await f.key('F2');
  f.input().setSelectionRange(2, 2);
  assert.equal((await f.key('ArrowLeft')).defaultPrevented, false);
  assertElement(f.focusCell(), f.cell('surname'));
  f.input().setSelectionRange(0, 0);
  assert.equal((await f.key('ArrowLeft')).defaultPrevented, true);
  assertElement(f.focusCell(), f.cell('name'));
  f.input().setSelectionRange(f.input().value.length, f.input().value.length);
  await f.key('ArrowRight');
  assertElement(f.focusCell(), f.cell('surname'));
});

test('Enter saves edited text and moves to the next row', async t => {
  const f = await mountTable(t);
  await f.click(f.cell('name'));
  await f.key('F2');
  await f.change('Updated');
  await f.key('Enter');
  assert.equal(f.patches.length, 1);
  assert.equal(f.patches[0].data.name, 'Updated');
  assertElement(f.focusCell(), f.cell('name', 1));
});

test('up/down navigation changes row and saves pending edits', async t => {
  const f = await mountTable(t);
  await f.click(f.cell('name'));
  await f.key('F2');
  await f.change('Updated');
  await f.key('ArrowDown');
  assert.equal(f.patches[0].data.name, 'Updated');
  assertElement(f.active(), f.cell('name', 1));
  await f.key('ArrowUp');
  assertElement(f.active(), f.cell('name'));
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
  assertElement(f.input(), null);
  assertElement(f.active(), f.cell('name'));
});

test('clicking another row saves the pending value and moves focus', async t => {
  const f = await mountTable(t);
  await f.click(f.cell('name'));
  await f.key('F2');
  await f.change('Updated');
  await f.click(f.cell('surname', 1));
  assert.equal(f.patches.length, 1);
  assert.equal(f.patches[0].data.name, 'Updated');
  assertElement(f.focusCell(), f.cell('surname', 1));
});

for (const editing of [false, true]) {
  test(`answers normalize one character and advance from ${editing ? 'the editor' : 'navigation'}`, async t => {
    const f = await mountTable(t);
    await f.click(f.cell('r01'));
    if (editing) await f.key('F2');
    await f.key('b');
    await f.flushTimers();
    assert.equal(f.cell('r01').textContent, 'B');
    assertElement(f.focusCell(), f.cell('r02'));
    assertElement(f.active(), f.input());
    await f.key('3');
    await f.flushTimers();
    assert.equal(f.input().value, 'C');
    assertElement(f.focusCell(), f.cell('r02')); // last editable column stays put
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
    assertElement(f.focusCell(), f.cell('r02'));
  }
  await f.click(f.cell('r01'));
  await f.key('?');
  await f.flushTimers();
  assertElement(f.focusCell(), f.cell('r01'));
});

test('Delete clears an answer without advancing; Backspace clears and moves left', async t => {
  const f = await mountTable(t);
  await f.click(f.cell('r02'));
  await f.key('F2');
  await f.key('Delete');
  await f.flushTimers();
  assert.equal(f.input().value, '');
  assertElement(f.focusCell(), f.cell('r02'));
  await f.key('Backspace');
  await f.flushTimers();
  assert.equal(f.cell('r02').textContent, '');
  assertElement(f.focusCell(), f.cell('r01'));
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
  assertElement(f.focusCell(), f.cell('r01'));
});

test('read-only tables do not enter editing or save', async t => {
  const f = await mountTable(t, { edit: false });
  await f.click(f.cell('name'));
  await f.key('F2');
  await f.key('m');
  assertElement(f.input(), null);
  assert.equal(f.cell('name').textContent, 'Name0');
  assert.equal(f.patches.length, 0);
});

test('a draft is committed and normalized before saving, without waiting for blur', async t => {
  const f = await mountTable(t);
  await f.click(f.cell('birthDate'));
  await f.key('F2');
  await f.change('1.2.12');
  assert.equal(f.patches.length, 0);
  await f.key('Enter');
  assert.equal(f.patches[0].data.birthDate, '01/02/2012');
});

test('a save response does not overwrite a newer committed value', async t => {
  const f = await mountTable(t, { deferPatches: true });
  await f.click(f.cell('name'));
  await f.key('F2');
  await f.change('First');
  await f.key('ArrowDown');
  await f.click(f.cell('name'));
  await f.key('F2');
  await f.change('Second');
  await f.key('Tab');
  await f.resolvePatch();
  assert.equal(f.cell('name').textContent, 'Second');
  await f.key('ArrowDown');
  assert.equal(f.patches[1].data.name, 'Second');
  await f.resolvePatch();
});

test('an in-flight save cannot overwrite an active, uncommitted draft', async t => {
  const f = await mountTable(t, { deferPatches: true });
  await f.click(f.cell('name'));
  await f.key('F2');
  await f.change('First');
  await f.key('ArrowDown');
  await f.click(f.cell('name'));
  await f.key('F2');
  await f.change('Still typing');
  const input = f.input();
  input.setSelectionRange(5, 5);
  await f.resolvePatch();
  assertElement(f.active(), input);
  assert.equal(f.input().value, 'Still typing');
  assert.equal(f.input().selectionStart, 5);
});

test('autosave snapshots the cell without replacing its draft or moving the cursor', async t => {
  const f = await mountTable(t);
  await f.click(f.cell('birthDate'));
  await f.key('F2');
  await f.change('1.2.12');
  f.input().setSelectionRange(3, 3);
  await f.autosave();
  assert.equal(f.patches[0].data.birthDate, '01/02/2012');
  assert.equal(f.input().value, '1.2.12');
  assert.equal(f.input().selectionStart, 3);
  assertElement(f.active(), f.input());
});

test('reverting a field during an in-flight save is retained and saved afterwards', async t => {
  const f = await mountTable(t, { deferPatches: true });
  await f.click(f.cell('name'));
  await f.key('F2');
  await f.change('First');
  await f.autosave();
  await f.change('Name0');
  await f.key('Tab');
  await f.resolvePatch();
  assert.equal(f.cell('name').textContent, 'Name0');
  await f.key('ArrowDown');
  assert.equal(f.patches[1].data.name, 'Name0');
  await f.resolvePatch();
});

test('synced identity fields and calculated cells stay non-editable', async t => {
  const f = await mountTable(t, { synced: true });
  for (const name of ['name', 'birthDate', 'score']) {
    await f.click(f.cell(name));
    const original = f.cell(name).textContent;
    await f.key('F2');
    await f.key('m');
    await f.key('Delete');
    assertElement(f.input(), null);
    assert.equal(f.cell(name).textContent, original);
  }
  assert.equal(f.patches.length, 0);
});

test('admin editing can change synced identity fields', async t => {
  const f = await mountTable(t, { synced: true, adminEditMode: true });
  await f.click(f.cell('name'));
  await f.key('m');
  assert.equal(f.input().value, 'm');
});

test('depermuted answer cells do not open an editor or accept shortcut input', async t => {
  const f = await mountTable(t, { standardAnswers: true });
  await f.click(f.cell('r01'));
  const original = f.cell('r01').textContent;
  await f.key('F2');
  await f.key('b');
  await f.key('Delete');
  assertElement(f.input(), null);
  assert.equal(f.cell('r01').textContent, original);
});

test('IME key events do not trigger answer navigation before composition finishes', async t => {
  const f = await mountTable(t);
  await f.click(f.cell('r01'));
  await f.key('F2');
  await f.key('b', { isComposing: true });
  assertElement(f.focusCell(), f.cell('r01'));
  await f.key('b');
  assertElement(f.focusCell(), f.cell('r02'));
});

test('answer arrows navigate even when the single character is selected', async t => {
  const f = await mountTable(t);
  await f.click(f.cell('r01'));
  await f.key('F2');
  assert.equal(f.input().selectionStart, 0);
  assert.equal(f.input().selectionEnd, 1);
  await f.key('ArrowRight');
  assertElement(f.focusCell(), f.cell('r02'));
  await f.key('ArrowLeft');
  assertElement(f.focusCell(), f.cell('r01'));
});

test('modified arrow keys stay native inside a text editor', async t => {
  const f = await mountTable(t);
  await f.click(f.cell('name'));
  await f.key('F2');
  f.input().setSelectionRange(5, 5);
  const event = await f.key('ArrowRight', { ctrlKey: true });
  assert.equal(event.defaultPrevented, false);
  assertElement(f.focusCell(), f.cell('name'));
});

test('a newly created row can be edited and saved again using its original UI key', async t => {
  const f = await mountTable(t);
  await f.newRow();
  await f.key('N');
  await f.key('Enter');
  assert.equal(f.created.length, 1);
  assert.equal(f.created[0].data.name, 'N');
  await f.click(f.cell('name', 2));
  await f.change('New name');
  await f.key('Escape');
  assert.equal(f.patches.at(-1).data.name, 'New name');
  assert.equal(f.cell('name', 2).textContent, 'New name');
  // Acknowledged data must not be sent again by the next autosave tick.
  const count = f.patches.length;
  await f.autosave();
  assert.equal(f.patches.length, count);
});

// Pending product fixes are not treated as behavior the refactor must preserve.
test.todo('invalid answer keys preserve the previous value (#23)');

for (const key of ['Tab', 'Enter', 'Escape', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', 'ArrowLeft', 'ArrowRight']) {
  test(`invalid dates block ${key} navigation and saving`, async t => {
    const f = await mountTable(t);
    const row = key === 'ArrowUp' || key === 'PageUp' ? 1 : 0;
    await f.click(f.cell('birthDate', row));
    await f.key('F2');
    await f.change('31/02/2012');
    const input = f.input();
    input.setSelectionRange(key === 'ArrowLeft' ? 0 : input.value.length, key === 'ArrowLeft' ? 0 : input.value.length);
    await f.key(key);
    assertElement(f.active(), input);
    assertElement(f.focusCell(), f.cell('birthDate', row));
    assert.equal(f.input().value, '31/02/2012');
    assert.equal(f.input().getAttribute('aria-invalid'), 'true');
    assert.notEqual(f.error(), '');
    assert.equal(f.patches.length, 0);
    assert.equal(f.created.length, 0);
  });
}

test('an invalid date blocks cell clicks, a new row, blur and autosave', async t => {
  const f = await mountTable(t);
  await f.click(f.cell('birthDate'));
  await f.key('F2');
  await f.change('not a date');
  for (const leave of [() => f.click(f.cell('name', 1)), () => f.newRow(), () => f.blur(), () => f.autosave()]) {
    await leave();
    assertElement(f.active(), f.input());
    assertElement(f.focusCell(), f.cell('birthDate'));
    assert.notEqual(f.error(), '');
    assert.equal(f.patches.length, 0);
    assert.equal(f.created.length, 0);
  }
  await f.change('29/02/2012');
  assert.equal(f.error(), '');
  await f.key('Enter');
  assert.equal(f.patches[0].data.birthDate, '29/02/2012');
  assertElement(f.focusCell(), f.cell('birthDate', 1));
});

test('age range errors describe the configured bounds and block autosave', async t => {
  const f = await mountTable(t);
  await f.click(f.cell('birthDate'));
  await f.key('F2');
  for (const value of ['31/12/2009', '01/01/2017']) {
    await f.change(value);
    await f.autosave();
    assert.match(f.error(), /01\/01\/2010.*31\/12\/2016/);
    assert.equal(f.patches.length, 0);
    await f.key('Tab');
    assertElement(f.focusCell(), f.cell('birthDate'));
  }
});

for (const value of ['01/01/2010', '31/12/2016', '2012-02-29', '1.2.12', '', '/', '//', '   ']) {
  test(`valid or empty dates allow leaving: ${JSON.stringify(value)}`, async t => {
    const f = await mountTable(t);
    await f.click(f.cell('birthDate'));
    await f.key('F2');
    await f.change(value);
    await f.key('Enter');
    assert.equal(f.error(), '');
    assertElement(f.focusCell(), f.cell('birthDate', 1));
    assert.equal(f.patches.length, 1);
    if (!value.trim() || value.replaceAll('/', '') === '') assert.equal(f.patches[0].data.birthDate, '');
  });
}

test('invalid calendar dates, partial dates and unsupported text remain editable', async t => {
  const f = await mountTable(t);
  await f.click(f.cell('birthDate'));
  await f.key('F2');
  for (const value of ['29/02/2011', '31/04/2012', '00/01/2012', '01/13/2012', '12/', '1x2x12']) {
    await f.change(value);
    await f.key('Tab');
    assert.equal(f.input().value, value);
    assert.notEqual(f.error(), '');
    assert.equal(f.patches.length, 0);
  }
});

test('a configured zero age is a real limit rather than an unbounded range', async t => {
  const f = await mountTable(t, { dateOptions: { expectedMinAge: 0, expectedMaxAge: 0 } });
  await f.click(f.cell('birthDate'));
  await f.key('F2');
  await f.change('01/01/2025');
  await f.key('Tab');
  assert.match(f.error(), /01\/01\/2026.*31\/12\/2026/);
  await f.change('01/01/2026');
  await f.key('Tab');
  assert.equal(f.error(), '');
  assertElement(f.focusCell(), f.cell('r01'));
});

test('date fields without age limits accept any valid calendar year', async t => {
  const f = await mountTable(t, { dateOptions: {} });
  await f.click(f.cell('birthDate'));
  await f.key('F2');
  await f.change('01/01/1900');
  await f.key('Enter');
  assert.equal(f.error(), '');
  assert.equal(f.patches[0].data.birthDate, '01/01/1900');
});
