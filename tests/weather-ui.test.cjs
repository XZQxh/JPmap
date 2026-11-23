const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const W = require('../weather.js');
function setup({ date = '2027-02-18', now = Date.parse('2026-11-22T12:00:00Z'), read = () => ({ status: 'idle' }) } = {}) {
  let day = date, loads = [], selections = [], nodes = new Map(), html = '';
  const chips = W.TOKYO_DAYS.map(date => ({ dataset: { weatherDate: date } }));
  const host = { hidden: false, get innerHTML() { return html; }, set innerHTML(value) { html = value; nodes.clear(); },
    querySelector(selector) { if (!nodes.has(selector)) nodes.set(selector, { handlers: {}, addEventListener(event, handler) { this.handlers[event] = handler; } }); return nodes.get(selector); },
    querySelectorAll(selector) { return selector === '[data-fuji-date]' ? W.FUJI_DAYS.map(date => ({ dataset: { fujiDate: date }, addEventListener(event, handler) { nodes.set(date, handler); } })) : []; } };
  const context = vm.createContext({ JP_WEATHER: W, document: { querySelectorAll: () => chips } });
  vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '../weather-ui.js'), 'utf8'), context);
  const panel = context.JP_WEATHER_UI.createPanel({ host, getDay: () => day, getPlaces: () => [], now: () => now,
    client: { read, load(location) { loads.push(location); return new Promise(() => {}); } }, onSelectDay(date) { day = date; selections.push(date); panel.render(); } });
  return { panel, host, loads, chips, nodes, selections, setDay(value) { day = value; } };
}
test('future trip shows opening dates and no fabricated weather or network requests', () => {
  const f = setup(); f.panel.render();
  assert.match(f.host.innerHTML, /2027-02-03 起可查询/);
  assert.match(f.host.innerHTML, /富士见预报/); assert.match(f.host.innerHTML, /等天气近一点/);
  assert.doesNotMatch(f.host.innerHTML, /参考分<|较佳候选/);
  assert.equal(f.loads.length, 0); assert.equal(f.chips[1].textContent, '待预报');
});
test('Fuji only appears on Tokyo segment, and unscheduled collection hides all weather', () => {
  const f = setup({ date: '2027-02-14' }); f.panel.render();
  assert.doesNotMatch(f.host.innerHTML, /富士见预报/); assert.match(f.host.innerHTML, /京都/);
  f.setDay('unscheduled'); f.panel.render(); assert.equal(f.host.hidden, true);
});
test('candidate dates navigate the itinerary and view-point changes use the chosen location', () => {
  const f = setup(); f.panel.render(); f.nodes.get('2027-02-20')();
  assert.deepEqual(f.selections, ['2027-02-20']); assert.match(f.host.innerHTML, /2\/20 · 当地天气/);
  f.nodes.get('[data-fuji-spot]').handlers.change({ target: { value: 'yamanakako' } });
  assert.match(f.host.innerHTML, /value="yamanakako" selected/);
});
test('entering forecast range preloads every itinerary city, deduplicated by coordinates', () => {
  const f = setup({ now: Date.parse('2027-02-10T12:00:00+09:00') }); f.panel.render();
  assert.equal(f.loads.length, 4);
  assert.deepEqual(new Set(f.loads.map(item => item.name)), new Set(['大阪', '京都', '东京', '河口湖']));
});
test('upstream failures are visible and cannot produce recommendations or probability scores', () => {
  const f = setup({ now: Date.parse('2027-02-10T12:00:00+09:00'), read: () => ({ status: 'error', date: '2027-02-10', error: '天气请求超时，请重试' }) });
  f.panel.render(); assert.match(f.host.innerHTML, /天气请求超时/); assert.match(f.host.innerHTML, /加载失败/);
  assert.doesNotMatch(f.host.innerHTML, /较佳候选/); assert.equal(f.loads.length, 0);
});
test('complete forecasts render scores, conservative metrics, and a real candidate recommendation', () => {
  const time = W.FUJI_DAYS.flatMap(date => [7, 8, 9].map(hour => `${date}T0${hour}:00`));
  const data = { daily: { time: W.FUJI_DAYS, weather_code: [0, 1, 2, 3], temperature_2m_min: [0, 1, 2, 3], temperature_2m_max: [8, 9, 10, 11] },
    hourly: { time, cloud_cover: time.map(() => 10), cloud_cover_low: time.map(() => 5), visibility: time.map(() => 30000), precipitation_probability: time.map(() => 10), precipitation: time.map(() => 0), is_day: time.map(() => 1) } };
  const state = { status: 'ready', date: '2027-02-10', data, fetchedAt: Date.parse('2027-02-10T12:00:00+09:00'), stale: false };
  const f = setup({ now: state.fetchedAt, read: () => state }); f.panel.render();
  assert.match(f.host.innerHTML, /较佳候选 2\/18 · 07:00–10:00/);
  assert.match(f.host.innerHTML, /已覆盖 4\/4 个候选日/);
  assert.match(f.host.innerHTML, /30 km/);
  assert.equal(f.loads.length, 0);
  state.stale = true; f.panel.render();
  assert.doesNotMatch(f.host.innerHTML, /较佳候选/);
  assert.match(f.host.innerHTML, /旧数据/);
});
