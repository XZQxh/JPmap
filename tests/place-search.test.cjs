const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../place-search.js');
const feature = (properties = {}, coords = [135.7844, 34.9943]) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: coords },
  properties: { name: '清水寺', countrycode: 'JP', osm_type: 'W', osm_id: 1, state: '京都府', city: '京都市', district: '東山区', locality: '清水一丁目', street: '音羽道', postcode: '605-0922', ...properties } });
const response = features => ({ ok: true, json: async () => ({ features }) });
test('Japanese candidates keep source addresses, longitude order, distinct namesakes and missing house numbers', () => {
  const rows = S.normalize({ features: [feature(), feature(), feature({ osm_id: 2 }, [135.51, 34.65]), feature({ osm_id: 3, housenumber: '1' }),
    feature({ countrycode: 'US' }), feature({}, [null, 35]), feature({}, [140, 100])] });
  assert.equal(rows.length, 3);
  assert.equal(rows[0].lng, 135.7844); assert.equal(rows[0].lat, 34.9943);
  assert.equal(rows[0].address, '〒605-0922 京都府 京都市 東山区 清水一丁目 音羽道');
  assert.equal(rows[0].incomplete, true); assert.equal(rows[2].incomplete, false);
  assert.throws(() => S.normalize({ error: 'bad' }), /格式异常/);
});
test('client restricts Japan, uses supported local language, caches requests and expires them', async () => {
  let time = 10000, urls = [];
  const client = S.createClient({ minIntervalMs: 0, now: () => time, fetchImpl: async url => { urls.push(new URL(url)); return response([feature()]); } });
  assert.equal((await client.search(' 清水寺 ', { bias: { lat: 35.011, lng: 135.761 } })).length, 1);
  await client.search('清水寺', { bias: { lat: 35.011, lng: 135.761 } });
  assert.equal(urls.length, 1); assert.equal(urls[0].searchParams.get('countrycode'), 'JP');
  assert.equal(urls[0].searchParams.get('lang'), 'default'); assert.equal(urls[0].searchParams.get('lon'), '135.76');
  time += 31 * 60 * 1000;
  await client.search('清水寺', { bias: { lat: 35.011, lng: 135.761 } }); assert.equal(urls.length, 2);
  await client.search('清'); assert.equal(urls.length, 2);
});
test('errors are actionable, failed requests are not cached', async () => {
  let calls = 0;
  const client = S.createClient({ minIntervalMs: 0, fetchImpl: async () => { calls++; return { ok: false, status: 429 }; } });
  await assert.rejects(client.search('清水寺'), /频繁/); await assert.rejects(client.search('清水寺'), /频繁/); assert.equal(calls, 2);
});
test('request cancellation and timeout abort the actual fetch', async () => {
  const fetchImpl = (_, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))));
  const client = S.createClient({ fetchImpl, timeoutMs: 15, minIntervalMs: 0 });
  const controller = new AbortController(), pending = client.search('清水寺', { signal: controller.signal });
  controller.abort(); await assert.rejects(pending, { name: 'AbortError' });
  await assert.rejects(client.search('清水寺'), /超时/);
});
