const test = require('node:test');
const assert = require('node:assert/strict');
const pilgrimage = require('../pilgrimage.js');
const origin = { lat: 34.89, lng: 135.80 };
const entry = { id: 115908, name: '上低音号' };
const point = (id, lat = origin.lat, lng = origin.lng) => ({ id, name: id, geo: [lat, lng] });
const response = value => ({ ok: true, json: async () => value });
const metadata = { id: entry.id, cn: '吹响吧！上低音号', color: '#02a7bd', pointsLength: 1 };

test('Anitabi coordinate order is lat,lng and malformed coordinates are rejected', () => {
  assert.deepEqual(pilgrimage.position([34.89, 135.8]), origin);
  for (const geo of [[135.8, 34.89], [null, 135.8], ['34.89', 135.8], [NaN, 0], [], null]) assert.equal(pilgrimage.position(geo), null);
});
test('search strictly includes 2 km, excludes just outside, and sorts by distance', () => {
  const delta = km => km / 6371.0088 * 180 / Math.PI;
  const rows = [point('outside', origin.lat + delta(2.0001)), point('boundary', origin.lat + delta(2 - 1e-9)), point('near')];
  const normalized = pilgrimage.normalizePoints({ ...entry, color: '#02a7bd' }, rows).rows;
  assert.deepEqual(pilgrimage.withinRadius(normalized, origin).map(row => row.id), ['near', 'boundary']);
});
test('IDs accept only supported numeric IDs or work links', () => {
  assert.equal(pilgrimage.workId('328609'), 328609);
  assert.equal(pilgrimage.workId('https://bgm.tv/subject/328609'), 328609);
  assert.equal(pilgrimage.workId('https://anitabi.cn/map?bangumiId=328609'), 328609);
  for (const value of ['0', '-1', '1e3', 'https://evil.test/subject/1', 'javascript:123', 'https://bgm.tv/subject/1/characters']) assert.equal(pilgrimage.workId(value), null);
});
test('source colors are retained; unsafe colors, images and source URLs are rejected', () => {
  assert.equal(pilgrimage.color('#Ab12Cd', 1), '#Ab12Cd');
  assert.match(pilgrimage.color('red;background:url(evil)', 1), /^#[\da-f]{6}$/);
  assert.equal(pilgrimage.thumbnail('https://image.anitabi.cn/points/x.jpg'), 'https://image.anitabi.cn/points/x.jpg?plan=h160');
  assert.equal(pilgrimage.thumbnail('https://evil.test/x.jpg'), '');
  const rows = pilgrimage.normalizePoints({ ...entry, color: '#02a7bd' }, [{ ...point('x'), originURL: 'javascript:alert(1)' }, point('x')]).rows;
  assert.equal(rows.length, 1); assert.equal(rows[0].originUrl, '');
  assert.equal(rows[0].workColor, '#02a7bd');
});
test('client uses documented detail endpoint, never litePoints or work-center filtering, and caches successes', async () => {
  const requests = [];
  const client = pilgrimage.createClient({ fetchFn: async (url, options) => {
    requests.push(url); assert.equal(options.credentials, 'omit'); assert.equal(options.referrerPolicy, 'no-referrer');
    return response(url.endsWith('/lite') ? { ...metadata, geo: [0, 0], litePoints: [point('fake')] } : [point('actual')]);
  } });
  const result = await client.search(origin, [entry, entry]);
  assert.deepEqual(result.rows.map(row => row.id), ['actual']);
  assert.equal(result.rows[0].workName, metadata.cn); assert.equal(requests.length, 2);
  await client.search(origin, [entry]); assert.equal(requests.length, 2);
  client.clearCache(); await client.search(origin, [entry]); assert.equal(requests.length, 4);
});
test('a failed work is reported separately and never replaced by ten lite points', async () => {
  const client = pilgrimage.createClient({ fetchFn: async url => url.includes('/115908/') ? { ok: false, status: 403 } : response(url.endsWith('/lite') ? { ...metadata, id: 328609 } : [point('other')]) });
  const result = await client.search(origin, [entry, { id: 328609, name: '孤独摇滚' }]);
  assert.equal(result.failures.length, 1); assert.match(result.failures[0].message, /403/);
  assert.equal(result.works.length, 1); assert.equal(result.rows[0].workId, 328609);
});
test('truncated responses and invalid point coordinates produce coverage warnings', async () => {
  const client = pilgrimage.createClient({ fetchFn: async url => response(url.endsWith('/lite') ? { ...metadata, pointsLength: 577 } : [point('good'), { id: 'bad', geo: [null, 0] }]) });
  const result = await client.search(origin, [entry]);
  assert.match(result.works[0].warnings.join(' '), /2\/577/);
  assert.match(result.works[0].warnings.join(' '), /有效坐标/);
});
test('cancellation stops queued work and cannot return a misleading empty success', async () => {
  const controller = new AbortController(); let calls = 0;
  const client = pilgrimage.createClient({ fetchFn: async () => { calls++; controller.abort(); throw new DOMException('cancel', 'AbortError'); } });
  await assert.rejects(client.search(origin, [entry, { id: 1424 }, { id: 328609 }], { signal: controller.signal }), { name: 'AbortError' });
  assert.ok(calls <= 2);
});
test('Anitabi timeouts are readable and failed responses are retried rather than cached', async () => {
  let calls = 0;
  const client = pilgrimage.createClient({ timeoutMs: 5, fetchFn: async (url, { signal }) => {
    calls++; return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('timeout', 'AbortError')), { once: true }));
  } });
  assert.match((await client.search(origin, [entry])).failures[0].message, /超时/);
  await client.search(origin, [entry]); assert.equal(calls, 2);
});
