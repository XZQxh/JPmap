(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.JP_APP_LINKS = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const PRESETS = {
    Agoda: { hosts: ['agoda.com', 'www.agoda.com', 'agoda.onelink.me'] },
    Klook: { hosts: ['klook.com', 'www.klook.com', 'klook.cn', 'www.klook.cn', 's.klook.cn', 'short.klook.cn', 'klook.onelink.me'] },
    HopeGoo: { hosts: ['hopegoo.com', 'www.hopegoo.com', 'app.hopegoo.com', 'hopegoo.go.link'], package: 'com.beyondtrip.hopegoo' },
    Tabelog: { hosts: ['tabelog.com', 's.tabelog.com', 'www.tabelog.com', 'tabelog.onelink.me', 'tabelog-tourists.onelink.me'] }
  };
  // Opaque short IDs are not activity IDs. This public alias was resolved through Klook's
  // own 301/302 responses, then confirmed against the destination's app URL metadata.
  // Unknown aliases require a full activity URL; do not guess or send them to a third-party resolver.
  const KLOOK_RESOLVED_LINKS = {
    's.klook.cn/c/E1_rePa5A3': 'https://www.klook.cn/zh-CN/activity/59360/',
    'short.klook.cn/links/c/E1_rePa5A3': 'https://www.klook.cn/zh-CN/activity/59360/'
  };
  // A user-supplied WeChat Short Link is a copyable code, not a browser URL Scheme.
  // Keep it as text; do not fabricate a weixin://dl/business token or a mini-program page path.
  const TABELOG_WECHAT_CODE = '#小程序://Tabelog/8sylmIHfFEnEQUe';
  function webUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password && !url.port ? url : null;
    } catch (_) { return null; }
  }
  function detectProvider(value) {
    const url = webUrl(value);
    if (!url) return '';
    if (['airbnb.com', 'www.airbnb.com', 'zh.airbnb.com'].includes(url.hostname)) return 'Airbnb';
    if (['ctrip.com', 'www.ctrip.com', 'm.ctrip.com'].includes(url.hostname)) return '携程';
    return Object.keys(PRESETS).find(key => PRESETS[key].hosts.includes(url.hostname)) || '';
  }
  function presetLaunch(provider, value, device) {
    const preset = PRESETS[provider], url = webUrl(value), platform = mobilePlatform(device);
    if (!preset || !url || !platform || url.hash || !preset.hosts.includes(url.hostname)) return null;
    if (provider === 'Tabelog') return { url: '', kind: 'wechat-code', code: TABELOG_WECHAT_CODE, home: true };
    // Official smart links sometimes already carry a native route. Use only the expected scheme.
    const native = url.searchParams.get('af_dp') || url.searchParams.get('deep_link_value');
    const allowedSchemes = { Agoda: ['agoda:'], Klook: ['klook:'] }[provider];
    if (native && allowedSchemes) {
      try {
        const route = new URL(native);
        if (allowedSchemes.includes(route.protocol) && route.host && !route.username && !route.password && !route.port && !route.hash) {
          // Bare native schemes use the installed handler and cannot trigger Chrome's
          // package-specific Intent -> Play Store fallback.
          return { url: route.href, kind: 'native', home: route.hostname === 'home' };
        }
      } catch (_) { /* Keep the original web link as the manual fallback. */ }
    }
    // Opaque smart-link paths cannot be reconstructed without a redirect service.
    if (url.hostname.endsWith('.onelink.me') || url.hostname === 'hopegoo.go.link') return null;
    if (provider === 'HopeGoo') return { url: 'hopegoo://web/home', kind: 'native', home: true };
    if (provider === 'Agoda') return { url: 'agoda://home/', kind: 'native', home: true };
    if (provider === 'Klook') {
      const resolved = KLOOK_RESOLVED_LINKS[url.hostname + url.pathname.replace(/\/$/, '')];
      const path = (resolved ? new URL(resolved).pathname : url.pathname).replace(/^\/(?:[a-z]{2}(?:-[A-Za-z]{2})?)\//, '/');
      const activityId = path.match(/^\/activity\/(\d+)(?:-|\/|$)/)?.[1];
      if (activityId) return { url: `klook://activity/${activityId}`, kind: 'native', home: false };
    }
    return null;
  }

  function mobilePlatform(device) {
    if (/Android/i.test(device.userAgent || '')) return 'android';
    if (/iPhone|iPad|iPod/i.test(device.userAgent || '') ||
        (device.platform === 'MacIntel' && device.maxTouchPoints > 1)) return 'ios';
    return '';
  }

  function googleAppUrl(value, device) {
    let url;
    try { url = new URL(value); } catch (_) { return ''; }
    if (url.origin !== 'https://www.google.com' || url.searchParams.get('api') !== '1' ||
        !['/maps/search/', '/maps/dir/'].includes(url.pathname)) return '';
    const platform = mobilePlatform(device);
    if (platform === 'android') {
      // A user-triggered, package-specific intent avoids a web redirect tab.
      // Do not set browser_fallback_url: opening the website is an explicit choice.
      return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=https;package=com.google.android.apps.maps;end`;
    }
    if (platform !== 'ios') return '';
    const app = new URL('comgooglemaps://');
    if (url.pathname === '/maps/search/') app.searchParams.set('q', url.searchParams.get('query') || '');
    else {
      app.searchParams.set('saddr', url.searchParams.get('origin') || '');
      app.searchParams.set('daddr', url.searchParams.get('destination') || '');
      app.searchParams.set('directionsmode', 'transit');
    }
    return app.href;
  }

  function appUrl(provider, value, device) {
    if (PRESETS[provider]) return presetLaunch(provider, value, device)?.url || '';
    if (provider === 'google') return googleAppUrl(value, device);
    const platform = mobilePlatform(device);
    if (!platform) return '';
    let url;
    try { url = new URL(value); } catch (_) { return ''; }
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return '';
    if (provider === 'Airbnb' && ['www.airbnb.com', 'zh.airbnb.com', 'airbnb.com'].includes(url.hostname) &&
        /^\/trips(?:\/v1(?:\/[a-zA-Z0-9_-]+)?)?\/?$/.test(url.pathname)) {
      if (platform === 'android') {
        // Use the associated canonical host and retain the original trip path/query.
        return `intent://www.airbnb.com${url.pathname}${url.search}#Intent;scheme=https;package=com.airbnb.android;end`;
      }
      // Keep an empty authority so the full web path is retained as the app route.
      return `airbnb://${url.pathname}${url.search}`;
    }
    // The saved Ctrip link is a homepage, not an order. Custom booking URLs remain web links.
    if (provider === '携程' && ['www.ctrip.com', 'ctrip.com'].includes(url.hostname) &&
        url.pathname === '/' && !url.search && !url.hash) return 'ctrip://wireless';
    return '';
  }

  function bind(doc, win) {
    let notice = null;
    function dismiss() { notice?.remove(); notice = null; }
    function offerWeChat(anchor, launch) {
      dismiss();
      notice = doc.createElement('div');
      notice.className = 'app-launch-notice wechat-notice';
      notice.setAttribute('role', 'region');
      notice.setAttribute('aria-label', 'Tabelog 微信小程序');
      const title = doc.createElement('strong');
      title.textContent = 'Tabelog 微信小程序';
      const instructions = doc.createElement('p');
      instructions.textContent = '先复制口令，再打开微信。可粘贴到“文件传输助手”发送给自己后打开，也可在微信搜索 Tabelog。此入口不保证直达原餐厅。';
      const code = doc.createElement('textarea');
      code.value = launch.code;
      code.readOnly = true;
      code.rows = 2;
      code.setAttribute('aria-label', 'Tabelog 小程序口令，可长按复制');
      const status = doc.createElement('span');
      status.className = 'wechat-copy-status';
      status.setAttribute('role', 'status');
      const copy = doc.createElement('button');
      copy.type = 'button';
      copy.textContent = '复制小程序口令';
      copy.addEventListener('click', async () => {
        let copied = false;
        try {
          if (win.navigator.clipboard?.writeText) {
            await win.navigator.clipboard.writeText(launch.code);
            copied = true;
          }
        } catch (_) { /* An unavailable clipboard still leaves selectable text. */ }
        if (!copied) {
          code.focus(); code.select();
          code.setSelectionRange(0, code.value.length);
          try { copied = !!doc.execCommand?.('copy'); } catch (_) { /* Select manually. */ }
        }
        status.textContent = copied ? '口令已复制，请切换微信使用。' : '请长按上方口令复制，再切换微信。';
      });
      const wechat = doc.createElement('a');
      wechat.textContent = '打开微信';
      wechat.href = 'weixin://';
      wechat.target = '_self';
      // This only opens WeChat itself; no paste, send or mini-program launch is automated.
      const web = doc.createElement('a');
      web.textContent = '查看原餐厅网页';
      web.href = anchor.href;
      web.target = '_blank';
      web.rel = 'noopener noreferrer';
      const close = doc.createElement('button');
      close.type = 'button'; close.textContent = '关闭';
      close.addEventListener('click', dismiss);
      notice.append(title, instructions, code, copy, wechat, web, close, status);
      (anchor.closest('dialog') || doc.body).append(notice);
    }
    function offerWebsite(anchor, provider, launch) {
      dismiss();
      notice = doc.createElement('div');
      notice.className = 'app-launch-notice';
      notice.setAttribute('role', 'status');
      const message = doc.createElement('span');
      const label = provider === 'google' ? 'Google 地图' : provider;
      message.textContent = launch?.unsupported ? `${label} 的这条链接暂不能直达 App，请改用完整活动页面链接。`
        : launch?.home ? `${label} 已尝试打开 App 首页；原页面可在网页版查看。` : `未打开 ${label} App？`;
      const web = doc.createElement('a');
      web.textContent = '打开网页版';
      web.href = anchor.href;
      web.target = '_blank';
      web.rel = 'noopener noreferrer';
      const close = doc.createElement('button');
      close.type = 'button';
      close.textContent = '关闭';
      close.addEventListener('click', dismiss);
      notice.append(message, web, close);
      // Keep the fallback usable when the place editor is a modal dialog.
      (anchor.closest('dialog') || doc.body).append(notice);
    }
    function onClick(event) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target.closest?.('a[data-app-link]');
      if (!anchor || anchor.hasAttribute('download')) return;
      const selectedProvider = anchor.dataset.appLink;
      const provider = !selectedProvider || selectedProvider === '其他' ? detectProvider(anchor.href) : selectedProvider;
      const launch = PRESETS[provider] ? presetLaunch(provider, anchor.href, win.navigator) : null;
      if (launch?.kind === 'wechat-code') {
        event.preventDefault();
        offerWeChat(anchor, launch);
        return;
      }
      const launchUrl = appUrl(provider, anchor.href, win.navigator);
      if (!launchUrl) {
        // Keep unresolved Klook links on the map rather than silently repeating the web handoff.
        if (provider === 'Klook' && mobilePlatform(win.navigator) && detectProvider(anchor.href) === 'Klook') {
          event.preventDefault();
          offerWebsite(anchor, provider, { unsupported: true });
        }
        return;
      }
      event.preventDefault();
      offerWebsite(anchor, provider, launch);
      // Keep this synchronous with the user's click; timers can lose launch permission.
      // An external scheme/intent leaves this document and its map state in place.
      try { win.location.assign(launchUrl); } catch (_) { /* The manual web link remains available. */ }
    }
    function onVisibility() { if (doc.hidden) dismiss(); }
    doc.addEventListener('click', onClick);
    doc.addEventListener('visibilitychange', onVisibility);
    win.addEventListener('pagehide', dismiss);
    return function () {
      dismiss();
      doc.removeEventListener('click', onClick);
      doc.removeEventListener('visibilitychange', onVisibility);
      win.removeEventListener('pagehide', dismiss);
    };
  }

  return { PRESETS, detectProvider, presetLaunch, mobilePlatform, googleAppUrl, appUrl, bind };
});
