(function (root) {
  'use strict';
  const DAY = 86400000, TTL = 30 * 60 * 1000;
  const CITIES = {
    osaka: { id: 'osaka', name: '大阪', lat: 34.6937, lng: 135.5023 },
    kyoto: { id: 'kyoto', name: '京都', lat: 35.0116, lng: 135.7681 },
    tokyo: { id: 'tokyo', name: '东京', lat: 35.6762, lng: 139.6503 }
  };
  const FUJI_SPOTS = [
    { id: 'kawaguchiko', name: '河口湖', lat: 35.5078, lng: 138.7681 },
    { id: 'yamanakako', name: '山中湖', lat: 35.4106, lng: 138.8609 },
    { id: 'hakone', name: '箱根 · 芦之湖', lat: 35.2026, lng: 139.0253 }
  ];
  const TOKYO_DAYS = ['2027-02-17', '2027-02-18', '2027-02-19', '2027-02-20', '2027-02-21', '2027-02-22'];
  const FUJI_DAYS = TOKYO_DAYS.slice(1, -1);
  function japanTime(now = Date.now()) { return new Date(Number(now) + 9 * 3600000).toISOString().slice(0, 16); }
  function addDays(date, offset) { return new Date(Date.parse(date + 'T00:00:00Z') + offset * DAY).toISOString().slice(0, 10); }
  function forecastRange(date, now = Date.now()) {
    const today = japanTime(now).slice(0, 10);
    const offset = Math.round((Date.parse(date) - Date.parse(today)) / DAY);
    if (offset < 0) return { status: 'past', text: '日期已过', offset };
    if (offset > 15) return { status: 'future', text: '待预报', opens: addDays(date, -15), offset };
    return { status: 'available', offset, text: offset > 7 ? '远期趋势' : offset > 3 ? '计划参考' : '临近预报' };
  }
  function locationKey(location) { return `${location.lat.toFixed(3)},${location.lng.toFixed(3)}`; }
  function distance(a, b) {
    const rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    return 12742 * Math.asin(Math.min(1, Math.sqrt(Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2)));
  }
  function locationsForDay(date, places = []) {
    if (!/^2027-02-(1[2-9]|2[0-2])$/.test(date)) return [];
    const cities = date === '2027-02-17' ? [CITIES.kyoto, CITIES.osaka, CITIES.tokyo] :
      [date < '2027-02-14' ? CITIES.osaka : date < '2027-02-17' ? CITIES.kyoto : CITIES.tokyo];
    const result = [...cities];
    // Nearby stops share the city forecast; excursions use their own coordinates.
    for (const place of places) {
      if (!place.date || !(place.date <= date && date <= (place.endDate || place.date))) continue;
      if (!Number.isFinite(place.lat) || !Number.isFinite(place.lng) || Math.abs(place.lat) > 90 || Math.abs(place.lng) > 180) continue;
      if (result.every(location => distance(location, place) >= 20)) result.push({ name: place.name, lat: place.lat, lng: place.lng });
    }
    return result;
  }
  function weatherCode(code) {
    if (code === 0) return { icon: '☀️', text: '晴' };
    if (code === 1) return { icon: '🌤️', text: '大部晴朗' };
    if (code === 2) return { icon: '⛅', text: '多云' };
    if (code === 3) return { icon: '☁️', text: '阴' };
    if ([45, 48].includes(code)) return { icon: '🌫️', text: '雾' };
    if ([71, 73, 75, 77, 85, 86].includes(code)) return { icon: '🌨️', text: '雪' };
    if ([95, 96, 99].includes(code)) return { icon: '⛈️', text: '雷雨' };
    if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { icon: '🌧️', text: '雨' };
    return { icon: '—', text: '天气数据缺失' };
  }
  function numberAt(series, index) { return Number.isFinite(series?.[index]) ? series[index] : null; }
  function dailyFor(data, date) {
    const daily = data?.daily, index = daily?.time?.indexOf(date) ?? -1;
    if (index < 0) return null;
    return { code: numberAt(daily.weather_code, index), min: numberAt(daily.temperature_2m_min, index),
      max: numberAt(daily.temperature_2m_max, index), rain: numberAt(daily.precipitation_probability_max, index), wind: numberAt(daily.wind_speed_10m_max, index) };
  }
  function bestFujiWindow(data, date, now = Date.now()) {
    const hourly = data?.hourly;
    if (!Array.isArray(hourly?.time)) return null;
    const current = japanTime(now), candidates = [];
    for (let i = 0; i < hourly.time.length - 2; i++) {
      const time = hourly.time[i];
      if (typeof time !== 'string') continue;
      const hour = Number(time.slice(11, 13));
      if (!time.startsWith(date + 'T') || time < current || hour < 7 || hour > 14) continue;
      const rows = [i, i + 1, i + 2].map(index => ({ time: hourly.time[index],
        cloud: numberAt(hourly.cloud_cover, index), low: numberAt(hourly.cloud_cover_low, index),
        visibility: numberAt(hourly.visibility, index), rain: numberAt(hourly.precipitation_probability, index),
        precipitation: numberAt(hourly.precipitation, index), daylight: numberAt(hourly.is_day, index) }));
      if (rows.some((row, j) => row.time !== `${date}T${String(hour + j).padStart(2, '0')}:00` || row.daylight !== 1 ||
        [row.cloud, row.low, row.visibility, row.rain, row.precipitation].some(value => value === null || value < 0) ||
        row.cloud > 100 || row.low > 100 || row.rain > 100)) continue;
      const mean = key => rows.reduce((sum, row) => sum + row[key], 0) / 3;
      const cloud = mean('cloud'), low = mean('low'), visibility = Math.min(...rows.map(row => row.visibility)), rain = Math.max(...rows.map(row => row.rain));
      let score = Math.round(45 * (1 - cloud / 100) + 30 * Math.min(visibility / 30000, 1) + 25 * (1 - rain / 100));
      if (rain >= 60 || visibility < 10000 || rows.some(row => row.precipitation >= .2)) score = Math.min(score, 39);
      const grade = score >= 70 && cloud <= 40 && low <= 30 && visibility >= 20000 && rain <= 20 ? 'good' : score >= 40 ? 'fair' : 'poor';
      candidates.push({ score, grade, cloud, low, visibility, rain, start: `${String(hour).padStart(2, '0')}:00`, end: `${String(hour + 3).padStart(2, '0')}:00` });
    }
    return candidates.sort((a, b) => b.score - a.score || a.start.localeCompare(b.start))[0] || null;
  }
  function forecastUrl(location) {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    Object.entries({ latitude: location.lat, longitude: location.lng, timezone: 'Asia/Tokyo', forecast_days: 16,
      temperature_unit: 'celsius', wind_speed_unit: 'kmh',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max',
      hourly: 'cloud_cover,cloud_cover_low,visibility,precipitation_probability,precipitation,is_day' })
      .forEach(([key, value]) => url.searchParams.set(key, String(value)));
    return url.href;
  }
  function createClient({ fetchFn = (...args) => root.fetch(...args), now = Date.now, timeoutMs = 15000 } = {}) {
    const cache = new Map();
    function read(location) {
      const entry = cache.get(locationKey(location));
      if (!entry) return { status: 'idle' };
      return { ...entry, stale: !!entry.data && (now() - entry.fetchedAt >= TTL || entry.date !== japanTime(now()).slice(0, 10)) };
    }
    function load(location, { force = false } = {}) {
      const key = locationKey(location), previous = read(location), today = japanTime(now()).slice(0, 10);
      if (previous.status === 'loading') return previous.promise;
      if (!force && previous.date === today && (previous.status === 'error' || (previous.status === 'ready' && !previous.stale))) return Promise.resolve(previous);
      const entry = { ...previous, status: 'loading', date: today };
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      entry.promise = (async () => {
        try {
          const response = await fetchFn(forecastUrl(location), { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
          if (!response.ok) throw new Error(response.status === 429 ? '请求较多，请稍后刷新' : `天气服务暂不可用（${response.status}）`);
          const data = await response.json();
          if (!Array.isArray(data?.daily?.time) || !data.daily.time.length || !Array.isArray(data?.hourly?.time) || !data.hourly.time.length || data.timezone !== 'Asia/Tokyo' ||
            !data.daily.time.includes(today) || !Number.isFinite(data.latitude) || !Number.isFinite(data.longitude) || distance(location, { lat: data.latitude, lng: data.longitude }) > 100)
            throw new Error('天气数据不完整或日期、地点不匹配');
          Object.assign(entry, { status: 'ready', data, fetchedAt: now(), error: null });
        } catch (error) {
          Object.assign(entry, { status: 'error', error: error.name === 'AbortError' ? '天气请求超时，请重试' : error.message || '天气加载失败，请重试' });
        } finally { clearTimeout(timer); delete entry.promise; }
        return read(location);
      })();
      cache.set(key, entry);
      return entry.promise;
    }
    return { read, load };
  }
  const api = { CITIES, FUJI_SPOTS, TOKYO_DAYS, FUJI_DAYS, TTL, japanTime, addDays, forecastRange, locationKey, locationsForDay, weatherCode, dailyFor, bestFujiWindow, forecastUrl, createClient };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.JP_WEATHER = api;
})(typeof window === 'undefined' ? globalThis : window);
