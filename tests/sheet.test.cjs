const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const context = vm.createContext({});
vm.runInContext(html.slice(html.indexOf('    function chooseSheetSnap('), html.indexOf('    function setMobileSheetState(')), context);
const snap = context.chooseSheetSnap;
const heights = [58, 472.64, 832];
test('slow drags snap to the nearest height, including a direct collapsed-to-full drag', () => {
  assert.equal(snap(61, 0, 58, 0, heights), 0);
  assert.equal(snap(450, 0, 58, 0, heights), 1);
  assert.equal(snap(810, 0, 58, 0, heights), 2);
  assert.equal(snap(500, 0, 832, 2, heights), 1);
  assert.equal(snap(70, 0, 832, 2, heights), 0);
});
test('a short deliberate flick advances one snap in either direction', () => {
  assert.equal(snap(85, .8, 58, 0, heights), 1);
  assert.equal(snap(500, .8, heights[1], 1, heights), 2);
  assert.equal(snap(800, -.8, 832, 2, heights), 1);
  assert.equal(snap(440, -.8, heights[1], 1, heights), 0);
});
test('small pointer noise cannot turn a tap into a flick', () => {
  assert.equal(snap(63, 3, 58, 0, heights), 0);
  assert.equal(snap(830, -3, 832, 2, heights), 2);
});
test('overscroll and very fast movement stay inside the supported snap range', () => {
  assert.equal(snap(-200, -100, 58, 0, heights), 0);
  assert.equal(snap(2000, 100, 472, 1, heights), 2);
});
