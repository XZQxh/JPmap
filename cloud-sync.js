(function (root) {
  'use strict';
  const META_KEY = 'jpmap-cloud-state-v1';
  const clone = value => JSON.parse(JSON.stringify(value));
  function validate(payload) {
    if (!payload || !Array.isArray(payload.places) || !Array.isArray(payload.flights) || !Array.isArray(payload.works)) throw new Error('行程数据不完整，请保留备份后重试');
    for (const p of payload.places) {
      if (!p || typeof p.id !== 'string' || typeof p.name !== 'string' || !Number.isFinite(p.lat) || !Number.isFinite(p.lng) || Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180) throw new Error('行程包含无效地点');
      if (!['stay', 'food', 'sight', 'anime', 'shop', 'maimai', 'flight'].includes(p.category)) throw new Error('行程包含不支持的地点类别');
    }
    if (payload.flights.some(f => !f || typeof f.id !== 'string')) throw new Error('航班数据不完整');
    if (payload.works.length > 20 || payload.works.some(w => !w || !Number.isSafeInteger(Number(w.id)) || Number(w.id) <= 0 || typeof w.name !== 'string')) throw new Error('关注作品数据不完整');
    if (JSON.stringify(payload).length > 1000000) throw new Error('行程过大，请先导出备份');
    return payload;
  }
  function createController({ transport, storage, getSnapshot, applySnapshot, onState = () => {} }) {
    let meta;
    try { meta = JSON.parse(storage.getItem(META_KEY)); } catch (_) {}
    if (!meta || !Number.isSafeInteger(meta.version) || typeof meta.owner !== 'string') meta = { owner: '', version: 0, dirty: false };
    let owner = '', ready = false, conflict = false, busy = false, generation = 0, timer;
    let status = { text: '未登录 · 仅保存在本机', signedIn: false, choose: false, busy: false };
    function emit(text) { status = { text, signedIn: !!owner, choose: conflict, busy }; onState(status); }
    function persist() { storage.setItem(META_KEY, JSON.stringify(meta)); }
    function backup(payload = getSnapshot()) {
      // Back up the visible itinerary before replacing it, including pending local edits.
      const key = `jpmap-backup-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      storage.setItem(key, JSON.stringify(payload));
      return key;
    }
    function changed() {
      generation++;
      meta.dirty = true; persist();
      if (!owner) { emit('未登录 · 修改已保存在本机'); return; }
      emit(conflict ? '请选择要保留的行程' : '已保存本机 · 等待同步');
      clearTimeout(timer);
      if (ready && !conflict) timer = setTimeout(() => sync(), 900);
    }
    async function sync() {
      if (!owner || !ready || conflict || busy) return;
      busy = true;
      const requestOwner = owner;
      try {
        emit('正在同步');
        if (meta.dirty) {
          const before = generation, payload = clone(validate(getSnapshot()));
          const row = await transport.save(payload, meta.version);
          if (owner !== requestOwner) return;
          if (!row) { conflict = true; emit('其他设备已更新，请选择要保留的行程'); return; }
          meta.version = Number(row.version); meta.dirty = before !== generation;
          persist();
          emit(meta.dirty ? '已保存本机 · 等待同步' : '已同步');
        } else {
          const before = generation, row = await transport.load();
          if (owner !== requestOwner) return;
          if (!row) { conflict = true; emit('云端没有行程，请选择上传本机行程'); return; }
          if (Number(row.version) !== meta.version) {
            if (before !== generation || meta.dirty) { conflict = true; emit('两台设备都有修改，请选择要保留的行程'); return; }
            validate(row.payload); backup();
            applySnapshot(clone(row.payload));
            meta.version = Number(row.version); meta.dirty = false; persist();
          }
          emit(meta.dirty ? '已保存本机 · 等待同步' : '已同步');
        }
      } catch (error) { emit(`同步未完成：${error.message}。本机行程仍保留`); }
      finally {
        busy = false; emit(status.text);
        // Retry new edits after a successful write, but never loop on network errors.
        if (owner && ready && !conflict && meta.dirty && status.text === '已保存本机 · 等待同步') {
          clearTimeout(timer); timer = setTimeout(() => sync(), 900);
        }
      }
    }
    async function connect(userId) {
      if (!userId || typeof userId !== 'string') throw new Error('没有有效的登录账号');
      if (owner === userId && ready) return sync();
      owner = userId; ready = false; conflict = false;
      const requestOwner = owner;
      emit('正在读取云端行程');
      try {
        const before = generation, row = await transport.load();
        if (owner !== requestOwner) return;
        if (meta.owner !== owner || (row && Number(row.version) !== meta.version && meta.dirty) || !row || before !== generation) {
          conflict = true; ready = true;
          emit(row ? '首次连接或存在不同版本，请选择行程' : '云端暂无行程，请上传本机行程');
          return;
        }
        ready = true;
        await sync();
      } catch (error) { emit(`连接未完成：${error.message}`); }
    }
    async function chooseCloud() {
      if (!owner || busy) return;
      busy = true; const requestOwner = owner, before = generation;
      try {
        emit('正在读取云端行程');
        const row = await transport.load();
        if (owner !== requestOwner) return;
        if (!row) throw new Error('云端暂无行程，请先上传');
        if (before !== generation) throw new Error('读取期间本机有新修改，请重新选择');
        validate(row.payload); backup(); applySnapshot(clone(row.payload));
        meta = { owner, version: Number(row.version), dirty: false }; persist();
        ready = true; conflict = false; emit('已同步');
      } catch (error) { emit(`读取未完成：${error.message}`); }
      finally { busy = false; emit(status.text); }
    }
    async function chooseLocal() {
      if (!owner || busy) return;
      busy = true; const requestOwner = owner;
      try {
        emit('正在检查云端版本');
        const row = await transport.load();
        if (owner !== requestOwner) return;
        if (row) { validate(row.payload); backup(row.payload); }
        backup();
        meta = { owner, version: Number(row?.version || 0), dirty: true }; persist();
        ready = true; conflict = false;
      } catch (error) { emit(`上传未完成：${error.message}`); return; }
      finally { busy = false; emit(status.text); }
      return sync();
    }
    function disconnect() {
      owner = ''; ready = false; conflict = false; clearTimeout(timer);
      emit('未登录 · 仅保存在本机');
    }
    return { changed, connect, sync, chooseCloud, chooseLocal, disconnect, state: () => ({ ...status }) };
  }
  async function loadSdk(config) {
    if (root.cloudbase) return root.cloudbase;
    await new Promise((resolve, reject) => {
      const script = document.createElement('script'); script.src = config.sdkUrl;
      script.onload = resolve; script.onerror = () => { script.remove(); reject(new Error('CloudBase 登录组件未能加载，请检查网络')); };
      document.head.append(script);
    });
    return root.cloudbase;
  }
  function mount({ getSnapshot, applySnapshot }) {
    const button = document.getElementById('cloudBtn'), dialog = document.getElementById('cloudDialog');
    const message = document.getElementById('cloudStatus'), form = document.getElementById('cloudLoginForm');
    const config = root.JP_CLOUDBASE_CONFIG;
    let app, auth, db, initialization;
    function show(state) {
      message.textContent = state.text;
      const footnote = document.getElementById('cloudFootnote');
      if (footnote) footnote.textContent = state.text;
      button.textContent = state.text === '已同步' ? '行程 · 已同步' : state.signedIn ? '行程同步' : '登录 / 同步';
      button.title = state.text;
      form.hidden = state.signedIn;
      document.getElementById('cloudSignedIn').hidden = !state.signedIn;
      document.getElementById('cloudChoices').hidden = !state.choose;
      for (const el of dialog.querySelectorAll('[data-cloud-action]')) el.disabled = state.busy;
    }
    async function rpc(name, args) {
      const session = await auth.getSession();
      if (session.error) throw session.error;
      if (!session.data?.session) throw new Error('登录已过期，请重新登录');
      const result = await db.rpc(name, args);
      if (result.error) throw new Error(result.error.message || '数据库访问失败');
      const row = Array.isArray(result.data) ? result.data[0] : result.data;
      return row || null;
    }
    const controller = createController({ storage: localStorage, getSnapshot, applySnapshot, onState: show,
      transport: { load: () => rpc('jpmap_load', {}), save: (payload, version) => rpc('jpmap_save', { p_payload: payload, p_expected_version: version }) } });
    root.JP_SYNC_CHANGE = () => controller.changed();
    async function restore() {
      const result = await auth.getSession();
      if (result.error) throw result.error;
      const id = result.data?.user?.id || result.data?.session?.user?.id || result.data?.session?.sub;
      if (result.data?.session && id) await controller.connect(id);
      else controller.disconnect();
    }
    async function initialize() {
      if (initialization) return initialization;
      initialization = (async () => {
        if (!config?.publishableKey) throw new Error('同步尚未配置完成，请先完成 CloudBase 设置');
        const claims = JSON.parse(atob(config.publishableKey.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        if (claims.role !== 'anon' || claims.aud !== config.env) throw new Error('浏览器只能使用本环境的 Publishable Key');
        const sdk = await loadSdk(config);
        app = sdk.init({ env: config.env, region: config.region, accessKey: config.publishableKey, auth: { detectSessionInUrl: true } });
        auth = app.auth;
        db = app.rdb();
        auth.onAuthStateChange((event) => {
          if (event === 'SIGNED_OUT') controller.disconnect();
          else if (event === 'SIGNED_IN') setTimeout(() => restore().catch(error => { message.textContent = error.message; }), 0);
        });
        await restore();
        return controller;
      })();
      try { return await initialization; } catch (error) { initialization = null; throw error; }
    }
    async function action(callback) {
      try { const client = await initialize(); await callback(client); }
      catch (error) { message.textContent = error.message; }
    }
    function listBackups() {
      const select = document.getElementById('cloudBackupSelect'); select.replaceChildren();
      const keys = Object.keys(localStorage).filter(key => key.startsWith('jpmap-backup-')).sort().reverse();
      for (const key of keys) {
        const option = document.createElement('option'); option.value = key;
        option.textContent = new Date(Number(key.split('-')[2])).toLocaleString('zh-CN'); select.append(option);
      }
      document.getElementById('cloudRestoreBtn').disabled = !keys.length;
      document.getElementById('cloudBackups').hidden = !keys.length;
    }
    button.addEventListener('click', () => { listBackups(); dialog.showModal(); action(() => {}); });
    document.getElementById('closeCloudBtn').addEventListener('click', () => dialog.close());
    form.addEventListener('submit', event => {
      event.preventDefault();
      const account = form.elements.account.value.trim(), password = form.elements.password.value;
      form.querySelector('button').disabled = true;
      action(async () => {
        const result = await auth.signInWithPassword(account.includes('@') ? { email: account, password } : { username: account, password });
        if (result.error) throw result.error;
        form.elements.password.value = '';
        const session = await auth.getSession();
        if (session.error) throw session.error;
        const id = session.data?.user?.id || session.data?.session?.user?.id || session.data?.session?.sub;
        await controller.connect(id);
      }).finally(() => { form.querySelector('button').disabled = false; });
    });
    document.getElementById('cloudRefreshBtn').addEventListener('click', () => action(() => restore()));
    document.getElementById('cloudLogoutBtn').addEventListener('click', () => action(async client => {
      const result = await auth.signOut(); if (result.error) throw result.error; client.disconnect();
    }));
    document.getElementById('cloudUseRemoteBtn').addEventListener('click', () => {
      if (confirm('使用云端行程替换当前设备的内容？替换前会在本机保存一份备份。')) action(client => client.chooseCloud());
    });
    document.getElementById('cloudUseLocalBtn').addEventListener('click', () => {
      if (confirm('上传当前设备的行程，并替换该账号云端的行程？原云端内容会先备份到本机。')) action(client => client.chooseLocal());
    });
    document.getElementById('cloudExportBtn').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify({ format: 'jpmap-backup-v1', exportedAt: new Date().toISOString(), payload: getSnapshot() }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = `jpmap-${new Date().toISOString().slice(0, 10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    function restoreLocal(payload) {
      validate(payload);
      if (!confirm('用备份替换本机行程？已登录时会继续同步到该账号。当前内容会先自动备份。')) return;
      localStorage.setItem(`jpmap-backup-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`, JSON.stringify(getSnapshot()));
      applySnapshot(clone(payload)); controller.changed(); listBackups();
    }
    document.getElementById('cloudImportBtn').addEventListener('click', () => document.getElementById('cloudImportFile').click());
    document.getElementById('cloudImportFile').addEventListener('change', async event => {
      try {
        const file = event.target.files[0]; if (!file) return;
        if (file.size > 2000000) throw new Error('备份文件过大');
        const data = JSON.parse(await file.text());
        if (data.format !== 'jpmap-backup-v1') throw new Error('这不是本网站导出的备份');
        restoreLocal(data.payload);
      } catch (error) { message.textContent = `导入失败：${error.message}`; }
      finally { event.target.value = ''; }
    });
    document.getElementById('cloudRestoreBtn').addEventListener('click', () => {
      try { restoreLocal(JSON.parse(localStorage.getItem(document.getElementById('cloudBackupSelect').value))); }
      catch (error) { message.textContent = `恢复失败：${error.message}`; }
    });
    window.addEventListener('online', () => { if (controller?.state().signedIn) controller.sync(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && controller?.state().signedIn) controller.sync(); });
    // Restore a previous SDK session on page load; no anonymous sign-in or upload fallback.
    if (config?.publishableKey) action(() => {});
    return { initialize };
  }
  const api = { createController, validate, mount };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.JP_CLOUD_SYNC = api;
})(typeof window === 'undefined' ? globalThis : window);
