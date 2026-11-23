const test = require('node:test');
const assert = require('node:assert/strict');
const W = require('../weather.js');
const NOW = Date.parse('2027-02-10T00:00:00+09:00');
function fixture(date = '2027-02-18') {
  const time = Array.from({ length: 10 }, (_, i) => `${date}T${String(i + 7).padStart(2, '0')}:00`);
  return { latitude: W.FUJI_SPOTS[0].lat, longitude: W.FUJI_SPOTS[0].lng, timezone: 'Asia/Tokyo',
    daily: { time: ['2027-02-10', date], weather_code: [0, 2], temperature_2m_min: [1, -2], temperature_2m_max: [10, 8], precipitation_probability_max: [10, 20], wind_speed_10m_max: [15, 20] },
    hourly: { time, cloud_cover: time.map(() => 10), cloud_cover_low: time.map(() => 5), visibility: time.map(() => 30000),
      precipitation_probability: time.map(() => 10), precipitation: time.map(() => 0), is_day: time.map(() => 1) } };
}
test('forecast boundaries use Japan dates: today through day 15, no historical substitution', () => {
  assert.equal(W.forecastRange('2027-02-25', NOW).status, 'available');
  assert.equal(W.forecastRange('2027-02-26', NOW).status, 'future');
  assert.equal(W.forecastRange('2027-02-09', NOW).status, 'past');
  assert.equal(W.forecastRange('2027-02-18', Date.parse('2026-11-22T22:00:00+08:00')).opens, '2027-02-03');
  assert.equal(W.japanTime(Date.parse('2027-02-09T15:00:00Z')), '2027-02-10T00:00');
});
test('city forecasts follow the itinerary, including all three transfer cities and remote excursions', () => {
  assert.deepEqual(W.locationsForDay('2027-02-12').map(x => x.name), ['大阪']);
  assert.deepEqual(W.locationsForDay('2027-02-16').map(x => x.name), ['京都']);
  assert.deepEqual(W.locationsForDay('2027-02-17').map(x => x.name), ['京都', '大阪', '东京']);
  const places = [{ name: '河口湖', date: '2027-02-18', ...W.FUJI_SPOTS[0] }, { name: '东京站', date: '2027-02-18', lat: 35.68, lng: 139.76 }];
  assert.deepEqual(W.locationsForDay('2027-02-18', places).map(x => x.name), ['东京', '河口湖']);
  assert.deepEqual(W.locationsForDay('unscheduled', places), []);
});
test('request explicitly uses Tokyo timezone and all required weather variables', () => {
  const url = new URL(W.forecastUrl(W.FUJI_SPOTS[0]));
  assert.equal(url.searchParams.get('timezone'), 'Asia/Tokyo');
  assert.equal(url.searchParams.get('forecast_days'), '16');
  assert.match(url.searchParams.get('hourly'), /visibility/);
  assert.match(url.searchParams.get('hourly'), /cloud_cover_low/);
  assert.equal(url.searchParams.get('latitude'), String(W.FUJI_SPOTS[0].lat));
});
test('daily lookup uses exact date, keeps zero and negative temperatures, and never turns null into zero', () => {
  const data = fixture();
  data.daily.precipitation_probability_max[1] = null;
  assert.deepEqual(W.dailyFor(data, '2027-02-18'), { code: 2, min: -2, max: 8, rain: null, wind: 20 });
  assert.equal(W.dailyFor(data, '2027-02-19'), null);
  assert.equal(W.weatherCode(0).text, '晴');
  assert.equal(W.weatherCode(null).text, '天气数据缺失');
});
test('Fuji chooses a complete daylight three-hour window and resolves ties toward morning', () => {
  const result = W.bestFujiWindow(fixture(), '2027-02-18', NOW);
  assert.equal(result.grade, 'good');
  assert.equal(result.start, '07:00'); assert.equal(result.end, '10:00');
  assert.equal(result.visibility, 30000);
});
test('Fuji rejects missing metrics, broken time sequences, night and already elapsed hours', () => {
  let data = fixture(); data.hourly.visibility.fill(null);
  assert.equal(W.bestFujiWindow(data, '2027-02-18', NOW), null);
  data = fixture(); data.hourly.time = [data.hourly.time[0], data.hourly.time[2], data.hourly.time[4]];
  assert.equal(W.bestFujiWindow(data, '2027-02-18', NOW), null);
  data = fixture(); data.hourly.is_day.fill(0);
  assert.equal(W.bestFujiWindow(data, '2027-02-18', NOW), null);
  data = fixture();
  assert.equal(W.bestFujiWindow(data, '2027-02-18', Date.parse('2027-02-18T12:30:00+09:00')).start, '13:00');
  assert.equal(W.bestFujiWindow(data, '2027-02-18', Date.parse('2027-02-18T15:00:00+09:00')), null);
});
test('rain, fog, or low cloud cannot produce a green recommendation', () => {
  for (const [key, value] of [['precipitation', .2], ['precipitation_probability', 60], ['visibility', 9000]]) {
    const data = fixture(); data.hourly[key].fill(value);
    const result = W.bestFujiWindow(data, '2027-02-18', NOW);
    assert.equal(result.grade, 'poor'); assert.ok(result.score <= 39);
  }
  const data = fixture(); data.hourly.cloud_cover_low.fill(80);
  assert.notEqual(W.bestFujiWindow(data, '2027-02-18', NOW).grade, 'good');
});
test('Fuji conservatively reports the worst visibility and rain probability in the chosen window', () => {
  const data = fixture();
  data.hourly.time.length = 3;
  data.hourly.visibility[1] = 22000; data.hourly.precipitation_probability[2] = 20;
  const result = W.bestFujiWindow(data, '2027-02-18', NOW);
  assert.equal(result.visibility, 22000); assert.equal(result.rain, 20);
});
test('weather client deduplicates in-flight requests, caches 30 minutes and refreshes on Japanese midnight', async () => {
  let calls = 0, time = NOW;
  const client = W.createClient({ now: () => time, fetchFn: async () => { calls++; return { ok: true, json: async () => fixture() }; } });
  const spot = W.FUJI_SPOTS[0], first = client.load(spot);
  assert.equal(client.load(spot), first);
  await first; assert.equal(client.read(spot).status, 'ready');
  await client.load(spot); assert.equal(calls, 1);
  time += W.TTL; assert.equal(client.read(spot).stale, true);
  await client.load(spot); assert.equal(calls, 2);
  time += 86400000; assert.equal(client.read(spot).stale, true);
  await client.load(spot); assert.equal(calls, 3);
  // The old-date fixture is rejected, not cached as current data.
  assert.equal(client.read(spot).status, 'error');
});
test('failed refresh retains the last data with an error and explicit retry can recover', async () => {
  let fail = false;
  const client = W.createClient({ now: () => NOW, fetchFn: async () => fail ? { ok: false, status: 429 } : { ok: true, json: async () => fixture() } });
  const spot = W.FUJI_SPOTS[0];
  await client.load(spot); fail = true;
  await client.load(spot, { force: true });
  assert.equal(client.read(spot).status, 'error');
  assert.ok(client.read(spot).data); assert.match(client.read(spot).error, /稍后刷新/);
  fail = false; await client.load(spot, { force: true }); assert.equal(client.read(spot).status, 'ready');
});
test('malformed payloads and wrong timezone or location never become usable forecasts', async () => {
  for (const data of [{}, { ...fixture(), timezone: 'GMT' }, { ...fixture(), latitude: 0 }, { ...fixture(), hourly: { time: [] } }]) {
    const client = W.createClient({ now: () => NOW, fetchFn: async () => ({ ok: true, json: async () => data }) });
    await client.load(W.FUJI_SPOTS[0]); assert.equal(client.read(W.FUJI_SPOTS[0]).status, 'error');
  }
});
test('timeout aborts the network request and gives a retry message', async () => {
  let signal;
  const client = W.createClient({ now: () => NOW, timeoutMs: 5, fetchFn: (url, options) => {
    signal = options.signal;
    return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
  } });
  await client.load(W.FUJI_SPOTS[0]); assert.equal(signal.aborted, true);
  assert.match(client.read(W.FUJI_SPOTS[0]).error, /超时/);
});
