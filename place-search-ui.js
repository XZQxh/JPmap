(function (root) {
  'use strict';
  function create(options) {
    const { input, button, status, list, mapHost, mapMessage, onSelect, onInvalidate, getBias, client } = options;
    let job = 0, controller, timer, composing = false, active = false, rows = [], selected = -1;
    let preview = null, pins = [], pendingSelection = false, baseCoords = null;
    function clearPins() { pins.splice(0).forEach(pin => pin.remove()); }
    function cancel() { ++job; clearTimeout(timer); controller?.abort(); controller = null; button.disabled = false; list.setAttribute('aria-busy', 'false'); }
    function clearResults() { rows = []; selected = -1; list.replaceChildren(); clearPins(); mapHost.hidden = true; mapMessage.hidden = true; }
    function drawMap() {
      clearPins();
      mapHost.hidden = !rows.length;
      if (!rows.length) return;
      try {
        if (!preview) {
          preview = new root.maplibregl.Map({ container: mapHost, style: root.JP_COLOR_MAP_STYLE,
            center: [rows[0].lng, rows[0].lat], zoom: 12, minZoom: 3, maxZoom: 19,
            dragRotate: false, pitchWithRotate: false, attributionControl: false });
          preview.addControl(new root.maplibregl.AttributionControl({ compact: true }));
          preview.on('error', () => { mapMessage.hidden = false; });
        }
        preview.resize();
        const bounds = new root.maplibregl.LngLatBounds();
        rows.forEach((row, index) => {
          const pin = document.createElement('button');
          pin.type = 'button'; pin.className = 'search-map-pin'; pin.textContent = index + 1;
          pin.setAttribute('aria-label', `选择候选 ${index + 1}：${row.name}`);
          pin.addEventListener('click', () => select(index));
          pins.push(new root.maplibregl.Marker({ element: pin }).setLngLat([row.lng, row.lat]).addTo(preview));
          bounds.extend([row.lng, row.lat]);
        });
        preview.fitBounds(bounds, { padding: 40, maxZoom: 15, duration: 0 });
      } catch (_) {
        mapHost.hidden = true; mapMessage.hidden = false;
      }
    }
    function select(index) {
      const row = rows[index];
      if (!row || !active) return;
      selected = index; pendingSelection = false; baseCoords = null;
      input.value = row.name.slice(0, 80);
      onSelect(row);
      [...list.children].forEach((node, i) => node.setAttribute('aria-pressed', String(i === selected)));
      pins.forEach((pin, i) => pin.getElement().classList.toggle('selected', i === selected));
      preview?.easeTo({ center: [row.lng, row.lat], zoom: 15, duration: 250 });
      status.textContent = `已选择候选 ${index + 1}，确认地址后保存地点。${row.incomplete ? '来源未提供完整门牌号，可自行补充。' : ''}`;
    }
    async function search() {
      cancel();
      if (!active || composing) return;
      const query = input.value.trim();
      clearResults();
      if (query.length < 2) { status.textContent = '输入至少两个字，自动搜索日本的地点或地址。'; return; }
      pendingSelection = !baseCoords;
      if (pendingSelection) onInvalidate();
      const currentJob = job;
      controller = new AbortController();
      button.disabled = true; list.setAttribute('aria-busy', 'true');
      status.textContent = '正在查找候选地址…';
      try {
        const result = await client.search(query, { signal: controller.signal, bias: getBias() });
        if (!active || currentJob !== job) return;
        rows = result;
        status.textContent = rows.length ? `找到 ${rows.length} 个候选，点击列表或地图编号选择；尚未保存。${baseCoords ? '也可保留原坐标保存。' : ''}` : `没有找到候选。请尝试日文名称，或加上城市名后重试。${baseCoords ? '也可保留原坐标保存。' : '也可关闭窗口，在主地图上点选位置。'}`;
        rows.forEach((row, index) => {
          const item = document.createElement('button');
          item.type = 'button'; item.className = 'place-search-result'; item.setAttribute('aria-pressed', 'false');
          const title = document.createElement('strong'); title.textContent = `${index + 1}. ${row.name}`;
          const address = document.createElement('span'); address.textContent = row.address || '来源未提供街道地址';
          const hint = document.createElement('small'); hint.textContent = `${row.lat.toFixed(5)}, ${row.lng.toFixed(5)}${row.incomplete ? ' · 门牌号待补充' : ''}`;
          item.append(title, address, hint); item.addEventListener('click', () => select(index)); list.append(item);
        });
        drawMap();
      } catch (error) {
        if (active && currentJob === job && error.name !== 'AbortError') status.textContent = error.message || '搜索失败，请重试';
      } finally {
        if (currentJob === job) { button.disabled = false; list.setAttribute('aria-busy', 'false'); }
      }
    }
    function changed() {
      cancel();
      if (selected >= 0 || !baseCoords) { pendingSelection = true; onInvalidate(); }
      clearResults();
      status.textContent = '输入至少两个字，自动搜索日本的地点或地址。';
      if (active && !composing && input.value.trim().length >= 2) timer = setTimeout(search, 900);
    }
    input.addEventListener('input', changed);
    input.addEventListener('compositionstart', () => { composing = true; cancel(); });
    input.addEventListener('compositionend', () => { composing = false; changed(); });
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.isComposing && !composing && event.keyCode !== 229) { event.preventDefault(); search(); }
    });
    button.addEventListener('click', search);
    return {
      reset(coords) {
        cancel(); clearResults(); active = true; composing = false; baseCoords = coords; pendingSelection = false;
        status.textContent = coords ? '可保留当前坐标，或输入名称搜索并选择新的位置。' : '输入至少两个字，自动搜索日本的地点或地址。';
      },
      close() { cancel(); active = false; clearResults(); preview?.remove(); preview = null; },
      needsSelection: () => pendingSelection
    };
  }
  root.JP_PLACE_SEARCH_UI = { create };
})(typeof globalThis !== 'undefined' ? globalThis : this);
