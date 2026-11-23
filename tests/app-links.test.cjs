const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { mobilePlatform, googleAppUrl, appUrl, bind, detectProvider, presetLaunch } = require('../app-links.js');
const android = { userAgent: 'Mozilla/5.0 (Linux; Android 15) Chrome/130.0.0.0 Mobile Safari/537.36 EdgA/130.0.0.0' };
const iphone = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile/15E148 Safari/604.1' };
const desktop = { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/130.0.0.0' };
const search = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('大阪 大国3丁目4-16');
const directions = 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent('成田国際空港 第2ターミナル') + '&travelmode=transit&origin=35.7364%2C139.746';

test('Android Edge launches package-specific Maps intent without automatic web fallback', () => {
  const intent = googleAppUrl(directions, android);
  assert.equal(intent, directions.replace('https:', 'intent:') + '#Intent;scheme=https;package=com.google.android.apps.maps;end');
  assert.equal(intent.includes('browser_fallback_url'), false);
  assert.equal(googleAppUrl(search, android).includes('query=' + encodeURIComponent('大阪 大国3丁目4-16')), true);
});

test('iPhone Safari uses native search and transit parameters without losing the origin or terminal', () => {
  const place = new URL(googleAppUrl(search, iphone));
  assert.equal(place.protocol, 'comgooglemaps:');
  assert.equal(place.searchParams.get('q'), '大阪 大国3丁目4-16');
  const route = new URL(googleAppUrl(directions, iphone));
  assert.equal(route.searchParams.get('daddr'), '成田国際空港 第2ターミナル');
  assert.equal(route.searchParams.get('saddr'), '35.7364,139.746');
  assert.equal(route.searchParams.get('directionsmode'), 'transit');
  const current = new URL(googleAppUrl('https://www.google.com/maps/dir/?api=1&destination=35%2C139&travelmode=transit', iphone));
  assert.equal(current.searchParams.get('saddr'), '');
});

test('Airbnb preserves the trip path and Ctrip opens its app homepage on both mobile systems', () => {
  const url = 'https://zh.airbnb.com/trips/v1/example-trip?source=test';
  assert.equal(appUrl('Airbnb', url, android), 'intent://www.airbnb.com/trips/v1/example-trip?source=test#Intent;scheme=https;package=com.airbnb.android;end');
  assert.equal(appUrl('Airbnb', url, iphone), 'airbnb:///trips/v1/example-trip?source=test');
  for (const device of [android, iphone]) {
    assert.equal(appUrl('携程', 'https://www.ctrip.com/', device), 'ctrip://wireless');
    assert.equal(appUrl('携程', 'https://www.ctrip.com/custom-order', device), '');
    assert.equal(appUrl('Airbnb', 'https://zh.airbnb.com.evil.example/trips/v1/example', device), '');
    assert.equal(appUrl('Airbnb', 'https://www.airbnb.com:8443/trips', device), '');
    assert.equal(appUrl('Airbnb', 'https://www.airbnb.com/rooms/123', device), '');
    assert.equal(appUrl('unknown', url, device), '');
  }
});

test('desktop and unrelated URLs retain normal web behavior; iPad desktop mode is recognized', () => {
  assert.equal(googleAppUrl(search, desktop), '');
  assert.equal(appUrl('Airbnb', 'https://www.airbnb.com/trips', desktop), '');
  assert.equal(mobilePlatform({ userAgent: 'Macintosh', platform: 'MacIntel', maxTouchPoints: 5 }), 'ios');
  for (const url of ['javascript:alert(1)', 'https://www.google.com.evil.example/maps/search/?api=1', 'https://www.google.com/other?api=1', 'not a url']) {
    assert.equal(googleAppUrl(url, iphone), '');
  }
});

test('platform detection accepts exact official hosts and rejects lookalikes or embedded credentials', () => {
  for (const [provider, url] of [['Agoda', 'https://www.agoda.com/a/hotel/tokyo-jp.html'], ['Klook', 'https://www.klook.com/zh-CN/activity/123-example/'], ['HopeGoo', 'https://app.hopegoo.com/download/appdownload'], ['Tabelog', 'https://s.tabelog.com/tokyo/A1301/A130101/13002526/']]) {
    assert.equal(detectProvider(url), provider);
    assert.equal(detectProvider(url.replace(new URL(url).hostname, new URL(url).hostname + '.evil.example')), '');
    assert.equal(presetLaunch(provider, url, desktop), null);
    assert.equal(presetLaunch(provider, url.replace('https://', 'https://user:pass@'), iphone), null);
  }
});

test('Agoda native launch avoids the unresolved HTTPS Intent for both hotels and shared trips', () => {
  for (const device of [android, iphone]) {
    for (const url of ['https://www.agoda.com/a/hotel/tokyo-jp.html?cid=1&checkIn=2027-02-12', 'https://www.agoda.com/trips/shared/00000000-0000-4000-8000-000000000000']) {
      const result = presetLaunch('Agoda', url, device);
      assert.equal(result.url, 'agoda://home/');
      assert.equal(result.home, true);
      assert.equal(result.url.includes('intent:'), false);
      assert.equal(presetLaunch('Agoda', url + '#section', device), null);
    }
  }
  assert.equal(presetLaunch('Agoda', 'https://www.klook.com/', android), null);
});

test('Tabelog restaurant links offer the supplied WeChat code without retrying the failed native app route', () => {
  for (const lang of ['', 'cn/', 'en/', 'tw/', 'kr/', 'th/']) {
    const url = `https://tabelog.com/${lang}tokyo/A1301/A130101/13002526/?ref=test`;
    for (const device of [android, iphone]) {
      const launch = presetLaunch('Tabelog', url, device);
      assert.equal(launch.kind, 'wechat-code');
      assert.equal(launch.code, '#小程序://Tabelog/8sylmIHfFEnEQUe');
      assert.equal(appUrl('Tabelog', url, device), '');
    }
  }
  assert.equal(presetLaunch('Tabelog', 'https://tabelog.com/', iphone).kind, 'wechat-code');
  assert.equal(presetLaunch('Tabelog', 'https://s.tabelog.com/cn/', android).kind, 'wechat-code');
  assert.equal(presetLaunch('Tabelog', 'https://tabelog.com/', desktop), null);
});

test('Klook activity URLs and the resolved user-provided short link use the official native route', () => {
  for (const device of [android, iphone]) {
    for (const url of ['https://www.klook.com/zh-CN/activity/59360-example/?date=2027-02-13', 'https://www.klook.cn/zh-CN/activity/59360/', 'https://s.klook.cn/c/E1_rePa5A3', 'https://short.klook.cn/links/c/E1_rePa5A3']) {
      assert.deepEqual(presetLaunch('Klook', url, device), { url: 'klook://activity/59360', kind: 'native', home: false });
      assert.equal(detectProvider(url), 'Klook');
    }
    assert.equal(presetLaunch('Klook', 'https://s.klook.cn/c/unknown-short-code', device), null);
    assert.equal(presetLaunch('Klook', 'https://www.klook.com/zh-CN/activity/59360example/', device), null);
    assert.equal(presetLaunch('Klook', 'https://www.klook.com/zh-CN/blog/example', device), null);
  }
});

test('home launches are explicitly distinguished from detail routes', () => {
  for (const device of [android, iphone]) {
    assert.deepEqual(presetLaunch('HopeGoo', 'https://www.hopegoo.com/en-hk/hotel/hoteldetail?id=123', device), { url: 'hopegoo://web/home', kind: 'native', home: true });
  }
  assert.deepEqual(presetLaunch('Agoda', 'https://www.agoda.com/a/hotel/tokyo-jp.html', iphone), { url: 'agoda://home/', kind: 'native', home: true });
});

test('official smart links with an embedded native route open directly; opaque short links remain untouched', () => {
  const native = 'agoda://hotel/Example/12345?rooms=1';
  const link = 'https://agoda.onelink.me/1640755593?af_dp=' + encodeURIComponent(native);
  for (const device of [android, iphone]) {
    assert.equal(appUrl('Agoda', link, device), native);
    const klook = 'https://klook.onelink.me/example?af_dp=' + encodeURIComponent('klook://activity/59360');
    assert.equal(appUrl('Klook', klook, device), 'klook://activity/59360');
    const international = 'https://tabelog-tourists.onelink.me/3eEh?af_dp=' + encodeURIComponent('tabelog-tourists://rstdtl/13294162/top/');
    assert.equal(presetLaunch('Tabelog', international, device).kind, 'wechat-code');
    const japanese = 'https://tabelog.onelink.me/kcDZ?af_dp=' + encodeURIComponent('tabelog-v2://rstdtl/13294162/');
    assert.equal(presetLaunch('Tabelog', japanese, device).kind, 'wechat-code');
  }
  assert.equal(appUrl('Agoda', 'https://agoda.onelink.me/opaque', iphone), '');
  assert.equal(appUrl('Agoda', link.replace(encodeURIComponent(native), encodeURIComponent('javascript:alert(1)')), iphone), '');
  assert.equal(appUrl('Agoda', link.replace(encodeURIComponent(native), encodeURIComponent('klook://home/')), iphone), '');
});

function fixture(device = android, provider = 'google', href = search) {
  const listeners = {}, windowListeners = {}, notices = [], launches = [];
  function element(tag) {
    return { tag, children: [], listeners: {}, attributes: {}, setAttribute(name, value) { this.attributes[name] = value; },
      append(...children) { this.children.push(...children); },
      addEventListener(name, fn) { this.listeners[name] = fn; },
      focus() { this.focused = true; }, select() { this.selected = true; }, setSelectionRange() {},
      remove() { this.removed = true; } };
  }
  const body = { append(node) { notices.push(node); } };
  const doc = { body, hidden: false, createElement: element,
    addEventListener(name, fn) { listeners[name] = fn; },
    removeEventListener(name) { delete listeners[name]; } };
  const win = { navigator: device, location: { assign(url) { launches.push(url); } },
    addEventListener(name, fn) { windowListeners[name] = fn; },
    removeEventListener(name) { delete windowListeners[name]; } };
  const anchor = { href, dataset: { appLink: provider }, hasAttribute() { return false; }, closest() { return null; } };
  const click = overrides => {
    const event = { button: 0, target: { closest: () => anchor }, preventDefault() { this.defaultPrevented = true; }, ...overrides };
    listeners.click(event);
    return event;
  };
  return { doc, win, anchor, listeners, windowListeners, notices, launches, click };
}

test('mobile tap keeps the map document, offers a manual web link, and clears the notice on app switch', () => {
  const f = fixture();
  const cleanup = bind(f.doc, f.win);
  assert.equal(f.click().defaultPrevented, true);
  assert.equal(f.launches.length, 1);
  const [message, fallback, close] = f.notices[0].children;
  assert.match(message.textContent, /Google 地图/);
  assert.equal(fallback.href, search);
  assert.equal(fallback.target, '_blank');
  assert.equal(fallback.dataset, undefined);
  f.doc.hidden = true;
  f.listeners.visibilitychange();
  assert.equal(f.notices[0].removed, true);
  f.doc.hidden = false;
  f.listeners.visibilitychange();
  assert.equal(f.launches.length, 1);
  f.click();
  close.listeners.click();
  assert.equal(f.notices[1].removed, true);
  cleanup();
  assert.equal(Object.keys(f.listeners).length, 0);
  assert.equal(Object.keys(f.windowListeners).length, 0);
});

test('desktop, modified clicks, and manual fallback are not intercepted', () => {
  const desk = fixture(desktop);
  bind(desk.doc, desk.win);
  assert.equal(desk.click().defaultPrevented, undefined);
  assert.equal(desk.launches.length, 0);
  const f = fixture();
  bind(f.doc, f.win);
  for (const overrides of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }, { defaultPrevented: true }, { target: { closest: () => null } }]) f.click(overrides);
  assert.equal(f.launches.length, 0);
  assert.equal(f.notices.length, 0);
});

test('blocked launch retains fallback, repeated clicks replace it, and editor fallback stays inside its dialog', () => {
  const f = fixture(iphone, 'Airbnb', 'https://zh.airbnb.com/trips/v1/example-trip');
  const dialog = { append(node) { f.notices.push(node); } };
  f.anchor.closest = () => dialog;
  f.doc.body.append = () => assert.fail('modal fallback must be inside the dialog');
  f.win.location.assign = () => { throw new Error('blocked'); };
  bind(f.doc, f.win);
  assert.doesNotThrow(() => f.click());
  assert.equal(f.notices[0].children[0].textContent, '未打开 Airbnb App？');
  f.click();
  assert.equal(f.notices[0].removed, true);
  assert.equal(f.notices[1].children[1].href, f.anchor.href);
  f.windowListeners.pagehide();
  assert.equal(f.notices[1].removed, true);
});

test('Klook native launches prevent web handoff and home launches retain the original web fallback', () => {
  const klook = fixture(iphone, 'Klook', 'https://www.klook.com/zh-CN/activity/123-example/');
  bind(klook.doc, klook.win);
  assert.equal(klook.click().defaultPrevented, true);
  assert.deepEqual(klook.launches, ['klook://activity/123']);
  assert.equal(klook.notices[0].children[1].href, klook.anchor.href);
  const hopegoo = fixture(iphone, 'HopeGoo', 'https://www.hopegoo.com/en-hk/hotel/hoteldetail?id=123');
  bind(hopegoo.doc, hopegoo.win);
  assert.equal(hopegoo.click().defaultPrevented, true);
  assert.deepEqual(hopegoo.launches, ['hopegoo://web/home']);
  assert.match(hopegoo.notices[0].children[0].textContent, /App 首页/);
  assert.equal(hopegoo.notices[0].children[1].href, hopegoo.anchor.href);
});

test('Android failures leave manual fallback on the map without a package Intent or Play Store redirect', () => {
  for (const [provider, href, expected] of [['Agoda', 'https://www.agoda.com/trips/shared/example', 'agoda://home/'], ['Klook', 'https://s.klook.cn/c/E1_rePa5A3', 'klook://activity/59360']]) {
    const f = fixture(android, provider, href);
    let attempted;
    f.win.location.assign = url => { attempted = url; throw new Error('no installed handler'); };
    bind(f.doc, f.win);
    assert.equal(f.click().defaultPrevented, true);
    assert.equal(attempted, expected);
    assert.equal(attempted.includes('intent:'), false);
    assert.equal(attempted.includes('play.google.com'), false);
    assert.equal(f.notices[0].children[1].href, href);
  }
});

test('Tabelog mobile tap keeps the map open and offers copy code, WeChat and the original restaurant', async () => {
  const f = fixture(android, 'Tabelog', 'https://s.tabelog.com/cn/tokyo/A1301/A130103/13294162/');
  let copied;
  f.win.navigator = { ...android, clipboard: { writeText: async value => { copied = value; } } };
  bind(f.doc, f.win);
  assert.equal(f.click().defaultPrevented, true);
  assert.equal(f.launches.length, 0);
  const panel = f.notices[0];
  assert.equal(panel.attributes.role, 'region');
  assert.equal(panel.attributes['aria-label'], 'Tabelog 微信小程序');
  const code = panel.children.find(child => child.tag === 'textarea');
  assert.equal(code.value, '#小程序://Tabelog/8sylmIHfFEnEQUe');
  assert.equal(code.readOnly, true);
  const copy = panel.children.find(child => child.textContent === '复制小程序口令');
  await copy.listeners.click();
  assert.equal(copied, code.value);
  assert.equal(f.launches.length, 0, 'copying must not automatically open an app or send a message');
  assert.match(panel.children.find(child => child.className === 'wechat-copy-status').textContent, /已复制/);
  const wechat = panel.children.find(child => child.textContent === '打开微信');
  assert.equal(wechat.href, 'weixin://');
  assert.equal(wechat.target, '_self');
  assert.equal(wechat.dataset, undefined);
  const original = panel.children.find(child => child.textContent === '查看原餐厅网页');
  assert.equal(original.href, f.anchor.href);
  f.doc.hidden = true; f.listeners.visibilitychange();
  assert.equal(panel.removed, true);
});

test('WeChat code remains selectable when clipboard is denied, with a synchronous copy fallback', async () => {
  const f = fixture(iphone, 'Tabelog', 'https://tabelog.com/cn/');
  f.win.navigator = { ...iphone, clipboard: { writeText: async () => { throw new Error('denied'); } } };
  bind(f.doc, f.win); f.click();
  const panel = f.notices[0];
  const copy = panel.children.find(child => child.textContent === '复制小程序口令');
  const code = panel.children.find(child => child.tag === 'textarea');
  const status = panel.children.find(child => child.className === 'wechat-copy-status');
  await copy.listeners.click();
  assert.equal(code.selected, true);
  assert.match(status.textContent, /长按/);
  f.doc.execCommand = name => name === 'copy';
  await copy.listeners.click();
  assert.match(status.textContent, /已复制/);
  assert.equal(f.launches.length, 0);
});

test('unresolved Klook short links offer an explicit web choice instead of navigating automatically', () => {
  const f = fixture(android, 'Klook', 'https://s.klook.cn/c/unknown-short-code');
  bind(f.doc, f.win);
  assert.equal(f.click().defaultPrevented, true);
  assert.equal(f.launches.length, 0);
  assert.match(f.notices[0].children[0].textContent, /完整活动页面链接/);
  assert.equal(f.notices[0].children[1].href, f.anchor.href);
  const desk = fixture(desktop, 'Klook', f.anchor.href);
  bind(desk.doc, desk.win);
  assert.equal(desk.click().defaultPrevented, undefined);
});

test('previously saved unrecognized Klook links are detected without editing the itinerary again', () => {
  for (const provider of ['', '其他']) {
    const f = fixture(android, provider, 'https://s.klook.cn/c/E1_rePa5A3');
    bind(f.doc, f.win);
    assert.equal(f.click().defaultPrevented, true);
    assert.deepEqual(f.launches, ['klook://activity/59360']);
  }
});

test('all Maps entry points and booking links opt in, and the launcher is served and packaged', () => {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /id="editorMapDetails" data-app-link="google"/);
  for (const name of ['navLink', 'placeDetailsLink']) {
    const body = html.slice(html.indexOf(`function ${name}(`)).split('\n    }')[0];
    assert.match(body, /data-app-link="google"/);
  }
  assert.match(html, /data-app-link="\$\{escapeHtml\(provider\)\}/);
  assert.match(html, /<script src="app-links\.js\?v=20261123-wechat-3"><\/script>/);
  assert.match(html, /JP_APP_LINKS\?\.bind\(document, window\)/);
  assert.match(fs.readFileSync(path.join(root, 'server.js'), 'utf8'), /publicFiles\['\/app-links.js'\]/);
  assert.match(fs.readFileSync(path.join(root, 'scripts/build-pages.cjs'), 'utf8'), /'app-links.js'/);
});
