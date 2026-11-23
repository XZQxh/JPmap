const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const pilgrimage = require('../pilgrimage.js');
const html = fs.readFileSync(require('node:path').join(__dirname, '..', 'index.html'), 'utf8');
const ui = html.slice(html.indexOf('    function clearPilgrimMarkers()'), html.indexOf('    // Maps URLs open'));
const origin = { lat: 34.89, lng: 135.80 };
const row = { key: '115908:p', id: 'p', ...origin, workId: 115908, workName: '上低音号', workColor: '#02a7bd', name: '桥', distanceKm: .2, sourceUrl: pilgrimage.subjectUrl(115908) };
function harness(search) {
  const elements = new Map(), storage = new Map();
  function element() { return { hidden: false, innerHTML: '', textContent: '', dataset: {}, handlers: {},
    setAttribute() {}, addEventListener(name, action) { this.handlers[name] = action; }, querySelectorAll() { return []; }, before() {}, remove() {} }; }
  const document = { getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); }, createElement: element,
    querySelectorAll() { return []; }, querySelector() { return element(); } };
  const state = { pilgrimage, pilgrimClient: { search, clearCache() {} }, followedWorks: [{ id: 115908, name: '上低音号', enabled: true }], WORKS_KEY: 'works',
    document, localStorage: { setItem: (key, value) => storage.set(key, value) },
    map: null, locationTracker: { locate: async () => origin },
    pilgrimJob: 0, pilgrimController: null, pilgrimMarkers: [], pilgrimOriginMarker: null,
    pilgrimView: { active: false, rows: [], works: [], fromMapCenter: false }, maiJob: 0, maiController: null, maiView: {},
    setMaiBusy() {}, clearArcadeMarkers() {}, renderMap() {}, renderAll() {}, showToast() {},
    places: [], selectedDay: '2027-02-14', saveState() {}, escapeHtml: text => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;'), navLink: () => '', AbortController };
  const context = vm.createContext(state); vm.runInContext(ui, context);
  return { context, elements, storage, element };
}
test('current-location pilgrimage lookup uses the one-shot tracker and reports total API failure honestly', async () => {
  let received;
  const { context, elements } = harness(async (pos) => { received = pos; return { rows: [], works: [], failures: [{ id: 115908, name: '上低音号', message: 'HTTP 403' }] }; });
  await context.searchPilgrims(false);
  assert.equal(received, origin);
  assert.match(elements.get('pilgrimStatus').textContent, /无法判断/);
  assert.doesNotMatch(elements.get('pilgrimStatus').textContent, /没有范围内/);
  assert.equal(context.pilgrimView.active, true);
  assert.equal(elements.get('pilgrimBtnLabel').textContent, '找找圣地');
});
test('closing a pending pilgrimage search ignores late results and restores the trip', async () => {
  let resolve, signal, renders = 0;
  let notifyStarted; const started = new Promise(done => { notifyStarted = done; });
  const { context, elements } = harness(async (pos, entries, options) => { signal = options.signal; notifyStarted(); return new Promise(done => { resolve = done; }); });
  context.renderMap = () => { renders++; };
  const pending = context.searchPilgrims();
  await started;
  context.closePilgrims();
  assert.equal(signal.aborted, true);
  resolve({ rows: [row], works: [], failures: [] }); await pending;
  assert.equal(context.pilgrimView.rows.length, 0);
  assert.equal(elements.get('pilgrimPanel').hidden, true);
  assert.equal(renders, 1);
});
test('adding a discovered point preserves color, source and date, saves once, and prevents duplicates', () => {
  const { context, element } = harness(async () => {});
  context.pilgrimView.rows = [row]; let saves = 0; context.saveState = () => { saves++; };
  const button = element(); button.dataset.addPilgrim = row.key;
  context.bindPilgrimActions({ querySelectorAll: () => [button] }); button.handlers.click();
  assert.equal(context.places.length, 1); assert.equal(context.places[0].category, 'anime');
  assert.equal(context.places[0].workColor, '#02a7bd'); assert.equal(context.places[0].workId, 115908);
  assert.equal(context.places[0].sourcePointId, 'p'); assert.equal(context.places[0].date, '2027-02-14');
  assert.match(context.places[0].note, /https:\/\/anitabi.cn\/map/);
  button.handlers.click(); assert.equal(context.places.length, 1); assert.equal(saves, 1);
});
test('changing followed works cancels outstanding requests and stores only work preferences', () => {
  const { context, storage } = harness(async () => {});
  const controller = new AbortController(); context.pilgrimController = controller;
  context.changeWorks(); assert.equal(controller.signal.aborted, true);
  const saved = JSON.parse(storage.get('works'));
  assert.deepEqual(Object.keys(saved[0]).sort(), ['enabled', 'id', 'name']);
});
