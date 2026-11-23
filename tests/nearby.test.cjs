const test = require('node:test');
const assert = require('node:assert/strict');
const nearby = require('../nearby.js');
const position = { lat: 34.7025, lng: 135.4959 };
const fix = (lat = position.lat, lng = position.lng, timestamp = 1000) => ({ coords: { latitude: lat, longitude: lng, accuracy: 12 }, timestamp });
function fixture() {
  let success, failure;
  const cleared = [], states = [], updates = [];
  const geo = { watchPosition(s, e) { success = s; failure = e; return 0; },
    clearWatch(id) { cleared.push(id); }, getCurrentPosition(s) { s(fix()); } };
  const tracker = nearby.createLocationTracker({ geolocation: geo, now: () => 1000,
    onPosition: p => updates.push(p), onState: (...args) => states.push(args) });
  return { tracker, cleared, states, updates, emit: p => success(p), fail: e => failure(e) };
}
test('maimai discovery uses the upstream 5 km option, maimai DX and WGS84', () => {
  const url = new URL(nearby.buildNearcadeUrl(position));
  assert.equal(url.pathname, '/api/discover');
  assert.equal(url.searchParams.get('radius'), '5');
  assert.equal(url.searchParams.get('gameTitleIds'), '1');
  assert.equal(url.searchParams.get('convertFrom'), 'WGS84');
  assert.equal(new URL(nearby.buildNearcadeUrl(position, true)).pathname, '/discover');
  assert.throws(() => nearby.buildNearcadeUrl({ lat: 91, lng: 0 }));
});
test('upstream results keep order and stores beyond a straight-line 5 km radius', async () => {
  const payload = { shops: [{ id: 2, distance: 8 }, { id: 1, distance: .2 }] };
  let options;
  const result = await nearby.fetchArcades(position, { fetchFn: async (url, input) => {
    options = input; return { ok: true, json: async () => payload };
  } });
  assert.equal(result, payload);
  assert.deepEqual(result.shops.map(shop => shop.id), [2, 1]);
  assert.equal(options.credentials, 'omit');
});
test('request cancellation is forwarded and service errors are readable', async () => {
  const controller = new AbortController();
  await assert.rejects(nearby.fetchArcades(position, { signal: controller.signal, fetchFn: async (url, options) => {
    assert.equal(options.signal, controller.signal); return { ok: false, status: 429 };
  } }), /稍后重试/);
  await assert.rejects(nearby.fetchArcades(position, { fetchFn: async () => ({ ok: true, json: async () => ({}) }) }), /数据/);
});
test('live tracking reports successive positions without creating extra watches', () => {
  const f = fixture();
  f.tracker.start(); f.tracker.start();
  f.emit(fix()); f.emit(fix(34.703, 135.496, 2000));
  assert.equal(f.updates.length, 2);
  assert.equal(f.updates[1].lat, 34.703);
  assert.equal(f.tracker.isActive(), true);
  assert.equal(f.states[0][0], 'requesting');
});
test('stop clears watch ID zero and ignores late location callbacks', () => {
  const f = fixture(); f.tracker.start(); f.emit(fix()); f.tracker.stop(); f.emit(fix());
  assert.deepEqual(f.cleared, [0]);
  assert.equal(f.updates.length, 1);
  assert.equal(f.tracker.isActive(), false);
});
test('permission denial disables live tracking with a useful fallback message', () => {
  const f = fixture(); f.tracker.start(); f.fail({ code: 1 });
  assert.equal(f.tracker.isActive(), false);
  assert.match(f.states.at(-1)[1], /找机厅 · 按地图中心/);
});
test('a one-time lookup does not enable continuous tracking', async () => {
  const f = fixture(); const value = await f.tracker.locate();
  assert.equal(value.lat, position.lat);
  assert.equal(f.tracker.isActive(), false);
  assert.equal(f.updates.length, 0);
});
test('a recent live position can be reused for an explicit nearby search', async () => {
  const f = fixture(); f.tracker.start(); f.emit(fix(34.71, 135.51));
  assert.equal((await f.tracker.locate()).lat, 34.71);
});
test('insecure pages and unsupported devices fail without asking for position', async () => {
  const insecure = nearby.createLocationTracker({ secureContext: false, geolocation: {} });
  assert.throws(() => insecure.start(), /HTTPS/);
  await assert.rejects(insecure.locate(), /HTTPS/);
  assert.throws(() => nearby.createLocationTracker({}).start(), /不支持定位/);
});
test('unsupported coordinate systems are not plotted on the WGS84 basemap', () => {
  const row = { id: 3, location: { coordinates: [135.5, 34.7], coordinateSystem: 'WGS84' } };
  assert.deepEqual(nearby.shopPosition(row), { lat: 34.7, lng: 135.5 });
  assert.equal(nearby.shopPosition({ ...row, location: { ...row.location, coordinateSystem: 'GCJ02' } }), null);
  assert.equal(nearby.shopPosition({}), null);
  assert.equal(nearby.validPosition(null), false);
});
test('machine notes are shown as reported instead of guessing cabinet totals', () => {
  const info = nearby.gameInfo({ games: [{ titleId: 1, name: 'maimai DX', version: 'PRiSM', quantity: 1, comment: '4 cabs' }] });
  assert.match(info, /4 cabs/);
  assert.equal(info.includes('登记数量 1'), false);
});
