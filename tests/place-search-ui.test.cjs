const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function node() {
  return { value: '', children: [], handlers: {}, attrs: {}, hidden: true, disabled: false, textContent: '',
    addEventListener(event, fn) { this.handlers[event] = fn; }, setAttribute(key, value) { this.attrs[key] = value; },
    append(...nodes) { this.children.push(...nodes); }, replaceChildren() { this.children = []; }, classList: { toggle() {} } };
}
const row = { name: '<清水寺>', address: '京都府 京都市 東山区', lat: 34.9943, lng: 135.7844, incomplete: true };
function harness(search) {
  const elements = Object.fromEntries(['input', 'button', 'status', 'list', 'mapHost', 'mapMessage'].map(key => [key, node()]));
  let invalidates = 0, selects = [], scheduled = new Map(), next = 0;
  const context = vm.createContext({ document: { createElement: node }, AbortController,
    setTimeout(fn) { scheduled.set(++next, fn); return next; }, clearTimeout(id) { scheduled.delete(id); } });
  vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '../place-search-ui.js'), 'utf8'), context);
  const ui = context.JP_PLACE_SEARCH_UI.create({ ...elements, getBias: () => null, client: { search },
    onInvalidate() { invalidates++; }, onSelect(value) { selects.push(value); } });
  ui.reset(null);
  return { ui, ...elements, selects, scheduled, invalidates: () => invalidates };
}
test('candidate stays unconfirmed until selected, selection fills name and invalidates on further typing', async () => {
  const f = harness(async () => [row]); f.input.value = '清水寺';
  await f.button.handlers.click(); assert.equal(f.ui.needsSelection(), true); assert.equal(f.selects.length, 0);
  assert.equal(f.list.children[0].children[0].textContent, '1. <清水寺>');
  assert.equal(f.mapMessage.hidden, false); // List works without WebGL/MapLibre.
  f.list.children[0].handlers.click(); assert.equal(f.selects[0], row); assert.equal(f.input.value, row.name);
  assert.equal(f.ui.needsSelection(), false); assert.equal(f.list.children[0].attrs['aria-pressed'], 'true');
  f.input.value = '東京タワー'; f.input.handlers.input(); assert.equal(f.ui.needsSelection(), true); assert.equal(f.list.children.length, 0);
  assert.ok(f.invalidates() >= 2);
});
test('superseded requests cannot replace newer results and closing cancels requests', async () => {
  const jobs = [];
  const f = harness((q, options) => new Promise(resolve => jobs.push({ q, options, resolve })));
  f.input.value = '清水寺'; const first = f.button.handlers.click();
  f.input.value = '東京タワー'; const second = f.button.handlers.click();
  assert.equal(jobs[0].options.signal.aborted, true);
  jobs[1].resolve([{ ...row, name: '東京タワー' }]); await second;
  jobs[0].resolve([row]); await first; assert.equal(f.list.children[0].children[0].textContent, '1. 東京タワー');
  const third = f.button.handlers.click(); f.ui.close(); assert.equal(jobs[2].options.signal.aborted, true);
  jobs[2].resolve([row]); await third; assert.equal(f.list.children.length, 0);
});
test('IME composition delays search; Enter searches without submitting the place form', async () => {
  let calls = 0; const f = harness(async () => { calls++; return []; }); f.input.value = '清水寺';
  f.input.handlers.compositionstart(); f.input.handlers.input(); assert.equal(f.scheduled.size, 0);
  let prevented = false;
  f.input.handlers.keydown({ key: 'Enter', isComposing: true, preventDefault() { prevented = true; } }); assert.equal(prevented, false);
  f.input.handlers.compositionend(); assert.equal(f.scheduled.size, 1);
  f.input.handlers.keydown({ key: 'Enter', preventDefault() { prevented = true; } });
  await new Promise(setImmediate); assert.equal(prevented, true); assert.equal(calls, 1); assert.equal(f.scheduled.size, 0);
  assert.match(f.status.textContent, /没有找到/);
});
test('manual map placement and editing can keep their original coordinates when search fails', async () => {
  const f = harness(async () => { throw new Error('无法连接地址搜索服务'); });
  f.ui.reset({ lat: 35, lng: 139 }); assert.equal(f.ui.needsSelection(), false);
  f.input.value = '清水寺'; await f.button.handlers.click();
  assert.equal(f.ui.needsSelection(), false); assert.equal(f.invalidates(), 0);
  assert.match(f.status.textContent, /无法连接/); assert.equal(f.button.disabled, false);
});
test('replacing an edited place then changing the name cannot silently restore the old coordinates', async () => {
  const f = harness(async () => [row]); f.ui.reset({ lat: 35, lng: 139 });
  f.input.value = '清水寺'; await f.button.handlers.click();
  f.list.children[0].handlers.click(); assert.equal(f.ui.needsSelection(), false);
  f.input.value = '東京タワー'; f.input.handlers.input();
  assert.equal(f.ui.needsSelection(), true); assert.equal(f.invalidates(), 1);
});
