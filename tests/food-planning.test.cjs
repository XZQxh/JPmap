const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const appLinks = require('../app-links.js');
const restaurant = { id: 'restaurant', name: '用餐计划', category: 'food', meal: 'lunch', date: '2027-02-13', lat: 35, lng: 139, bookingProvider: 'Tabelog', bookingUrl: 'https://tabelog.com/tokyo/A1301/A130101/13002526/' };
function helpers() {
  const c = vm.createContext({ URL, places: [], escapeHtml: text => String(text), selectedDay: '2027-02-13', activeFilter: 'food' });
  for (const [start, end] of [['    const CATS =', '    const DAY_INFO ='], ['    function googleDirections(', '    function saveState('], ['    function dateLabel(', '    function dayNumber('], ['    function isPlaceOnDay(', '    function getFlight('], ['    function visiblePlaces(', '    function flightCard('], ['    function placeRow(', '    function renderContent(']]) vm.runInContext(script.slice(script.indexOf(start), script.indexOf(end)), c);
  return c;
}
test('lunch and dinner cards have dining icons and platform buttons; ordinary places have no meal marker', () => {
  const c = helpers();
  for (const [meal, label] of [['lunch', '午餐'], ['dinner', '晚餐']]) {
    const card = c.placeRow({ ...restaurant, meal }, 0, 1);
    assert.match(card, new RegExp('餐饮 · ' + label));
    assert.match(card, /assets\/dining.svg/);
    assert.match(card, /assets\/tabelog.ico/);
    assert.match(card, /data-app-link="Tabelog"/);
  }
  assert.equal(c.mealLabel({ ...restaurant, category: 'sight' }), '');
  assert.equal(c.mealLabel({ ...restaurant, meal: 'unexpected' }), '');
  const sight = c.placeRow({ ...restaurant, category: 'sight', bookingProvider: 'Klook', bookingUrl: 'https://www.klook.com/activity/123-example/' }, 0, 1);
  assert.match(sight, /assets\/klook.png/);
  assert.equal(sight.includes('午餐'), false);
});

test('dining filter respects the selected date and supports unscheduled restaurants', () => {
  const c = helpers();
  c.places = [restaurant, { ...restaurant, id: 'later', date: '2027-02-14' }, { ...restaurant, id: 'unscheduled', date: null }, { ...restaurant, id: 'sight', category: 'sight' }];
  assert.deepEqual(Array.from(c.visiblePlaces(), p => p.id), ['restaurant']);
  c.selectedDay = 'unscheduled';
  assert.deepEqual(Array.from(c.visiblePlaces(), p => p.id), ['unscheduled']);
});

test('saving a restaurant preserves its meal and platform, and changing category clears the meal', () => {
  let submit, saved;
  const fields = Object.fromEntries(Object.entries({ name: '午餐计划', address: '餐厅地址', bookingProvider: 'Tabelog', bookingUrl: restaurant.bookingUrl, category: 'food', meal: 'lunch', date: restaurant.date, note: '预约备注' }).map(([key, value]) => [key, { value }]));
  const c = vm.createContext({ URL, window: { JP_APP_LINKS: appLinks }, places: [{ ...restaurant, extra: 'keep' }], editingId: restaurant.id, editorCoords: { lat: 35, lng: 139 }, placeSearch: { needsSelection: () => false }, form: { elements: fields, addEventListener: (_, fn) => { submit = fn; } }, endDateSelect: { value: '' }, dialog: { close() {} }, saveState: () => { saved = JSON.parse(JSON.stringify(c.places)); }, renderAll() {}, showToast() {} });
  vm.runInContext(script.slice(script.indexOf('    function safeBookingUrl('), script.indexOf('    function stayDetails(')), c);
  vm.runInContext(script.slice(script.indexOf("    form.addEventListener('submit'"), script.indexOf("    map?.on('click'")), c);
  submit({ preventDefault() {} });
  assert.equal(saved[0].meal, 'lunch');
  assert.equal(saved[0].bookingProvider, 'Tabelog');
  assert.equal(saved[0].bookingUrl, restaurant.bookingUrl);
  assert.equal(saved[0].extra, 'keep');
  fields.meal.value = 'dinner';
  submit({ preventDefault() {} });
  assert.equal(saved[0].meal, 'dinner');
  fields.category.value = 'sight';
  submit({ preventDefault() {} });
  assert.equal(saved[0].meal, '');
});

test('all preset buttons have local icons and restaurant planning controls are present', () => {
  const c = helpers();
  for (const provider of ['Agoda', 'Klook', 'HopeGoo', 'Tabelog']) {
    const icon = c.appIcon(provider).match(/src="([^"]+)"/)[1];
    assert.ok(fs.statSync(path.join(__dirname, '..', icon)).size > 100);
    assert.ok(html.includes(`<option value="${provider}">`));
  }
  assert.match(html, /name="meal"/);
  assert.match(html, /value="lunch">午餐/);
  assert.match(html, /value="dinner">晚餐/);
  assert.match(html, /id="editorBookingLink"/);
  assert.equal(html.includes('id="bookingFields" hidden'), false);
});

test('mobile Tabelog button explains the WeChat handoff and retains its platform icon and original URL', () => {
  const c = helpers();
  c.window = { JP_APP_LINKS: appLinks };
  c.navigator = { userAgent: 'Android' };
  const card = c.placeRow(restaurant, 0, 1);
  assert.match(card, /Tabelog 微信小程序/);
  assert.match(card, /assets\/tabelog.ico/);
  assert.match(card, /data-app-link="Tabelog"/);
  assert.ok(card.includes(restaurant.bookingUrl));
  assert.equal(card.includes('App 首页'), false);
});
