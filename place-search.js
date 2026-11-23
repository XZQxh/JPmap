(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.JP_PLACE_SEARCH = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const ENDPOINT = 'https://photon.komoot.io/api/';
  function normalize(data) {
    if (!Array.isArray(data?.features)) throw new Error('搜索服务返回的数据格式异常，请重试');
    const seen = new Set(), rows = [];
    for (const feature of data.features) {
      const p = feature?.properties, coords = feature?.geometry?.coordinates;
      if (!p || feature.geometry?.type !== 'Point' || !Array.isArray(coords)) continue;
      const [lng, lat] = coords;
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
      if (String(p.countrycode || '').toUpperCase() !== 'JP') continue;
      const name = String(p.name || p.street || '').trim();
      if (!name) continue;
      const key = p.osm_type && p.osm_id ? `${p.osm_type}/${p.osm_id}` : `${name}/${lat}/${lng}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const parts = [...new Set([p.state, p.county, p.city, p.district, p.locality, p.street, p.housenumber].filter(Boolean).map(String))];
      const address = [p.postcode ? `〒${p.postcode}` : '', ...parts].filter(Boolean).join(' ');
      rows.push({ key, name, address, lat, lng, incomplete: !(p.street && p.housenumber) });
      if (rows.length === 6) break;
    }
    return rows;
  }
  function createClient({ fetchImpl = (...args) => fetch(...args), now = Date.now, timeoutMs = 12000, minIntervalMs = 1000 } = {}) {
    const cache = new Map();
    let lastStart = -Infinity;
    async function search(query, { signal, bias } = {}) {
      query = String(query || '').trim().slice(0, 80);
      if (query.length < 2) return [];
      signal?.throwIfAborted();
      const url = new URL(ENDPOINT);
      // The public server supports "default", en/de/fr; ja is rejected.
      url.search = new URLSearchParams({ q: query, limit: '6', lang: 'default', countrycode: 'JP' });
      if (Number.isFinite(bias?.lat) && Number.isFinite(bias?.lng)) {
        url.searchParams.set('lat', bias.lat.toFixed(2));
        url.searchParams.set('lon', bias.lng.toFixed(2));
      }
      const key = url.href, saved = cache.get(key);
      if (saved && now() - saved.time < 30 * 60 * 1000) return saved.rows;
      const controller = new AbortController();
      const abort = () => controller.abort();
      signal?.addEventListener('abort', abort, { once: true });
      let timer, timedOut = false;
      try {
        const delay = Math.max(0, minIntervalMs - (now() - lastStart));
        if (delay) await new Promise((resolve, reject) => {
          const stop = () => { clearTimeout(wait); reject(new DOMException('Aborted', 'AbortError')); };
          const wait = setTimeout(() => { controller.signal.removeEventListener('abort', stop); resolve(); }, delay);
          controller.signal.addEventListener('abort', stop, { once: true });
        });
        controller.signal.throwIfAborted();
        lastStart = now();
        timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
        const response = await fetchImpl(url.href, { signal: controller.signal, credentials: 'omit', headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error(response.status === 429 ? '搜索过于频繁，请稍后重试' : `搜索服务暂不可用（${response.status}），请重试`);
        const rows = normalize(await response.json());
        controller.signal.throwIfAborted();
        if (cache.size >= 50) cache.delete(cache.keys().next().value);
        cache.set(key, { rows, time: now() });
        return rows;
      } catch (error) {
        if (timedOut) throw new Error('地址搜索超时，请重试');
        if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
        if (error instanceof TypeError) throw new Error('无法连接地址搜索服务，请检查网络后重试');
        throw error;
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
      }
    }
    return { search };
  }
  return { ENDPOINT, normalize, createClient };
});
