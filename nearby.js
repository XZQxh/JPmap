(function (root) {
  'use strict';
  function validPosition(value) {
    return !!value && Number.isFinite(value.lat) && Number.isFinite(value.lng) &&
      Math.abs(value.lat) <= 90 && Math.abs(value.lng) <= 180;
  }
  function buildNearcadeUrl(position, page = false) {
    if (!validPosition(position)) throw new Error('无效的位置坐标');
    const url = new URL(page ? 'https://nearca.de/discover' : 'https://nearca.de/api/discover');
    const params = { latitude: position.lat, longitude: position.lng, radius: 5,
      gameTitleIds: 1, limit: 150, convertFrom: 'WGS84', fetchAttendance: false, includeTimeInfo: false };
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));
    return url.href;
  }
  async function fetchArcades(position, { fetchFn = root.fetch.bind(root), signal } = {}) {
    const response = await fetchFn(buildNearcadeUrl(position), {
      signal, credentials: 'omit', referrerPolicy: 'no-referrer'
    });
    if (!response.ok) throw new Error(response.status === 429 ? 'nearcade 请求较多，请稍后重试。' : 'nearcade 暂时不可用，请稍后重试或前往其网站。');
    const data = await response.json();
    if (!data || !Array.isArray(data.shops)) throw new Error('nearcade 返回的数据暂时无法读取。');
    // Preserve the upstream order, distances and coverage. No local radius filter or ranking.
    return data;
  }
  function shopPosition(shop) {
    const coords = shop.location?.coordinates;
    const system = shop.location?.coordinateSystem;
    if (system && system !== 'WGS84') return null;
    const value = { lng: coords?.[0], lat: coords?.[1] };
    return validPosition(value) ? value : null;
  }
  function shopUrl(shop) { return `https://nearca.de/shops/${encodeURIComponent(String(shop.id))}`; }
  function gameInfo(shop) {
    return (shop.games || []).filter(game => Number(game.titleId) === 1).map(game =>
      [game.name || 'maimai DX', game.version, game.comment || (Number.isFinite(game.quantity) ? `登记数量 ${game.quantity}` : '')]
        .filter(Boolean).join(' · ')).join('；') || 'maimai DX · 机台信息见 nearcade';
  }
  function locationError(error) {
    if (error.code === 1) return '未获得定位权限。请在浏览器中允许位置访问，或选择“找机厅 · 按地图中心”。';
    if (error.code === 3) return '定位超时，请移至信号较好的位置后重试，或按地图中心查找。';
    return '暂时无法获取位置，请检查手机定位服务，或按地图中心查找。';
  }
  function createLocationTracker({ geolocation, secureContext = true, onPosition = () => {}, onState = () => {}, now = Date.now }) {
    let watchId = null, active = false, generation = 0, cached = null;
    function check() {
      if (!secureContext) throw new Error('手机定位需要 HTTPS 页面；本机调试请通过 localhost 打开。');
      if (!geolocation) throw new Error('此浏览器不支持定位，请按地图中心查找。');
    }
    function read(position) {
      const result = { lat: position.coords.latitude, lng: position.coords.longitude,
        accuracy: position.coords.accuracy, timestamp: position.timestamp || now() };
      if (!validPosition(result)) throw new Error('手机返回了无效的位置，请重试。');
      return result;
    }
    function stop() {
      generation++; active = false;
      if (watchId !== null) geolocation.clearWatch(watchId);
      watchId = null; cached = null; onState('off');
    }
    function start() {
      check();
      if (active) return;
      active = true;
      const epoch = ++generation;
      onState('requesting');
      try {
        watchId = geolocation.watchPosition(position => {
          if (!active || epoch !== generation) return;
          try { cached = read(position); onPosition(cached); onState('watching'); }
          catch (error) { onState('error', error.message); }
        }, error => {
          if (!active || epoch !== generation) return;
          if (error.code === 1) stop();
          onState('error', locationError(error));
        }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
      } catch (error) { stop(); throw error; }
    }
    function locate() {
      try { check(); } catch (error) { return Promise.reject(error); }
      if (cached && now() - cached.timestamp < 15000) return Promise.resolve({ ...cached });
      return new Promise((resolve, reject) => geolocation.getCurrentPosition(position => {
        try { resolve(read(position)); } catch (error) { reject(error); }
      }, error => reject(new Error(locationError(error))),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }));
    }
    return { start, stop, locate, isActive: () => active };
  }
  const api = { validPosition, buildNearcadeUrl, fetchArcades, shopPosition, shopUrl, gameInfo, locationError, createLocationTracker };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.JP_NEARBY = api;
})(typeof window === 'undefined' ? globalThis : window);
