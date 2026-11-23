const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const c = vm.createContext({ URL, places: [] });
function section(start, end) { vm.runInContext(script.slice(script.indexOf(start), script.indexOf(end)), c); }
section('    const FLIGHTS =', '    const airportCoords =');
section('    const starterPlaces =', '    const STORE_KEY =');
section('    function updateSavedFlights(', '    let flightState =');
section('    function googleDirections(', '    function saveState(');
section('    function escapeHtml(', '    function dayNumber(');
section('    function flightCard(', '    function placeRow(');
const flights = vm.runInContext('FLIGHTS', c);
vm.runInContext('let flightState = updateSavedFlights([]);', c);

test('existing candidate bookings become confirmed, retain metadata and restore missing flight records', () => {
  const old = [{ id: 'ho1337', confirmed: false, note: '保留的记录' }];
  const migrated = c.updateSavedFlights(old);
  assert.equal(migrated.length, 3);
  assert.ok(migrated.every(flight => flight.confirmed));
  assert.equal(migrated[0].note, '保留的记录');
  assert.equal(old[0].confirmed, false);
  assert.deepEqual(c.updateSavedFlights(migrated), migrated);
  for (const value of [undefined, null, {}]) assert.ok(c.updateSavedFlights(value).every(flight => flight.confirmed));
});

test('compact cards expose one accessible detail button, with all navigation confined to details', () => {
  for (const flight of flights) {
    const compact = c.flightCard(flight);
    assert.equal((compact.match(/<button /g) || []).length, 1);
    assert.match(compact, /aria-haspopup="dialog" aria-controls="flightDialog"/);
    assert.ok(compact.includes(flight.code) && compact.includes(flight.fromTime) && compact.includes(flight.toTime));
    assert.ok(compact.includes(flight.fromTerminal) && compact.includes(flight.toTerminal));
    assert.doesNotMatch(compact, /<a |候选|data-app-link/);
    const details = c.flightDetails(flight);
    assert.doesNotMatch(details, /待公布|待查询|flight-detail-grid/);
    assert.match(details, /maps\/dir\//);
    assert.match(details, /机票已订/);
    assert.ok(details.indexOf('机场接驳导航') < details.indexOf('航班备注'));
    assert.match(details, /<details class="flight-lookup"><summary>备用/);
  }
});

test('official arrival and departure lookups use correct airports and directions', () => {
  const outbound = c.flightLookupLinks(flights[0]);
  assert.match(outbound, /shanghaiairport\.com\/flights\/index\.html/);
  assert.match(outbound, /kansai-airport\.or\.jp/);
  const transfer = c.flightLookupLinks(flights[1]);
  assert.match(transfer, /narita-airport\.jp\/en\/flight\/arr-search\//);
  assert.match(transfer, /flypeach\.com/);
  assert.match(c.flightLookupLinks(flights[2]), /narita-airport\.jp\/en\/flight\/dep-search\//);
});

test('flight notes persist independently, survive migration and are escaped when reopening details', () => {
  let stored;
  c.saveState = () => { stored = vm.runInContext('JSON.stringify(flightState)', c); };
  c.showToast = () => {};
  c.saveFlightNote('ho1337', '  柜台 J，登机口 68 </textarea><img onerror=bad>  ');
  const records = JSON.parse(stored);
  assert.equal(records[0].personalNote, '柜台 J，登机口 68 </textarea><img onerror=bad>');
  assert.ok(records.every(flight => flight.confirmed));
  assert.equal(records[1].personalNote, undefined);
  assert.equal(c.updateSavedFlights(records)[0].personalNote, records[0].personalNote);
  const details = c.flightDetails(flights[0]);
  assert.match(details, /&lt;\/textarea&gt;&lt;img onerror=bad&gt;/);
  assert.doesNotMatch(details, /<img onerror=bad>/);
  c.saveFlightNote('ho1337', '');
  assert.equal(JSON.parse(stored)[0].personalNote, '');
  c.saveFlightNote('mm309', 'x'.repeat(600));
  assert.equal(JSON.parse(stored)[1].personalNote.length, 500);
  c.saveFlightNote('missing', 'no');
  assert.equal(JSON.parse(stored).length, 3);
});

test('opening details selects the requested flight and resets detail scroll without changing the itinerary', () => {
  const nodes = { flightDialogTitle: {}, flightDetailContent: { scrollTop: 200 }, flightDialog: { open: false, showModal() { this.open = true; } } };
  c.document = { getElementById: id => nodes[id] };
  c.openFlightDetails('mm309');
  assert.equal(nodes.flightDialog.open, true);
  assert.match(nodes.flightDialogTitle.textContent, /MM309/);
  assert.match(nodes.flightDetailContent.innerHTML, /2027-02-17/);
  assert.equal(nodes.flightDetailContent.scrollTop, 0);
  c.openFlightDetails('missing');
  assert.match(nodes.flightDialogTitle.textContent, /MM309/);
});
