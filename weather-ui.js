(function (root) {
  'use strict';
  function createPanel({ host, getDay, getPlaces, onSelectDay, getView = () => 'all', isActive = () => true, client = root.JP_WEATHER.createClient(), now = Date.now }) {
    const W = root.JP_WEATHER;
    let spot = W.FUJI_SPOTS[0], previousDay, viewDate = W.FUJI_DAYS[0];
    const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    const shortDate = date => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
    const unit = (value, suffix, round = true) => Number.isFinite(value) ? `${round ? Math.round(value) : value}${suffix}` : '—';
    const source = '<a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a>';
    const labels = { good: '较适合', fair: '可备选', poor: '不理想' };
    const timeLabel = state => state.fetchedAt ? `${W.japanTime(state.fetchedAt).replace('T', ' ')} 读取 · 日本时间` : '';
    function range(date) { return W.forecastRange(date, now()); }
    function pendingText(date) {
      const r = range(date);
      return r.status === 'past' ? '日期已过，本页不提供历史天气' : `尚未进入预报范围 · 预计 ${r.opens} 起可查询`;
    }
    function current(state) { return state.status === 'ready' && !state.stale; }
    function dailyCard(date, location) {
      const r = range(date), state = client.read(location), daily = state.data && W.dailyFor(state.data, date);
      if (r.status !== 'available') return `<article class="weather-location"><strong>${escape(location.name)}</strong><p class="weather-muted">${pendingText(date)}</p></article>`;
      if (!daily) return `<article class="weather-location"><strong>${escape(location.name)}</strong><p class="weather-muted">${state.status === 'error' ? escape(state.error) : state.status === 'ready' ? '该日数据暂缺，请稍后刷新' : '正在获取天气…'}</p></article>`;
      const info = W.weatherCode(daily.code);
      return `<article class="weather-location"><div class="weather-location-top"><strong>${escape(location.name)}</strong><span>${info.icon} ${info.text}</span></div>
        <div class="weather-temperature">${unit(daily.min, '°')} <span>/</span> ${unit(daily.max, '°C')}</div>
        <div class="weather-metrics"><span>降水概率 <b>${unit(daily.rain, '%')}</b></span><span>最大风速 <b>${unit(daily.wind, ' km/h')}</b></span></div>
        <p class="weather-meta">${!current(state) ? `<strong>旧数据 · ${escape(state.error || '正在更新')}</strong><br>` : ''}${timeLabel(state)}</p></article>`;
    }
    function fujiResult(date) {
      if (range(date).status !== 'available') return null;
      const state = client.read(spot);
      return current(state) ? W.bestFujiWindow(state.data, date, now()) : null;
    }
    function fujiCard() {
      const state = client.read(spot), values = W.FUJI_DAYS.map(date => ({ date, result: fujiResult(date) }));
      const available = values.filter(item => item.result).sort((a, b) => b.result.score - a.result.score);
      const best = available[0], selected = fujiResult(viewDate), r = range(viewDate);
      const anyInRange = W.FUJI_DAYS.some(date => range(date).status === 'available');
      let recommendation = `2/18–2/21 择一天去看山`;
      if (best) recommendation = best.result.grade === 'good' ? `较佳候选 ${shortDate(best.date)} · ${best.result.start}–${best.result.end}` : `已覆盖日期暂无明显好窗口${best.result.grade === 'fair' ? ` · ${shortDate(best.date)} 可备选` : ''}`;
      let message = r.status !== 'available' ? pendingText(viewDate) : state.status === 'error' ? escape(state.error) :
        state.status === 'ready' && !state.stale ? '该日白天三小时连续数据不足，暂不评分' : '正在读取云量、能见度与降水…';
      if (selected) message = `${shortDate(viewDate)} 较好时段 ${selected.start}–${selected.end} · 日本时间`;
      return `<section class="fuji-panel" aria-labelledby="fujiTitle">
        <div class="weather-heading"><div><p class="weather-kicker">东京段 · 看山择日</p><h3 id="fujiTitle">富士見予報</h3></div><span class="fuji-badge">${selected ? labels[selected.grade] : '等待预报'}</span></div>
        <label class="fuji-location">观景方向<select data-fuji-spot aria-label="富士山观景地点">${W.FUJI_SPOTS.map(item => `<option value="${item.id}" ${spot.id === item.id ? 'selected' : ''}>${item.name}</option>`).join('')}</select></label>
        <div class="fuji-scene ${selected ? selected.grade : 'waiting'}">
          <svg viewBox="0 0 360 116" aria-hidden="true"><circle cx="282" cy="28" r="15" class="fuji-sun"/><path d="M0 108 76 77 117 94 178 18 249 96 288 79 360 108V116H0Z" fill="#779b9e"/><path d="m150 53 28-35 35 39-20-7-12 8-15-10Z" fill="#f6fbff"/><path d="M0 109q70-18 135 0t135 0 90 0V116H0Z" fill="#aac6ca"/><g class="fuji-clouds" fill="#fff" opacity=".9"><ellipse cx="169" cy="57" rx="61" ry="12"/><ellipse cx="151" cy="49" rx="27" ry="14"/><ellipse cx="191" cy="51" rx="32" ry="13"/></g></svg>
          <div class="fuji-scene-caption">${selected ? `<strong>${selected.score}<small> / 100 参考分</small></strong><span>${labels[selected.grade]} · ${escape(spot.name)}方向</span>` : '<strong>等天气近一点</strong><span>逐日比较，留出弹性</span>'}</div>
        </div>
        <p class="fuji-recommendation">${recommendation}</p>
        <p class="weather-meta">${best ? `已覆盖 ${available.length}/4 个候选日 · ${range(best.date).text}` : '未来 16 天（含今天） · 远期仅看趋势'} · 2/17 转场、2/22 返程不参与推荐</p>
        <div class="fuji-days" role="group" aria-label="富士山候选日期">${values.map(({ date, result }) => `<button type="button" class="fuji-day ${result?.grade || 'waiting'} ${date === viewDate ? 'selected' : ''}" data-fuji-date="${date}" aria-pressed="${date === viewDate}"><strong>${shortDate(date)}</strong><span>${result ? labels[result.grade] : range(date).status === 'available' ? state.status === 'error' ? '加载失败' : state.status === 'ready' ? '数据不足' : '加载中' : range(date).text}</span><b>${result ? `${result.score} 分` : '—'}</b><i class="fuji-meter"><i style="width:${result ? result.score : 0}%"></i></i></button>`).join('')}</div>
        <p class="fuji-window" role="status">${message}</p>
        ${selected ? `<div class="fuji-metrics"><span>总云量<b>${unit(selected.cloud, '%')}</b></span><span>低云量<b>${unit(selected.low, '%')}</b></span><span>能见度 ≥<b>${unit(selected.visibility / 1000, ' km')}</b></span><span>降水概率 ≤<b>${unit(selected.rain, '%')}</b></span></div><p class="weather-meta">云量为时段均值；能见度取最低值，降水概率取最高值。</p>` : ''}
        <details class="fuji-method"><summary>怎么看这个预报</summary><p>绿色较适合，橙色可备选，灰色不理想或待预报。比较 07:00–17:00 内有日照的连续三小时；相同分数优先较早时段。</p><p>参考分：少云占 45 分，地面能见度占 30 分（30 km 封顶），低降水概率占 25 分。雨雪量 ≥ 0.2 mm、降水概率 ≥ 60% 或能见度 &lt; 10 km 的时段限制到 39 分以下。较适合还需总云 ≤ 40%、低云 ≤ 30%、能见度 ≥ 20 km、降水概率 ≤ 20%。</p><p>这是基于观景点地面预报的相对评分，不是见山概率，也不是官方富士山可见度预报。山顶、视线沿途的云雾及遮挡未被完整建模；东京晴天不代表富士山可见。出发前 1–3 天再复核。</p></details>
        <div class="weather-footer"><span>${source}${timeLabel(state) ? `<br>${timeLabel(state)}` : ''}${state.stale ? '<br>缓存已过期，待更新' : ''}</span><button type="button" class="weather-refresh" data-refresh-fuji ${!anyInRange || state.status === 'loading' ? 'disabled' : ''}>刷新富士見予報</button></div>
      </section>`;
    }
    function loadLocations(locations, force = false) {
      const unique = new Map(locations.map(location => [W.locationKey(location), location]));
      unique.forEach(location => {
        const state = client.read(location);
        if (state.status === 'loading') return;
        if (force || state.status === 'idle' || state.date !== W.japanTime(now()).slice(0, 10) || (state.status === 'ready' && state.stale)) {
          client.load(location, { force }).then(() => render());
        }
      });
    }
    function showFuji() { return getView() === 'fuji' || (getView() === 'all' && W.TOKYO_DAYS.includes(getDay())); }
    function visibleLocations() {
      const date = getDay(), locations = getView() !== 'fuji' && range(date).status === 'available' ? W.locationsForDay(date, getPlaces()) : [];
      if (showFuji() && W.FUJI_DAYS.some(item => range(item).status === 'available')) locations.push(spot);
      return locations;
    }
    function render({ refresh = false } = {}) {
      // A closed query dialog does no work, including after a late network response.
      if (!isActive()) return;
      const date = getDay(), locations = W.locationsForDay(date, getPlaces());
      if (!locations.length && getView() !== 'fuji') { host.hidden = true; return; }
      if (previousDay !== date && W.FUJI_DAYS.includes(date)) viewDate = date;
      previousDay = date;
      // Start requests before building the view so loading and retry buttons reflect actual state.
      loadLocations(visibleLocations(), refresh);
      const methodOpen = host.querySelector('.fuji-method')?.open;
      const r = range(date), loading = locations.some(location => client.read(location).status === 'loading');
      host.hidden = false;
      host.innerHTML = (getView() !== 'fuji' ? `<section class="daily-weather" aria-labelledby="dailyWeatherTitle"><div class="weather-heading"><h3 id="dailyWeatherTitle">${shortDate(date)} · 当地天气</h3><span class="weather-meta">${r.status === 'available' ? r.text : '16 天预报 · 含今天'}</span></div>
        ${locations.map(location => dailyCard(date, location)).join('')}
        <div class="weather-footer"><span>${source} · 日本时间</span><button type="button" class="weather-refresh" data-refresh-weather ${r.status !== 'available' || loading ? 'disabled' : ''}>${loading ? '正在更新…' : '刷新天气'}</button></div></section>` : '') + (showFuji() ? fujiCard() : '');
      if (methodOpen && showFuji()) host.querySelector('.fuji-method').open = true;
      host.querySelector('[data-refresh-weather]')?.addEventListener('click', () => render({ refresh: true }));
      host.querySelector('[data-refresh-fuji]')?.addEventListener('click', () => {
        loadLocations([spot], true); render();
      });
      host.querySelector('[data-fuji-spot]')?.addEventListener('change', event => {
        spot = W.FUJI_SPOTS.find(item => item.id === event.target.value) || W.FUJI_SPOTS[0]; render();
      });
      host.querySelectorAll('[data-fuji-date]').forEach(button => button.addEventListener('click', () => {
        viewDate = button.dataset.fujiDate; onSelectDay(viewDate);
      }));
    }
    return { render };
  }
  root.JP_WEATHER_UI = { createPanel };
})(typeof window === 'undefined' ? globalThis : window);
