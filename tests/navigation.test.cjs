const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const helpers = script.slice(script.indexOf('    function googleDirections('), script.indexOf('    function saveState('));
const context = vm.createContext({ URL, places: [], escapeHtml: text => String(text) });
vm.runInContext(script.slice(script.indexOf('    const starterPlaces = ['), script.indexOf('    const STORE_KEY =')), context);
vm.runInContext(script.slice(script.indexOf('    const ACCOMMODATION_REVISION ='), script.indexOf('    places = updateSavedStays(')), context);
vm.runInContext(helpers, context);
vm.runInContext(script.slice(script.indexOf('    const CATS ='), script.indexOf('    const DAY_INFO =')), context);
vm.runInContext(script.slice(script.indexOf('    function dateLabel('), script.indexOf('    function dayNumber(')), context);
vm.runInContext(script.slice(script.indexOf('    function placeRow('), script.indexOf('    function renderContent(')), context);

test('transit link uses latitude,longitude and omits a fixed origin for current-location navigation', () => {
  const url = new URL(context.googleDirections({ lat: 35.7364, lng: 139.746 }));
  assert.equal(url.origin, 'https://www.google.com');
  assert.equal(url.searchParams.get('api'), '1');
  assert.equal(url.searchParams.get('destination'), '35.7364,139.746');
  assert.equal(url.searchParams.get('travelmode'), 'transit');
  assert.equal(url.searchParams.has('origin'), false);
  assert.equal(url.searchParams.has('key'), false);
});
test('airport terminal queries survive URL encoding', () => {
  const query = context.airportQuery('KIX', 'T2');
  const url = new URL(context.googleDirections(query, { lat: 35.0107, lng: 135.759 }));
  assert.equal(url.searchParams.get('destination'), '関西国際空港 第2ターミナル');
  assert.equal(url.searchParams.get('origin'), '35.0107,135.759');
  assert.equal(context.airportQuery('NRT', 'T1'), '成田国際空港 第1ターミナル');
  assert.equal(context.airportQuery('NRT', 'T2'), '成田国際空港 第2ターミナル');
});
test('complete accommodation address takes precedence over approximate map coordinates', () => {
  const stays = vm.runInContext('starterPlaces.filter(place => place.category === "stay")', context);
  for (const stay of stays.filter(place => place.locationAccuracy === 'area')) {
    assert.equal(new URL(context.googleDirections(stay)).searchParams.get('destination'), stay.address);
    assert.equal(new URL(context.googlePlaceUrl(stay)).searchParams.get('query'), stay.address);
  }
  assert.match(stays[0].address, /大国3丁目4-16/);
  assert.match(stays[2].address, /中里2丁目25-6 M東京/);
});
test('stay migration preserves itinerary changes and notes and does not restore deleted places', () => {
  const old = [{ id: 'stay-osaka', name: '大阪难波住宿区', date: '2027-02-13', note: '我的入住备注', lat: 34.66, lng: 135.50 }, { id: 'custom', name: '自建地点' }];
  const migrated = context.updateSavedStays(old, 0);
  assert.equal(migrated.length, 2);
  assert.equal(migrated[0].date, '2027-02-13');
  assert.equal(migrated[0].note, '我的入住备注');
  assert.equal(migrated[0].lat, 34.6561666667);
  assert.match(migrated[0].address, /大国3丁目4-16/);
  assert.equal(migrated[1], old[1]);
  assert.equal(context.updateSavedStays(migrated, 3), migrated);
});
test('Osaka coordinates match the supplied DMS point and replace an existing revision-2 placeholder', () => {
  const osaka = vm.runInContext('starterPlaces.find(place => place.id === "stay-osaka")', context);
  assert.ok(Math.abs(osaka.lat - (34 + 39 / 60 + 22.2 / 3600)) < 1e-9);
  assert.ok(Math.abs(osaka.lng - (135 + 29 / 60 + 37.1 / 3600)) < 1e-9);
  const editedKyoto = { id: 'stay-kyoto', name: '自定义名称', address: '自定义地址', lat: 35, lng: 135 };
  const migrated = context.updateSavedStays([{ ...osaka, lat: 34.6672, lng: 135.5013, locationAccuracy: 'area', date: '2027-02-13', note: '保留入住备注' }, editedKyoto], 2);
  assert.equal(migrated[0].lat, osaka.lat);
  assert.equal(migrated[0].lng, osaka.lng);
  assert.equal(migrated[0].date, '2027-02-13');
  assert.equal(migrated[0].note, '保留入住备注');
  assert.equal(migrated[1], editedKyoto);
  const expected = `${osaka.lat},${osaka.lng}`;
  assert.equal(new URL(context.googlePlaceUrl(osaka)).searchParams.get('query'), expected);
  assert.equal(new URL(context.googleDirections(osaka)).searchParams.get('destination'), expected);
});
test('booking links map to the two supplied Airbnb trips and the Ctrip homepage', () => {
  const stays = vm.runInContext('starterPlaces.filter(place => place.category === "stay")', context);
  assert.equal(stays[0].bookingUrl, 'https://zh.airbnb.com/trips/v1/1812361153230921042');
  assert.equal(stays[2].bookingUrl, 'https://zh.airbnb.com/trips/v1/1813096266996752260');
  assert.equal(stays[1].bookingProvider, '携程');
  assert.equal(stays[1].bookingUrl, 'https://www.ctrip.com/');
  assert.match(context.stayDetails(stays[0]), /查看 Airbnb 行程/);
  assert.match(context.stayDetails(stays[1]), /打开携程/);
  assert.equal(context.safeBookingUrl('javascript:alert(1)'), '');
});
test('each place card has exactly one Google place-details link and no direct navigation link', () => {
  const stays = vm.runInContext('starterPlaces.filter(place => place.category === "stay")', context);
  const sampleSight = { id: 'sight', name: '巡礼点', category: 'anime', lat: 35.66, lng: 139.67, date: null };
  for (const place of [...stays, sampleSight]) {
    const card = context.placeRow(place, 0, 1);
    assert.equal((card.match(/https:\/\/www\.google\.com\/maps\/search\//g) || []).length, 1);
    assert.equal(card.includes('/maps/dir/'), false);
    assert.match(card, /在 Google 地图查看/);
    assert.match(card, /assets\/google-maps\.png/);
  }
  assert.match(context.placeRow(stays[0], 0, 1), /assets\/airbnb\.ico/);
  assert.match(context.placeRow(stays[1], 0, 1), /assets\/ctrip\.ico/);
});
test('application icons are bundled image files', () => {
  const assets = path.join(__dirname, '..', 'assets');
  assert.equal(fs.readFileSync(path.join(assets, 'google-maps.png')).subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  for (const icon of ['airbnb.ico', 'ctrip.ico']) {
    assert.equal(fs.readFileSync(path.join(assets, icon)).subarray(0, 4).toString('hex'), '00000100');
  }
});
test('airport connections use exact saved addresses in both directions', () => {
  context.places = [];
  const arrival = context.flightConnections({ id: 'ho1337' });
  const href = arrival.match(/href="([^"]+)"/)[1];
  assert.equal(new URL(href).searchParams.get('destination'), '34.6561666667,135.4936388889');
  const returning = context.flightConnections({ id: 'ho1380' });
  assert.match(new URL(returning.match(/href="([^"]+)"/)[1]).searchParams.get('origin'), /中里2丁目25-6/);
});
test('flight connection links follow edited accommodation coordinates', () => {
  context.places = [{ id: 'stay-osaka', lat: 34.669, lng: 135.502 }];
  const card = context.flightConnections({ id: 'ho1337' });
  assert.match(card, /destination=34\.669%2C135\.502/);
  assert.match(card, /target="_blank" rel="noopener noreferrer"/);
  const transfer = context.flightConnections({ id: 'mm309' });
  assert.equal((transfer.match(/<a /g) || []).length, 2);
  assert.match(transfer, /KIX T2/);
  assert.match(transfer, /NRT T1/);
  assert.match(context.flightConnections({ id: 'ho1380' }), /NRT T2/);
});
test('map style removes buildings, includes underground transit and supplies station layers', () => {
  const styleContext = vm.createContext({ window: {} });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'map-style.js'), 'utf8'), styleContext);
  const style = styleContext.window.JP_MAP_STYLE;
  assert.equal(style.version, 8);
  assert.equal(style.layers.some(layer => layer.id === 'building'), false);
  const subway = style.layers.find(layer => layer.id === 'railway_transit');
  assert.equal(JSON.stringify(subway.filter).includes('tunnel'), false);
  assert.ok(style.layers.find(layer => layer.id === 'travel-station-labels'));
  assert.ok(style.layers.find(layer => layer.id === 'travel-station-dots'));
  assert.equal(style.sources.openmaptiles.url, 'https://tiles.openfreemap.org/planet');
});
