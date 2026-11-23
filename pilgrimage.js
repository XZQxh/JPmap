(function (root) {
  'use strict';
  const API = 'https://api.anitabi.cn';
  const RADIUS_KM = 2;
  const DEFAULT_WORKS = [
    { id: 115908, name: '吹响吧！上低音号' },
    { id: 1424, name: '轻音少女' },
    { id: 428735, name: "BanG Dream! It's MyGO!!!!!" },
    { id: 328609, name: '孤独摇滚！' }
  ];
  function workId(value) {
    const text = String(value).trim();
    if (/^[1-9]\d{0,8}$/.test(text)) return Number(text);
    try {
      const url = new URL(text);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
      const match = /^(?:www\.)?(?:bgm\.tv|bangumi\.tv|chii\.in)$/.test(url.hostname) && url.pathname.match(/^\/subject\/([1-9]\d{0,8})\/?$/);
      if (match) return Number(match[1]);
      if (/^(?:www\.)?anitabi\.cn$/.test(url.hostname)) return workId(url.searchParams.get('bangumiId') || '');
    } catch (_) {}
    return null;
  }
  function position(geo) {
    return Array.isArray(geo) && typeof geo[0] === 'number' && typeof geo[1] === 'number' &&
      Number.isFinite(geo[0]) && Number.isFinite(geo[1]) && Math.abs(geo[0]) <= 90 && Math.abs(geo[1]) <= 180
      ? { lat: geo[0], lng: geo[1] } : null;
  }
  function color(value, id) {
    if (typeof value === 'string' && /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(value)) return value;
    // A stable fallback only when the API does not supply a usable work color.
    const palette = ['#b95778', '#2a8496', '#7c63b3', '#b77a24', '#368068', '#b45d40', '#4b73ae'];
    return palette[Math.abs(Number(id) || 0) % palette.length];
  }
  function distanceKm(a, b) {
    const rad = n => n * Math.PI / 180;
    const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
    return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
  }
  function subjectUrl(id) { return `https://anitabi.cn/map?bangumiId=${workId(id) || ''}`; }
  function safeUrl(value) {
    try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : ''; } catch (_) { return ''; }
  }
  function thumbnail(value) {
    const safe = safeUrl(value); if (!safe) return '';
    const url = new URL(safe);
    if (url.protocol !== 'https:' || url.hostname !== 'image.anitabi.cn') return '';
    url.searchParams.set('plan', 'h160'); return url.href;
  }
  function normalizePoints(work, points) {
    const seen = new Set(); let invalid = 0;
    const rows = [];
    for (const point of points) {
      const pos = position(point?.geo);
      if (!pos || !point.id || typeof point.id !== 'string') { invalid++; continue; }
      const key = `${work.id}:${point.id}`;
      if (seen.has(key)) continue; seen.add(key);
      rows.push({ key, id: point.id, ...pos, name: String(point.cn || point.name || `地标 ${point.id}`),
        workId: work.id, workName: work.name, workColor: color(work.color, work.id),
        image: thumbnail(point.image), episode: point.ep == null ? '' : String(point.ep),
        origin: String(point.origin || ''), originUrl: safeUrl(point.originURL), sourceUrl: subjectUrl(work.id) });
    }
    return { rows, invalid };
  }
  function withinRadius(rows, origin) {
    if (!origin || !position([origin.lat, origin.lng])) throw new Error('无效的查询位置');
    return rows.map(row => ({ ...row, distanceKm: distanceKm(origin, row) }))
      .filter(row => row.distanceKm <= RADIUS_KM).sort((a, b) => a.distanceKm - b.distanceKm || a.key.localeCompare(b.key));
  }
  function createClient({ fetchFn = (...args) => root.fetch(...args), now = Date.now, timeoutMs = 15000 } = {}) {
    const cache = new Map();
    async function json(path, signal) {
      signal?.throwIfAborted();
      const controller = new AbortController();
      const abort = () => controller.abort(); signal?.addEventListener('abort', abort, { once: true });
      const timer = setTimeout(abort, timeoutMs);
      try {
        const response = await fetchFn(API + path, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
        if (!response.ok) throw new Error(`Anitabi 返回 HTTP ${response.status}`);
        return await response.json();
      } catch (error) {
        if (signal?.aborted) throw new DOMException('已取消查询', 'AbortError');
        if (error.name === 'AbortError') throw new Error('Anitabi 请求超时');
        if (error instanceof TypeError) throw new Error('无法连接 Anitabi，请检查网络或接口的跨域访问限制');
        throw error;
      } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
    }
    async function loadWork(entry, signal) {
      const id = workId(entry.id); if (!id) throw new Error('无效的作品 ID');
      const hit = cache.get(id);
      if (hit && now() - hit.at < 3600000) return hit.value;
      // Never substitute litePoints: those are only ten representative landmarks.
      const points = await json(`/bangumi/${id}/points/detail`, signal);
      if (!Array.isArray(points)) throw new Error('Anitabi 点位数据格式不受支持');
      let lite = {}, metadataError = '';
      try { lite = await json(`/bangumi/${id}/lite`, signal); if (!lite || Number(lite.id) !== id) throw new Error('作品资料格式不受支持'); }
      catch (error) { if (signal?.aborted) throw error; metadataError = error.message; lite = {}; }
      const work = { id, name: String(lite.cn || lite.title || entry.name || `作品 ${id}`), color: color(lite.color, id) };
      const normalized = normalizePoints(work, points);
      const warnings = [];
      if (metadataError) warnings.push('作品资料未加载，颜色使用备用色');
      if (Number.isFinite(lite.pointsLength) && points.length < lite.pointsLength) warnings.push(`接口仅返回 ${points.length}/${lite.pointsLength} 个点位`);
      if (normalized.invalid) warnings.push(`${normalized.invalid} 个点位缺少有效坐标`);
      const value = { work, rows: normalized.rows, warnings, fetchedAt: now() };
      if (!metadataError) cache.set(id, { at: now(), value });
      return value;
    }
    async function search(origin, entries, { signal, onProgress = () => {} } = {}) {
      if (!position([origin?.lat, origin?.lng])) throw new Error('无效的查询位置');
      const unique = [...new Map(entries.map(entry => [workId(entry.id), entry])).values()];
      if (!unique.length || unique.length > 20) throw new Error('请选择 1–20 部关注作品');
      const works = [], failures = []; let next = 0, done = 0;
      // Two workers bound traffic even when many works are followed.
      async function worker() {
        while (next < unique.length) {
          signal?.throwIfAborted(); const entry = unique[next++];
          try { works.push(await loadWork(entry, signal)); }
          catch (error) { if (signal?.aborted) throw error; failures.push({ id: entry.id, name: entry.name || `作品 ${entry.id}`, message: error.message || '无法连接 Anitabi（可能被跨域或访问策略限制）' }); }
          onProgress(++done, unique.length);
        }
      }
      await Promise.all([worker(), worker()]); signal?.throwIfAborted();
      return { rows: withinRadius(works.flatMap(work => work.rows), origin), works, failures };
    }
    return { search, clearCache: () => cache.clear() };
  }
  const api = { DEFAULT_WORKS, RADIUS_KM, workId, position, color, distanceKm, subjectUrl, safeUrl, thumbnail, normalizePoints, withinRadius, createClient };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.JP_PILGRIMAGE = api;
})(typeof window !== 'undefined' ? window : globalThis);
