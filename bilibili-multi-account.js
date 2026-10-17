// ==UserScript==
// @name         Bilibili Multi-Account
// @namespace    piliplus.local.multi-account
// @version      1.5.10
// @description  支持密码、短信、二维码登录，按主账号、记录观看、推荐和视频取流分别选择 B 站账号。
// @match        https://*.bilibili.com/*
// @match        https://bilibili.com/*
// @exclude      https://passport.bilibili.com/*
// @run-at       document-start
// @sandbox      raw
// @grant        unsafeWindow
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @connect      api.bilibili.com
// @connect      api.live.bilibili.com
// @connect      api.vc.bilibili.com
// @connect      app.bilibili.com
// @connect      www.bilibili.com
// @connect      s.search.bilibili.com
// @connect      passport.bilibili.com
// @license      GPL-3.0-only
// ==/UserScript==

/*
 * Browser adaptation of PiliPlus's Accounts, AccountType and ApiType model.
 * Source references and limitations: README.md in this directory.
 * Credentials stay in userscript storage; never export them to the page.
 */
(() => {
  'use strict';
  const page = unsafeWindow;
  const KEY = 'piliplus-web-accounts-v1';
  const ROLES = { main: '主账号', heartbeat: '记录观看', recommend: '推荐', video: '视频取流' };
  const HOSTS = new Set(['api.bilibili.com', 'api.live.bilibili.com', 'api.vc.bilibili.com',
    'app.bilibili.com', 'www.bilibili.com', 's.search.bilibili.com']);
  const GROUPS = {
    heartbeat: new Set([
      '/x/web-interface/wbi/view', '/x/web-interface/view', '/x/web-interface/view/detail',
      '/x/v2/reply', '/x/v2/reply/main', '/x/v2/reply/wbi/main', '/x/v2/reply/reply',
      '/x/click-interface/web/heartbeat', '/x/click-interface/click/web/h5',
      '/x/v2/history/report', '/x/v1/medialist/history',
      '/x/player/pagelist', '/x/player/online/total', '/x/polymer/web-dynamic/v1/detail',
      '/x/web-interface/view/conclusion/get', '/x/polymer/web-space/seasons_archives_list',
      '/x/series/archives',
      '/xlive/web-room/v1/index/roomEntryAction',
      '/xlive/app-ucenter/v1/like_info_v3/like/likeReportV3',
      '/xlive/web-room/v2/index/getRoomPlayInfo', '/xlive/web-room/v1/index/getH5InfoByRoom',
      '/xlive/web-room/v1/index/getDanmuInfo', '/xlive/web-room/v1/dM/gethistory',
      '/av/v1/SuperChat/getMessageList', '/xlive/web-room/v1/index/getInfoByUser',
    ]),
    recommend: new Set([
      '/x/web-interface/wbi/index/top/feed/rcmd', '/x/web-interface/index/top/feed/rcmd',
      '/x/v2/feed/index', '/x/feed/dislike', '/x/feed/dislike/cancel',
      '/x/web-interface/popular', '/x/web-interface/archive/related',
      '/xlive/web-interface/v1/second/getUserRecommend', '/x/v2/search/trending/ranking',
      '/x/v2/search/recommend', '/x/web-interface/ranking/v2', '/pgc/web/rank/list',
      '/pgc/season/rank/web/list', '/pgc/season/index/result',
      '/x/web-interface/popular/series/one', '/x/web-interface/popular/series/list',
      '/x/web-interface/popular/precious', '/xlive/app-interface/v2/index/getAreaList',
      '/xlive/app-interface/v2/index/feed', '/xlive/app-interface/v2/second/getList',
      '/room/v1/Area/getList', '/x/copyright-music-publicity/bgm/recommend_list',
      '/x/topic/web/dynamic/rcmd', '/x/polymer/web-dynamic/v1/feed/topic',
      '/x/topic/web/details/top', '/xlive/app-interface/v2/index/feedback', '/main/hotword',
      '/x/web-interface/wbi/search/default', '/x/web-interface/search/default',
      '/x/web-interface/suggest', '/x/web-interface/wbi/search/type',
      '/x/web-interface/search/type', '/x/web-interface/wbi/search/all/v2',
      '/x/web-interface/search/all/v2', '/x/polymer/web-dynamic/v1/feed/space/search',
      '/x/space/wbi/arc/search', '/xlive/app-interface/v2/search_live',
    ]),
    video: new Set([
      '/x/player/wbi/playurl', '/x/player/playurl', '/pgc/player/web/v2/playurl',
      '/pgc/player/web/playurl', '/pugv/player/web/playurl', '/ogv/player/playview',
      '/x/tv/playurl', '/x/player/videoshot', '/x/player/v2', '/x/player/wbi/v2',
      '/pgc/view/web/season', '/pgc/view/web/season/user/status',
      '/pgc/view/web/season/user/section', '/pugv/view/web/season',
    ]),
  };
  const REPORTS = new Set(['/x/click-interface/web/heartbeat', '/x/click-interface/click/web/h5',
    '/x/v2/history/report', '/x/v1/medialist/history', '/xlive/web-room/v1/index/roomEntryAction',
    '/xlive/app-ucenter/v1/like_info_v3/like/likeReportV3']);
  const defaults = () => ({ version: 1, enabled: false, accounts: [],
    roles: { main: 'browser', heartbeat: 'browser', recommend: 'browser', video: 'browser' } });
  let state = load();
  let host, shadow, dialog, statusBox, browserStatusBox, refreshAccountChoices;
  let noticeTimer = null;
  let accountMenu = null;
  let loginMethod = 'qrcode';
  let disposeLogin = null;
  let smsCooldownUntil = 0;
  let LoginRSA, LoginQR;
  let browserLabels = [];
  let browserIdentity = { status: 'loading', mid: '', name: '' };
  let browserReadPromise;
  let profileRefreshPromise;
  const profileAttempts = new Map();
  let panelDraft = null;
  let panelEnabled = null;
  let panelAddingAccount = false;
  const pendingPlayerRefresh = new WeakMap();
  const nativeFetch = page.fetch;
  const nativeBeacon = page.navigator.sendBeacon;
  const playbackBootstraps = new Map();
  const trustedPlaybackData = new WeakSet();
  const PLAYER_INFO = new Set(['/x/player/v2', '/x/player/wbi/v2']);

  function load() {
    try {
      const value = GM_getValue(KEY, null);
      return value ? validateState(value) : defaults();
    } catch (_) { return defaults(); }
  }
  function cookiesFrom(input) {
    if (typeof input === 'string') {
      const text = input.trim();
      if (text.startsWith('{') || text.startsWith('[')) return cookiesFrom(JSON.parse(text));
      input = Object.fromEntries(text.replace(/^cookie\s*:\s*/i, '').split(';')
        .filter(s => s.includes('=')).map(s => {
          const i = s.indexOf('='); return [s.slice(0, i).trim(), s.slice(i + 1).trim()];
        }));
    }
    if (Array.isArray(input)) input = Object.fromEntries(input.map(c => [c.name, c.value]));
    if (input && typeof input === 'object' && input.cookies) return cookiesFrom(input.cookies);
    if (!input || typeof input !== 'object') throw new Error('请输入 Cookie 或含 cookies 字段的 JSON');
    const result = Object.create(null);
    for (const [name, raw] of Object.entries(input)) {
      // Device / risk cookies are allowed, but browser account tickets are deliberately excluded.
      if (!/^[A-Za-z0-9_\-]+$/.test(name) || /^(?:bili_ticket|access_key|refresh_token)$/.test(name)) continue;
      if (typeof raw !== 'string' || /[;\r\n\x00]/.test(raw)) continue;
      result[name] = raw;
    }
    if (!result.SESSDATA || !/^\d+$/.test(result.DedeUserID || '') || !result.bili_jct) {
      throw new Error('缺少 SESSDATA、DedeUserID 或 bili_jct。SESSDATA 若不可读取，请手动粘贴。');
    }
    return result;
  }
  function accountsFrom(raw, name = '') {
    let input = raw;
    if (typeof input === 'string' && /^[\[{]/.test(input.trim())) input = JSON.parse(input.trim());
    const roles = {};
    const accounts = [];
    const roleKeys = Object.keys(ROLES);
    function append(entry, expectedMid) {
      const cookies = cookiesFrom(entry);
      const mid = cookies.DedeUserID;
      if (mid === '0' || (expectedMid !== undefined && String(expectedMid) !== mid)) {
        throw new Error('导入的 UID 键与 Cookie 中的 DedeUserID 不一致');
      }
      if (accounts.some(a => a.mid === mid)) throw new Error('导入内容含重复 UID');
      accounts.push({ mid, name: String(name.trim() || entry?.name || mid).slice(0, 80), cookies });
      if (entry && typeof entry === 'object' && Object.hasOwn(entry, 'type')) {
        if (!Array.isArray(entry.type)) throw new Error(`账号 ${mid} 的 type 必须是数组`);
        for (const type of entry.type) {
          if (!Number.isInteger(type) || type < 0 || type >= roleKeys.length) throw new Error(`账号 ${mid} 的 type 无效`);
          const role = roleKeys[type];
          if (roles[role] && roles[role] !== mid) throw new Error(`多个账号同时分配了“${ROLES[role]}”`);
          roles[role] = mid;
        }
      }
    }
    if (input && typeof input === 'object' && !Array.isArray(input)
      && input.version === 1 && Array.isArray(input.accounts)) {
      const backup = validateState(input);
      return { accounts: backup.accounts, roles: backup.roles };
    }
    if (input && typeof input === 'object' && !Array.isArray(input) && !input.cookies && !input.SESSDATA) {
      const entries = Object.entries(input);
      if (!entries.length || !entries.every(([key, value]) => /^\d+$/.test(key) && value?.cookies)) {
        throw new Error('JSON 应为单账号、Cookie 对象或以 UID 为键的多账号对象');
      }
      for (const [mid, entry] of entries) append(entry, mid);
    } else if (Array.isArray(input) && input.some(entry => entry?.cookies)) {
      for (const entry of input) append(entry);
    } else append(input);
    return { accounts, roles };
  }
  function validateState(value) {
    if (!value || value.version !== 1 || !Array.isArray(value.accounts)) throw new Error('备份格式不支持');
    const next = defaults();
    next.enabled = value.enabled === true;
    next.accounts = value.accounts.map(a => {
      const cookies = cookiesFrom(a.cookies);
      const mid = cookies.DedeUserID;
      if (String(a.mid) !== mid || mid === '0') throw new Error('账号 UID 与 Cookie 不一致');
      return { mid, name: String(a.name || mid).slice(0, 80), cookies,
        username: typeof a.username === 'string' ? a.username.slice(0, 80) : '',
        face: safeAvatar(a.face), vip: a.vip === true };
    });
    if (new Set(next.accounts.map(a => a.mid)).size !== next.accounts.length) throw new Error('有重复 UID');
    for (const role of Object.keys(ROLES)) {
      const mid = String(value.roles?.[role] ?? '0');
      if (mid !== '0' && mid !== 'browser' && !next.accounts.some(a => a.mid === mid)) throw new Error('用途引用了不存在的账号');
      next.roles[role] = mid;
    }
    return next;
  }
  function save() { GM_setValue(KEY, state); }
  function currentBrowserMid() {
    if (browserIdentity.status === 'loggedOut') return '';
    return browserIdentity.mid || /(?:^|;\s*)DedeUserID=(\d+)(?:;|$)/.exec(document.cookie)?.[1] || '';
  }
  function browserLabel() {
    if (browserIdentity.name) return browserIdentity.name;
    if (browserIdentity.status === 'loading') return '读取中…';
    if (browserIdentity.status === 'loggedOut') return '未登录';
    return '浏览器账号';
  }
  function safeAvatar(value) {
    try {
      const url = new URL(String(value || '').replace(/^\/\//, 'https://'));
      return url.protocol === 'https:' && !url.username && !url.password && /(?:^|\.)(?:hdslb|biliimg)\.com$/.test(url.hostname) ? url.href : '';
    } catch (_) { return ''; }
  }
  function displayName(mid) {
    if (mid === '0') return '匿名';
    if (mid === 'browser' || mid === currentBrowserMid()) return browserLabel();
    const account = state.accounts.find(a => a.mid === mid);
    if (account?.username) return account.username;
    if (account?.name && !/^\d+$/.test(account.name)) return account.name;
    return profileAttempts.get(mid) === 'failed' ? '未命名账号' : '读取中…';
  }
  function accountFace(mid) {
    return mid === 'browser' || mid === currentBrowserMid() ? safeAvatar(browserIdentity.face)
      : state.accounts.find(a => a.mid === mid)?.face || '';
  }
  function saveProfile(mid, data) {
    const account = state.accounts.find(a => a.mid === mid);
    if (!account) return;
    account.username = String(data.uname || '').slice(0, 80);
    account.face = safeAvatar(data.face);
    account.vip = Number(data.vipStatus ?? data.vip?.status) === 1;
  }
  function refreshAccountProfiles(force = false) {
    if (profileRefreshPromise) return profileRefreshPromise;
    const work = state.accounts.filter(a => force || (!a.username && !profileAttempts.has(a.mid)));
    profileRefreshPromise = Promise.allSettled(work.map(async account => {
      profileAttempts.set(account.mid, 'loading');
      try {
        const data = account.mid === currentBrowserMid() && browserIdentity.status === 'loggedIn'
          ? { uname: browserIdentity.name, face: browserIdentity.face, vipStatus: browserIdentity.vip ? 1 : 0 }
          : await verify(account);
        const current = state.accounts.find(a => a.mid === account.mid);
        if (current && current.cookies.SESSDATA === account.cookies.SESSDATA) saveProfile(account.mid, data);
        profileAttempts.set(account.mid, 'done');
      } catch (_) { profileAttempts.set(account.mid, 'failed'); }
    })).then(() => {
      if (work.length) save();
      refreshAccountChoices?.();
    }).finally(() => { profileRefreshPromise = null; });
    return profileRefreshPromise;
  }
  function updateBrowserInfo() {
    refreshAccountChoices?.();
    for (const node of browserLabels) node.textContent = browserLabel();
    if (browserStatusBox) browserStatusBox.textContent = browserIdentity.status === 'loggedIn'
      ? browserLabel() : browserIdentity.status === 'loggedOut' ? '未登录'
        : browserIdentity.status === 'loading' ? '读取中…' : '浏览器账号';
  }
  function detectBrowserAccount() {
    if (browserReadPromise) return browserReadPromise;
    browserIdentity = { status: 'loading', mid: currentBrowserMid(), name: browserIdentity.name }; updateBrowserInfo();
    browserReadPromise = (async () => {
      // Use the captured native fetch, never the per-role account transport.
      // This reads the real browser session even when another main account is selected.
      const controller = new page.AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      try {
        const response = await nativeFetch.call(page, 'https://api.bilibili.com/x/web-interface/nav',
          { credentials: 'include', cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('浏览器账号识别失败');
        const data = await response.json();
        if (data.code === -101 || (data.code === 0 && data.data?.isLogin === false)) {
          browserIdentity = { status: 'loggedOut', mid: '', name: '' };
        } else if (data.code === 0 && data.data?.isLogin && /^\d+$/.test(String(data.data.mid))) {
          browserIdentity = { status: 'loggedIn', mid: String(data.data.mid), name: String(data.data.uname || ''),
            face: safeAvatar(data.data.face), vip: Number(data.data.vipStatus ?? data.data.vip?.status) === 1 };
        } else throw new Error('浏览器账号识别失败');
      } catch (_) { browserIdentity = { status: 'error', mid: '', name: '' }; }
      finally { clearTimeout(timer); updateBrowserInfo(); }
      return browserIdentity;
    })().finally(() => { browserReadPromise = null; });
    return browserReadPromise;
  }
  GM_addValueChangeListener(KEY, (_key, _old, value, remote) => {
    if (remote) {
      try { state = validateState(value); notice('其他标签页已更新设置；刷新页面可更新首屏。'); }
      catch (_) { /* Keep last valid state. */ }
    }
  });
  function classify(input) {
    let url;
    try { url = new URL(String(input), page.location.href); } catch (_) { return null; }
    if (url.protocol !== 'https:' || url.port || url.username || url.password || !HOSTS.has(url.hostname)) return null;
    if (/\/(?:login|logout|passport|oauth|qrcode|cookie|captcha|sms)(?:\/|$)/i.test(url.pathname)) return null;
    const path = url.pathname.replace(/\/$/, '');
    let role = Object.keys(GROUPS).find(k => GROUPS[k].has(path));
    if (!role && /^\/(?:x|pgc|pugv|ogv|xlive|room|av)\//.test(path)) role = 'main';
    if (!role) return null;
    return { url, path, role };
  }
  function target(input) {
    if (!state.enabled) return null;
    const route = classify(input);
    if (!route) return null;
    const mid = state.roles[route.role];
    if (mid === 'browser') {
      return null;
    }
    const account = mid === '0' ? null : state.accounts.find(a => a.mid === mid);
    if (mid !== '0' && !account) throw new Error('用途账号不存在，请重新配置');
    return { ...route, mid, account };
  }
  function replaceCSRF(body, headers, csrf) {
    if (body == null) return body;
    if (body instanceof page.FormData || body instanceof FormData) {
      const copy = new FormData();
      for (const [k, v] of body.entries()) copy.append(k, /^(csrf|csrf_token)$/.test(k) ? csrf : v);
      return copy;
    }
    if (body instanceof page.URLSearchParams || body instanceof URLSearchParams) {
      body = body.toString();
      if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/x-www-form-urlencoded;charset=UTF-8');
    }
    if (typeof body === 'string') {
      const contentType = headers.get('Content-Type') || '';
      if (contentType.includes('application/json')) {
        const data = JSON.parse(body);
        if (data && typeof data === 'object' && !Array.isArray(data)) {
          for (const k of ['csrf', 'csrf_token']) if (Object.hasOwn(data, k)) data[k] = csrf;
        }
        return JSON.stringify(data);
      }
      if (contentType.includes('application/x-www-form-urlencoded') || /(?:^|&)(?:csrf|csrf_token)=/.test(body)) {
        const params = new URLSearchParams(body);
        for (const k of ['csrf', 'csrf_token']) if (params.has(k)) params.set(k, csrf);
        return params.toString();
      }
    }
    return body;
  }
  function md5(text) {
    const input = new TextEncoder().encode(text);
    const bytes = new Uint8Array(Math.ceil((input.length + 9) / 64) * 64);
    bytes.set(input); bytes[input.length] = 128;
    const view = new DataView(bytes.buffer);
    view.setUint32(bytes.length - 8, (input.length * 8) >>> 0, true);
    view.setUint32(bytes.length - 4, Math.floor(input.length / 0x20000000), true);
    const shifts = [[7, 12, 17, 22], [5, 9, 14, 20], [4, 11, 16, 23], [6, 10, 15, 21]];
    const sum = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];
    for (let offset = 0; offset < bytes.length; offset += 64) {
      let [a, b, c, d] = sum;
      for (let i = 0; i < 64; i++) {
        const round = i >>> 4;
        const f = round === 0 ? (b & c) | (~b & d) : round === 1 ? (d & b) | (~d & c)
          : round === 2 ? b ^ c ^ d : c ^ (b | ~d);
        const g = round === 0 ? i : round === 1 ? (5 * i + 1) % 16 : round === 2 ? (3 * i + 5) % 16 : (7 * i) % 16;
        const k = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000);
        const x = (a + f + k + view.getUint32(offset + g * 4, true)) | 0;
        const shift = shifts[round][i % 4];
        [a, b, c, d] = [d, (b + ((x << shift) | (x >>> (32 - shift)))) | 0, b, c];
      }
      sum[0] = (sum[0] + a) | 0; sum[1] = (sum[1] + b) | 0;
      sum[2] = (sum[2] + c) | 0; sum[3] = (sum[3] + d) | 0;
    }
    return sum.map(n => [0, 8, 16, 24].map(s => ((n >>> s) & 255).toString(16).padStart(2, '0')).join('')).join('');
  }
  let wbiKeys;
  async function wbiKey() {
    if (!wbiKeys || Date.now() - wbiKeys.time > 3600000) {
      wbiKeys = { time: Date.now(), promise: nativeFetch.call(page,
        'https://api.bilibili.com/x/web-interface/nav', { credentials: 'include', cache: 'no-store', signal: page.AbortSignal.timeout(10000) })
        .then(r => r.json()).then(data => {
          const images = data.data?.wbi_img;
          const key = [images?.img_url, images?.sub_url].map(url =>
            String(url || '').split('/').pop().split('.')[0]).join('');
          if (key.length !== 64) throw new Error('无法取得 WBI 签名信息');
          // Same permutation as lib/utils/wbi_sign.dart.
          return [46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13]
            .map(i => key[i]).join('');
        }).catch(error => { wbiKeys = null; throw error; }) };
    }
    return wbiKeys.promise;
  }
  async function prepareRoute(route) {
    const url = new URL(route.url.href);
    const csrf = route.account?.cookies.bili_jct || '';
    let changed = false;
    for (const key of ['access_key', 'refresh_token']) if (url.searchParams.has(key)) {
      url.searchParams.delete(key); changed = true;
    }
    for (const key of ['csrf', 'csrf_token']) {
      if (url.searchParams.has(key) && url.searchParams.get(key) !== csrf) {
        url.searchParams.set(key, csrf); changed = true;
      }
    }
    if (changed && url.searchParams.has('w_rid')) {
      const key = await wbiKey();
      url.searchParams.delete('w_rid');
      url.searchParams.set('wts', String(Math.floor(Date.now() / 1000)));
      const entries = [...url.searchParams].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
      const query = entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v.replace(/[!'()*]/g, ''))}`).join('&');
      url.search = `${query}&w_rid=${md5(query + key)}`;
    }
    return { ...route, url };
  }
  function transport(route, options = {}) {
    const requests = [];
    const controller = new page.AbortController();
    let cancelled = false, timedOut = false;
    const timer = setTimeout(() => { timedOut = true; abort(); }, options.timeout || 30000);
    const abort = () => { cancelled = true; controller.abort(); for (const task of requests) task.abort(); };
    const promise = (async () => {
      const prepared = await prepareRoute(route);
      if (cancelled) throw new DOMException('请求已取消', 'AbortError');
      const task = rawTransport(prepared, options); requests.push(task);
      const result = await task.promise;
      // Player permission / subtitle metadata comes from the video account;
      // keep resume position attached to the heartbeat account.
      if (PLAYER_INFO.has(route.path) && state.roles.heartbeat !== route.mid && result.status === 200) {
        let payload;
        try { payload = JSON.parse(new TextDecoder().decode(result.response)); } catch (_) { return result; }
        if (payload.code !== 0 || !payload.data) return result;
        const mid = state.roles.heartbeat;
        let progress;
        try {
          if (mid === 'browser') {
            const r = await nativeFetch.call(page, route.url.href, { method: 'GET', credentials: 'include', signal: controller.signal });
            const value = await r.json(); if (r.ok && value.code === 0) progress = value.data;
          } else if (mid !== '0') {
            const account = state.accounts.find(a => a.mid === mid);
            if (account) {
              const r = rawTransport(await prepareRoute({ ...route, role: 'heartbeat', mid, account }), options);
              if (cancelled) { r.abort(); throw new DOMException('请求已取消', 'AbortError'); }
              requests.push(r);
              const response = await r.promise;
              const value = JSON.parse(new TextDecoder().decode(response.response));
              if (value.code === 0) progress = value.data;
            }
          }
        } catch (_) { /* Don't substitute the video account's private resume position. */ }
        payload.data.last_play_time = progress?.last_play_time || 0;
        payload.data.last_play_cid = progress?.last_play_cid || 0;
        // Tampermonkey exposes response through a getter-only property. Never
        // mutate its callback result when combining another account's progress.
        if (cancelled) throw new DOMException('请求已取消', 'AbortError');
        return { ...result, response: new TextEncoder().encode(JSON.stringify(payload)).buffer };
      }
      if (cancelled) throw new DOMException('请求已取消', 'AbortError');
      return result;
    })().catch(error => {
      if (timedOut) throw new DOMException('请求超时', 'TimeoutError');
      throw error;
    }).finally(() => clearTimeout(timer));
    return { promise, abort };
  }
  // Always omit the browser jar. Explicit cookie + anonymous is intentional:
  // credentials must never fall back to the currently logged-in website account.
  function rawTransport(route, options = {}) {
    let cancel;
    const promise = new Promise((resolve, reject) => {
      if (!route.account && REPORTS.has(route.path)) {
        resolve({ status: 200, statusText: 'OK', responseHeaders: 'Content-Type: application/json\r\n',
          response: new TextEncoder().encode('{"code":0,"message":"0","data":null}').buffer,
          finalUrl: route.url.href });
        return;
      }
      const headers = new Headers(options.headers || {});
      const csrf = route.account?.cookies.bili_jct || '';
      const data = replaceCSRF(options.body, headers, csrf);
      const url = new URL(route.url.href);
      const outgoing = {};
      for (const [k, v] of headers) {
        if (!/^(?:cookie|host|origin|referer|authorization|proxy-authorization|content-length|user-agent|sec-.+|x-bili-.+)$/i.test(k)) {
          outgoing[k] = /^(?:x-csrf-token|x-csrf)$/i.test(k) ? csrf : v;
        }
      }
      outgoing.Referer = page.location.href.split('#')[0];
      const cookie = route.account ? Object.entries(route.account.cookies)
        .filter(([k]) => !/^bili_ticket/.test(k)).map(([k, v]) => `${k}=${v}`).join('; ') : '';
      let settled = false;
      let handle;
      const timer = setTimeout(() => {
        if (settled) return;
        finish(false, new DOMException('请求超时', 'TimeoutError'));
        handle?.abort();
      }, options.timeout || 30000);
      const finish = (ok, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (ok) {
          let finalUrl;
          try { finalUrl = new URL(value.finalUrl || url.href); } catch (_) {
            reject(new TypeError('接口返回无效地址')); return;
          }
          if (finalUrl.protocol !== 'https:' || !HOSTS.has(finalUrl.hostname)) {
            reject(new TypeError('拒绝非 B 站接口的重定向')); return;
          }
          resolve(value);
        } else { reject(value); }
      };
      try { handle = GM_xmlhttpRequest({
        method: options.method || 'GET', url: url.href, headers: outgoing, data,
        anonymous: true, cookie, redirect: 'error', responseType: 'arraybuffer',
        onload: r => finish(true, r),
        onerror: () => finish(false, new TypeError('多账号请求失败，请检查脚本权限或网络')),
        ontimeout: () => finish(false, new DOMException('请求超时', 'TimeoutError')),
        onabort: () => finish(false, new DOMException('请求已取消', 'AbortError')),
      }); } catch (error) { finish(false, error); }
      cancel = () => { finish(false, new DOMException('请求已取消', 'AbortError')); handle?.abort(); };
    });
    return { promise, abort: () => cancel?.() };
  }
  function responseHeaders(raw) {
    const headers = new Headers();
    for (const line of (raw || '').split(/\r?\n/)) {
      const i = line.indexOf(':');
      if (i < 1) continue;
      const name = line.slice(0, i).trim();
      // Body is already decoded by Chrome; don't expose a false compression / length.
      if (/^(?:set-cookie2?|content-encoding|content-length|transfer-encoding)$/i.test(name)) continue;
      try { headers.append(name, line.slice(i + 1).trim()); } catch (_) { /* Ignore invalid fields. */ }
    }
    return headers;
  }

  function separatePlayback() {
    return state.enabled && state.roles.video !== 'browser';
  }
  function failureDetails(error, route, stage) {
    const clean = value => String(value || '').replace(/\?[^\s)"']*/g, '?…').slice(0, 500);
    let path = route?.path || '';
    try { if (!path && error?.config?.url) path = new URL(error.config.url, page.location.href).pathname; } catch (_) {}
    const info = { stage, path, name: clean(error?.name), message: clean(error?.message || error),
      status: error?.response?.status ?? error?.status ?? '', code: error?.response?.data?.code ?? '',
      stack: clean(error?.stack) };
    console.warn('[PiliPlus]', JSON.stringify(info));
    return `${stage}：${info.message || info.name}${path ? `（${path}）` : ''}${info.status ? ` HTTP ${info.status}` : ''}`;
  }
  function refreshPlayerAccess(player = page.player) {
    if (!state.enabled) return Promise.reject(new Error('请先启用脚本并刷新页面'));
    if (!player || typeof player.reloadAccess !== 'function') {
      return Promise.reject(new Error('当前播放器未提供账号同步接口，请完整刷新播放页'));
    }
    if (pendingPlayerRefresh.has(player)) return pendingPlayerRefresh.get(player);
    const mid = state.roles.video;
    const promise = Promise.resolve().then(() => player.reloadAccess()).then(() => {
      const actualMid = player.getUserInfo?.()?.mid;
      if (mid !== 'browser' && String(actualMid || '0') !== mid) {
        throw new Error(`播放器仍使用 UID ${actualMid || '0'}，与取流 UID ${mid} 不一致；请重新选择取流账号并刷新页面`);
      }
      return actualMid;
    }).catch(error => {
      const message = failureDetails(error, null, '播放器同步失败');
      throw new Error(message);
    })
      .finally(() => pendingPlayerRefresh.delete(player));
    pendingPlayerRefresh.set(player, promise);
    return promise;
  }
  function readAssignedJSON(html, name) {
    // Read a JSON literal, never evaluate code from the fetched page.
    const match = new RegExp(`(?:const|let|var|window\\.)?\\s*${name}\\s*=\\s*`).exec(html);
    if (!match) return null;
    const start = match.index + match[0].length;
    if (html[start] !== '{') return null;
    let depth = 0, quoted = false, escaped = false;
    for (let i = start; i < html.length; i++) {
      const char = html[i];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') quoted = false;
      } else if (char === '"') quoted = true;
      else if (char === '{' || char === '[') depth++;
      else if (char === '}' || char === ']') {
        if (--depth === 0) return JSON.parse(html.slice(start, i + 1));
      }
    }
    return null;
  }
  function playbackBootstrap(episode) {
    const match = /^\/(bangumi\/play)\/(ep|ss)(\d+)/.exec(page.location.pathname);
    if (!match) return Promise.reject(new Error('当前页面不支持番剧预载适配'));
    const path = episode ? `/bangumi/play/ep${episode}` : `/${match[1]}/${match[2]}${match[3]}`;
    const mid = state.roles.video;
    const account = mid === '0' ? null : state.accounts.find(a => a.mid === mid);
    if (mid !== '0' && !account) return Promise.reject(new Error('请先配置有效的取流账号'));
    const key = `${mid}:${path}`;
    const cached = playbackBootstraps.get(key);
    if (cached && Date.now() - cached.time < 30000) return cached.promise;
    const route = { url: new URL(`https://www.bilibili.com${path}`), path, role: 'video', mid, account };
    const promise = (async () => {
      const result = await transport(route).promise;
      if (result.status !== 200) throw new Error(`取流账号的首屏预载请求失败：HTTP ${result.status}`);
      const html = new TextDecoder().decode(result.response);
      const preload = readAssignedJSON(html, 'playurlSSRData');
      if (!preload?.data?.result) throw new Error('未找到取流账号的番剧预载数据，请查看接口诊断');
      // Real response from the selected account, including server permission / DRM decisions.
      // Do not fabricate VIP flags or convert a preview into a full episode.
      trustedPlaybackData.add(preload.data);
      page.__PLAYURL_HYDRATE_DATA__ = preload.data;
      page.__playinfo__ = preload.data;
      return preload;
    })().catch(error => { playbackBootstraps.delete(key); notice(error.message); throw error; });
    playbackBootstraps.set(key, { time: Date.now(), promise });
    return promise;
  }
  function installPlaybackHooks() {
    // UGC and legacy player bootstraps must not consume the browser account's
    // embedded stream response when a separate video account is selected.
    for (const name of ['__playinfo__', '__PLAYURL_HYDRATE_DATA__']) {
      const descriptor = Object.getOwnPropertyDescriptor(page, name);
      if (descriptor && (!descriptor.configurable || descriptor.get || descriptor.set)) continue;
      let value = descriptor?.value;
      try {
        Object.defineProperty(page, name, { configurable: true, enumerable: true,
          get() { return separatePlayback() && (!value || !trustedPlaybackData.has(value)) ? undefined : value; },
          set(next) { value = next; },
        });
      } catch (_) { /* Unsupported page-global descriptors are left in place. */ }
    }
    const wrapped = new WeakMap();
    function wrapNano(nano) {
      if (!nano || typeof nano !== 'object') return nano;
      if (wrapped.has(nano)) return wrapped.get(nano);
      const factories = new WeakMap();
      const proxy = new Proxy(nano, { get(object, key, receiver) {
        const value = Reflect.get(object, key, receiver);
        if (key !== 'createPlayer' || typeof value !== 'function') return value;
        if (!factories.has(value)) factories.set(value, function(config, ...rest) {
          if (!separatePlayback() || !config) return Reflect.apply(value, object, [config, ...rest]);
          const next = { ...config };
          if (next.prefetch) {
            next.prefetch = { ...next.prefetch }; delete next.prefetch.playUrl;
          }
          const callback = config.requestConfig?.reqHttpPlayUrlInfo;
          // The current official OGV page supplies an inline callback that only
          // returns playurlSSRData. Replace that specific SSR-only callback;
          // later real API request callbacks keep using our fetch/XHR routing.
          if (typeof callback === 'function' && Function.prototype.toString.call(callback).includes('playurlSSRData')) {
            next.requestConfig = { ...config.requestConfig,
              reqHttpPlayUrlInfo: params => playbackBootstrap(params?.ep_id || config.episodeId) };
          }
          // Initial player-info and playurl requests already use the video
          // account through fetch/XHR routing. reloadAccess() also replaces the
          // media source, so calling it on Player_Initialized interrupts the
          // first seconds of playback. Keep it as an explicit recovery action.
          return Reflect.apply(value, object, [next, ...rest]);
        });
        return factories.get(value);
      } });
      wrapped.set(nano, proxy); wrapped.set(proxy, proxy); return proxy;
    }
    const descriptor = Object.getOwnPropertyDescriptor(page, 'nano');
    if (!descriptor || (descriptor.configurable && !descriptor.get && !descriptor.set)) {
      let nano = wrapNano(descriptor?.value);
      try { Object.defineProperty(page, 'nano', { configurable: true, enumerable: true,
        get: () => nano, set: value => { nano = wrapNano(value); } }); } catch (_) { /* Page compatibility. */ }
    }
    if (separatePlayback() && /^\/bangumi\/play\/(ep|ss)\d+/.test(page.location.pathname)) {
      void playbackBootstrap().catch(() => {});
    }
  }
  installPlaybackHooks();

  page.fetch = async function(input, init) {
    let route;
    try {
    const url = typeof input === 'string' || input instanceof page.URL ? String(input) : input.url;
    route = target(url);
    if (!route) return nativeFetch.call(this, input, init);
    const request = new page.Request(input, init);
    if (request.signal.aborted) throw new DOMException('请求已取消', 'AbortError');
    let body;
    if (!['GET', 'HEAD'].includes(request.method)) {
      body = /multipart\/form-data/i.test(request.headers.get('Content-Type') || '')
        ? await request.clone().formData() : await request.clone().text();
    }
    const headers = new Headers(request.headers);
    if (body instanceof page.FormData || body instanceof FormData) headers.delete('Content-Type');
    const task = transport(route, { method: request.method, headers, body });
    const abort = () => task.abort();
    request.signal.addEventListener('abort', abort, { once: true });
    if (request.signal.aborted) abort();
    try {
      const r = await task.promise;
      const response = new page.Response([101, 204, 205, 304].includes(r.status) || request.method === 'HEAD' ? null : r.response,
        { status: r.status, statusText: r.statusText || '', headers: responseHeaders(r.responseHeaders) });
      Object.defineProperties(response, { url: { value: r.finalUrl || route.url.href },
        redirected: { value: false }, type: { value: 'basic' } });
      return response;
    } finally { request.signal.removeEventListener('abort', abort); }
    } catch (error) { failureDetails(error, route, 'fetch'); throw error; }
  };

  // Instrument the native prototype as well as future instances: a player or
  // another script may already hold the constructor before this script starts.
  // Replacing window.XMLHttpRequest alone misses those cached constructors.
  const NativeXHR = page.XMLHttpRequest;
  const xhrPrototype = NativeXHR.prototype;
  const xhrOriginal = Object.fromEntries(['open', 'send', 'abort', 'setRequestHeader',
    'getResponseHeader', 'getAllResponseHeaders', 'overrideMimeType'].map(k => [k, xhrPrototype[k]]));
  const instrumentedXHR = new WeakSet();
  function instrumentXHR(xhr) {
      if (instrumentedXHR.has(xhr)) return xhr;
      instrumentedXHR.add(xhr);
      const original = xhrOriginal;
      let route, method, async, routed = false, task, generation = 0, mime = '';
      let headers = new Headers(), result = null, ready = 0, decoded;
      const event = (name, progress = false) => xhr.dispatchEvent(progress
        ? new page.ProgressEvent(name, { lengthComputable: false }) : new page.Event(name));
      const change = value => { ready = value; event('readystatechange'); };
      const text = () => {
        if (decoded === undefined) {
          const type = mime || responseHeaders(result?.responseHeaders).get('Content-Type') || '';
          const encoding = /charset=([^;\s]+)/i.exec(type)?.[1] || 'utf-8';
          try { decoded = new TextDecoder(encoding).decode(result?.response || new ArrayBuffer(0)); }
          catch (_) { decoded = new TextDecoder().decode(result?.response || new ArrayBuffer(0)); }
        }
        return decoded;
      };
      const nativeGet = name => {
        let prototype = xhrPrototype;
        while (prototype) {
          const getter = Object.getOwnPropertyDescriptor(prototype, name)?.get;
          if (getter) return getter.call(xhr);
          prototype = Object.getPrototypeOf(prototype);
        }
        return undefined;
      };
      for (const name of ['readyState', 'status', 'statusText', 'responseURL', 'response', 'responseText', 'responseXML']) {
        Object.defineProperty(xhr, name, { configurable: true, get() {
          if (!routed) return nativeGet(name);
          if (name === 'readyState') return ready;
          if (name === 'status') return ready >= 2 ? result?.status || 0 : 0;
          if (name === 'statusText') return ready >= 2 ? result?.statusText || '' : '';
          if (name === 'responseURL') return ready >= 2 ? result?.finalUrl || route.url.href : '';
          const type = xhr.responseType;
          if (name === 'responseText' && type && type !== 'text') throw new DOMException('responseType 非文本', 'InvalidStateError');
          if (name === 'responseText') return ready >= 3 ? text() : '';
          if (name === 'responseXML' || (name === 'response' && type === 'document')) {
            if (ready !== 4 || !result) return null;
            const ct = mime || responseHeaders(result.responseHeaders).get('Content-Type') || '';
            if (!/xml|html/i.test(ct)) return null;
            return new page.DOMParser().parseFromString(text(), /html/i.test(ct) ? 'text/html' : 'application/xml');
          }
          if (ready !== 4 || !result) return type && type !== 'text' ? null : '';
          if (type === 'arraybuffer') return result.response;
          if (type === 'blob') return new page.Blob([result.response], { type: mime || responseHeaders(result.responseHeaders).get('Content-Type') || '' });
          if (type === 'json') { try { return JSON.parse(text()); } catch (_) { return null; } }
          return text();
        } });
      }
      xhr.open = function(m, url, isAsync = true, user, password) {
        ++generation; task?.abort(); task = null;
        routed = false; result = null; decoded = undefined; ready = 0; mime = '';
        method = String(m).toUpperCase(); async = isAsync !== false;
        route = target(url); headers = new Headers();
        return original.open.call(xhr, m, url, isAsync, user, password);
      };
      xhr.setRequestHeader = function(k, v) { original.setRequestHeader.call(xhr, k, v); headers.append(k, v); };
      xhr.getAllResponseHeaders = function() {
        if (!routed) return original.getAllResponseHeaders.call(xhr);
        return ready < 2 ? '' : [...responseHeaders(result?.responseHeaders)].map(([k, v]) => `${k}: ${v}\r\n`).join('');
      };
      xhr.getResponseHeader = function(k) {
        return routed ? (ready < 2 ? null : responseHeaders(result?.responseHeaders).get(k))
          : original.getResponseHeader.call(xhr, k);
      };
      const originalOverride = original.overrideMimeType;
      xhr.overrideMimeType = function(value) { mime = String(value); return originalOverride.call(xhr, value); };
      xhr.send = function(body) {
        if (!route) return original.send.call(xhr, body);
        if (routed || xhr.readyState !== 1) throw new DOMException('请求状态不允许发送', 'InvalidStateError');
        if (!async) throw new DOMException('多账号模式不支持同步 XHR，请停用脚本后重试', 'NotSupportedError');
        routed = true; ready = 1;
        const mine = generation;
        event('loadstart', true);
        task = transport(route, { method, headers, body: /^(GET|HEAD)$/.test(method) ? null : body, timeout: xhr.timeout });
        task.promise.then(r => {
          if (mine !== generation) return;
          result = r;
          change(2); if (mine !== generation) return;
          change(3); if (mine !== generation) return;
          event('progress', true); if (mine !== generation) return;
          change(4); if (mine !== generation) return;
          event('load', true); event('loadend', true);
        }, error => {
          if (mine !== generation) return;
          result = null; change(4);
          event(error.name === 'TimeoutError' ? 'timeout' : error.name === 'AbortError' ? 'abort' : 'error', true);
          event('loadend', true);
        });
      };
      xhr.abort = function() {
        if (!routed) return original.abort.call(xhr);
        ++generation; task?.abort(); result = null; decoded = undefined;
        if (ready > 0 && ready < 4) { change(4); event('abort', true); event('loadend', true); }
        ready = 0;
      };
      return xhr;
  }
  xhrPrototype.open = function(...args) {
    const xhr = instrumentXHR(this);
    return xhr.open(...args);
  };
  if (nativeBeacon) page.navigator.sendBeacon = function(url, data) {
    const route = target(url);
    if (!route) return nativeBeacon.call(this, url, data);
    // GM requests may be cancelled when the tab closes; see README.
    const headers = new Headers();
    if (typeof data === 'string') headers.set('Content-Type', 'text/plain;charset=UTF-8');
    const send = body => transport(route, { method: 'POST', headers, body }).promise.catch(() => {});
    if (data instanceof page.Blob && /json|x-www-form-urlencoded/i.test(data.type)) {
      headers.set('Content-Type', data.type); data.text().then(send).catch(() => {});
    } else send(data);
    return true;
  };

  // Login requests have their own disposable cookie jar. Never use the page's
  // fetch, write document.cookie, or follow the returned cross-domain URL.
  const LOGIN_COOKIES = new Set(['SESSDATA', 'bili_jct', 'DedeUserID', 'DedeUserID__ckMd5', 'sid', 'buvid3', 'buvid4', 'b_nut']);
  const LOGIN_PATHS = new Set(['/x/passport-login/captcha', '/x/passport-login/web/key',
    '/x/passport-login/web/login', '/x/passport-login/web/sms/send', '/x/passport-login/web/login/sms',
    '/x/passport-login/web/qrcode/generate', '/x/passport-login/web/qrcode/poll']);
  function stopLogin() {
    const dispose = disposeLogin; disposeLogin = null; dispose?.();
  }
  function loginContext() {
    const controller = new page.AbortController(); const timers = new Set();
    const cookies = Object.create(null);
    // Reuse only device identifiers, never the browser's logged-in identity.
    for (const entry of document.cookie.split(';')) {
      const pair = /^\s*(buvid3|buvid4|b_nut)=([^;\r\n\x00]*)$/.exec(entry);
      if (pair) cookies[pair[1]] = pair[2];
    }
    return { cookies, signal: controller.signal,
      delay(action, ms) {
        const timer = setTimeout(() => { timers.delete(timer); if (!controller.signal.aborted) action(); }, ms);
        timers.add(timer); return timer;
      },
      dispose() { controller.abort(); for (const timer of timers) clearTimeout(timer); timers.clear(); },
    };
  }
  function loginError(code) {
    const messages = { '-400': '登录参数有误，请重试', '-412': '请求被风控拦截，请稍后重试或使用扫码登录',
      '-629': '账号或密码错误', '-662': '请求过于频繁，请稍后重试', '-105': '验证未通过，请重试',
      '1002': '手机号格式有误', '1003': '验证码已发送，请稍候', '1006': '验证码有误或已过期',
      '1007': '验证码有误或已过期', '2400': '验证已过期，请重新获取', '2406': '人机验证未通过，请重试',
      '86203': '短信发送次数已达上限，请稍后重试' };
    return new Error(messages[code] || `登录请求未完成（${Number.isFinite(Number(code)) ? Number(code) : '响应异常'}）`);
  }
  function keepLoginCookie(context, name, value) {
    if (!LOGIN_COOKIES.has(name) || typeof value !== 'string' || /[;\r\n\x00]/.test(value)) return;
    if (value) context.cookies[name] = value; else delete context.cookies[name];
  }
  function loginRequest(context, path, fields = null, query = {}) {
    const identity = path === '/x/web-interface/nav';
    if (!identity && !LOGIN_PATHS.has(path)) return Promise.reject(new Error('无效的登录接口'));
    const url = new URL(path, identity ? 'https://api.bilibili.com' : 'https://passport.bilibili.com');
    url.search = new URLSearchParams(query).toString();
    return new Promise((resolve, reject) => {
      let request, settled = false;
      const finish = (error, result) => {
        if (settled) return; settled = true; clearTimeout(timer);
        context.signal.removeEventListener('abort', abort);
        error ? reject(error) : resolve(result);
      };
      const abort = () => { finish(new DOMException('登录已取消', 'AbortError')); request?.abort(); };
      const timer = setTimeout(() => { finish(new Error('登录请求超时，请重试')); request?.abort(); }, 20000);
      if (context.signal.aborted) { abort(); return; }
      context.signal.addEventListener('abort', abort, { once: true });
      try {
        request = GM_xmlhttpRequest({ method: fields ? 'POST' : 'GET', url: url.href,
          anonymous: true, redirect: 'error', responseType: 'text',
          cookie: Object.entries(context.cookies).map(([name, value]) => `${name}=${value}`).join('; '),
          headers: { Accept: 'application/json', Referer: 'https://www.bilibili.com/', Origin: 'https://www.bilibili.com',
            ...(fields ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
          data: fields ? new URLSearchParams(fields).toString() : undefined,
          onload: response => {
            if (settled) return;
            try {
              const final = new URL(response.finalUrl || url.href);
              if (final.origin !== url.origin || final.pathname !== url.pathname) throw new Error('登录接口发生重定向，请重试');
              if (response.status !== 200) throw new Error(`登录请求失败（HTTP ${response.status}）`);
              const body = JSON.parse(response.responseText || response.response);
              if (body.code !== 0) throw loginError(body.code);
              for (const line of String(response.responseHeaders || '').split(/\r?\n/)) {
                if (!/^set-cookie:/i.test(line)) continue;
                for (const entry of line.replace(/^set-cookie:\s*/i, '').split(/,(?=\s*[A-Za-z0-9_-]+=)/)) {
                  const pair = /^\s*([A-Za-z0-9_-]+)=([^;]*)/.exec(entry);
                  if (pair) keepLoginCookie(context, pair[1], pair[2]);
                }
              }
              if (!body.data || typeof body.data !== 'object') throw new Error('登录接口返回异常，请重试');
              finish(null, body.data);
            } catch (error) { finish(error instanceof SyntaxError ? new Error('登录接口返回异常，请重试') : error); }
          },
          onerror: () => finish(new Error('登录请求失败，请检查网络及脚本的 passport.bilibili.com 权限')),
          ontimeout: () => finish(new Error('登录请求超时，请重试')),
          onabort: () => finish(new DOMException('登录已取消', 'AbortError')),
        });
      } catch (_) { finish(new Error('无法发起登录请求，请检查脚本权限')); }
    });
  }
  function loginCookies(context, data) {
    // Web login can return the same credentials in the cross-domain URL when
    // Set-Cookie headers are unavailable. Parse it locally; never navigate to it.
    if (typeof data.url === 'string' && data.url) {
      let url; try { url = new URL(data.url); } catch (_) { throw new Error('登录凭据地址无效'); }
      if (url.protocol === 'https:' && !url.username && !url.password && !url.port
        && ['passport.biligame.com', 'passport.bilibili.com'].includes(url.hostname)
        && /^\/crossDomain\/?$/.test(url.pathname)) {
        for (const name of LOGIN_COOKIES) {
          let value = url.searchParams.get(name);
          if (name === 'SESSDATA' && value?.includes(',')) value = encodeURIComponent(value);
          if (value !== null) keepLoginCookie(context, name, value);
        }
      }
    }
    try { return cookiesFrom(context.cookies); }
    catch (_) { throw new Error('登录成功但未取得完整凭据，请重新登录或使用 Cookie 导入'); }
  }
  function showLoginCaptcha(context, data) {
    const gt = data.geetest;
    if (!data.token || !gt?.gt || !gt.challenge || (data.type && data.type !== 'geetest')) {
      return Promise.reject(new Error('当前验证方式暂不支持，请使用扫码登录'));
    }
    return new Promise((resolve, reject) => {
      if (context.signal.aborted) { reject(new DOMException('登录已取消', 'AbortError')); return; }
      const token = page.crypto.randomUUID(); let settled = false;
      const overlay = el('div', null, { class: 'captcha-overlay' });
      const header = el('div', null, { class: 'captcha-header' });
      const cancel = button('', () => finish(new DOMException('验证已取消', 'AbortError')), 'close');
      cancel.setAttribute('aria-label', '取消验证'); cancel.append(icon('close'));
      header.append(el('span', '安全验证'), cancel);
      const frame = el('iframe', null, { class: 'captcha-frame', title: '哔哩哔哩安全验证',
        sandbox: 'allow-scripts', referrerpolicy: 'no-referrer' });
      const finish = (error, result) => {
        if (settled) return; settled = true; clearTimeout(timer);
        page.removeEventListener('message', receive); context.signal.removeEventListener('abort', abort);
        dialog.removeEventListener('cancel', cancelDialog); overlay.remove();
        if (dialog.open && !context.signal.aborted) shadow.querySelector('.login-submit')?.focus({ preventScroll: true });
        error ? reject(error) : resolve(result);
      };
      const abort = () => finish(new DOMException('登录已取消', 'AbortError'));
      const cancelDialog = event => { event.preventDefault(); finish(new DOMException('验证已取消', 'AbortError')); };
      const receive = event => {
        if (event.source !== frame.contentWindow || event.data?.token !== token) return;
        if (event.data.type === 'success') {
          const value = event.data.value;
          if (!value || !['geetest_challenge', 'geetest_validate', 'geetest_seccode']
            .every(key => typeof value[key] === 'string' && value[key].length > 0 && value[key].length < 2048)) {
            finish(new Error('验证结果异常，请重试')); return;
          }
          finish(null, { token: data.token, challenge: value.geetest_challenge,
            validate: value.geetest_validate, seccode: value.geetest_seccode });
        } else if (event.data.type === 'close') abort();
        else if (event.data.type === 'error') finish(new Error('安全验证加载失败，请重试或使用扫码登录'));
      };
      const timer = setTimeout(() => finish(new Error('安全验证超时，请重试')), 180000);
      const config = JSON.stringify({ gt: gt.gt, challenge: gt.challenge, offline: false, new_captcha: true,
        product: 'bind', https: true, protocol: 'https://', lang: 'zh-cn', width: '100%' }).replace(/</g, '\\u003c');
      frame.srcdoc = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
        html,body{margin:0;width:100%;height:100%;background:#fff;font:14px -apple-system,BlinkMacSystemFont,sans-serif}
        #loading{position:absolute;inset:0;display:grid;place-items:center;color:#86868b}</style></head><body><div id="loading">正在加载验证…</div>
        <script>const send=(type,value)=>parent.postMessage({token:${JSON.stringify(token)},type,value},'*');
        const start=()=>{try{initGeetest(${config},captcha=>{captcha.onReady(()=>{document.getElementById('loading').remove();captcha.verify()});
        captcha.onSuccess(()=>send('success',captcha.getValidate()));captcha.onError(()=>send('error'));captcha.onClose(()=>send('close'))})}catch(e){send('error')}};
        const sdk=document.createElement('script');sdk.src='https://static.geetest.com/static/tools/gt.js';sdk.onload=start;sdk.onerror=()=>send('error');document.head.append(sdk);<\/script></body></html>`;
      page.addEventListener('message', receive); context.signal.addEventListener('abort', abort, { once: true });
      dialog.addEventListener('cancel', cancelDialog); overlay.append(header, frame); dialog.append(overlay);
      frame.focus();
    });
  }
  function drawLoginQR(canvas, value) {
    LoginQR ||= createLoginQR();
    const qr = LoginQR(0, 'M'); qr.addData(value); qr.make();
    const count = qr.getModuleCount(); const scale = 5; const margin = 4;
    canvas.width = canvas.height = (count + margin * 2) * scale;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('无法显示二维码');
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.fillStyle = '#1d1d1f';
    for (let row = 0; row < count; row++) for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) context.fillRect((col + margin) * scale, (row + margin) * scale, scale, scale);
    }
  }
  function loginQRData(data) {
    // The returned scan address is QR content, not an outgoing request target.
    // Do not reject an otherwise valid key just because that address uses HTTP,
    // a relative path, or a different official Bilibili login entry point.
    let url = null;
    const raw = typeof data.url === 'string' ? data.url.trim() : '';
    if (raw) {
      try { url = new URL(raw, 'https://passport.bilibili.com/'); } catch (_) { /* Use the canonical scan page below. */ }
    }
    const suppliedKey = typeof data.qrcode_key === 'string' ? data.qrcode_key.trim() : '';
    const key = suppliedKey || url?.searchParams.get('qrcode_key') || '';
    if (!/^[A-Za-z0-9_-]{16,256}$/.test(key)) throw new Error('未获取到二维码，请刷新重试');
    const urlKey = url?.searchParams.get('qrcode_key');
    if (url && ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password && !url.port
      && (/(?:^|\.)bilibili\.com$/.test(url.hostname) || url.hostname === 'b23.tv')
      && (!urlKey || urlKey === key)) return { key, value: url.href };
    const scan = new URL('https://passport.bilibili.com/h5-app/passport/login/scan');
    scan.search = new URLSearchParams({ navhide: '1', qrcode_key: key, from: 'main_web' }).toString();
    return { key, value: scan.href };
  }
  function importPanelAccounts(raw, draft) {
    const imported = accountsFrom(raw);
    const incoming = imported.accounts.map(account => {
      const previous = state.accounts.find(old => old.mid === account.mid);
      profileAttempts.delete(account.mid);
      return { ...account, username: account.username || previous?.username || '', face: account.face || previous?.face || '', vip: account.vip ?? previous?.vip ?? false };
    });
    const mids = new Set(incoming.map(account => account.mid));
    state = validateState({ ...state, accounts: state.accounts.filter(account => !mids.has(account.mid)).concat(incoming),
      roles: { ...state.roles, ...imported.roles } });
    panelDraft = { ...draft, ...imported.roles };
    panelAddingAccount = false;
    save(); render(); notice('账号已导入'); void refreshAccountProfiles(true);
  }
  function renderLoginForm(content, draft) {
    const context = loginContext();
    const form = el('form', null, { class: 'card form login-form', autocomplete: 'off' });
    const methods = el('div', null, { class: 'login-tabs', role: 'tablist', 'aria-label': '添加账号方式' });
    const methodKeys = ['qrcode', 'password', 'sms'];
    for (const [method, label] of [['qrcode', '二维码'], ['password', '密码'], ['sms', '验证码']]) {
      const tab = button(label, () => { loginMethod = method; render(); }, 'tab');
      for (const [key, value] of Object.entries({ role: 'tab', 'aria-selected': String(loginMethod === method),
        tabindex: loginMethod === method ? '0' : '-1', 'data-login-method': method, 'aria-controls': 'piliplus-login-fields' })) tab.setAttribute(key, value);
      tab.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
        event.preventDefault(); loginMethod = methodKeys[(methodKeys.indexOf(method) + (event.key === 'ArrowRight' ? 1 : methodKeys.length - 1)) % methodKeys.length];
        render(); shadow.querySelector(`[data-login-method="${loginMethod}"]`)?.focus();
      });
      methods.append(tab);
    }
    const fields = el('div', null, { class: 'login-fields', id: 'piliplus-login-fields', role: 'tabpanel' });
    const status = el('div', null, { class: 'login-status', role: 'status', 'aria-live': 'polite', hidden: '' });
    const setStatus = (message, error = false) => {
      if (context.signal.aborted) return;
      status.textContent = message; status.hidden = !message; status.classList.toggle('error', error);
    };
    let busy = false, submitAction = null, cooldownUpdate = null;
    const run = async action => {
      if (busy || context.signal.aborted) return;
      busy = true;
      for (const control of form.querySelectorAll('.login-submit,.sms-send,.qr-refresh')) control.disabled = true;
      try { await action(); }
      catch (error) {
        if (!context.signal.aborted) setStatus(error.name === 'AbortError' ? '验证已取消' : error.message || '登录失败，请重试', true);
      } finally {
        busy = false;
        if (!context.signal.aborted) {
          for (const control of form.querySelectorAll('.login-submit,.sms-send,.qr-refresh')) control.disabled = false;
          cooldownUpdate?.();
        }
      }
    };
    const complete = async (data, session = context) => {
      if (data.status !== undefined && Number(data.status) !== 0) throw new Error('本次登录需要额外安全验证，请使用短信或扫码登录');
      const cookies = loginCookies(session, data);
      setStatus('正在添加账号…');
      const identity = await loginRequest(session, '/x/web-interface/nav');
      if (!identity.isLogin || String(identity.mid) !== cookies.DedeUserID) throw new Error('账号验证失败，请重新登录');
      if (context.signal.aborted || session.signal.aborted) throw new DOMException('登录已取消', 'AbortError');
      const account = { mid: cookies.DedeUserID, name: String(identity.uname || ''), cookies,
        username: String(identity.uname || ''), face: safeAvatar(identity.face), vip: Number(identity.vipStatus ?? identity.vip?.status) === 1 };
      state = validateState({ ...state, accounts: state.accounts.filter(old => old.mid !== account.mid).concat(account) });
      profileAttempts.set(account.mid, 'done'); save();
      // Collapse the form after success so updating the pool does not start
      // another QR login session without a user action.
      loginMethod = 'qrcode'; panelAddingAccount = false; render(); notice('账号已添加');
    };
    const captcha = async () => {
      setStatus('正在准备安全验证…');
      const data = await loginRequest(context, '/x/passport-login/captcha', null, { source: 'main_web' });
      return showLoginCaptcha(context, data);
    };
    const submit = label => {
      const control = el('button', label, { type: 'submit', class: 'action primary login-submit' });
      fields.append(control); return control;
    };
    form.addEventListener('submit', event => { event.preventDefault(); if (submitAction) void run(submitAction); });
    let disposeQR = null;
    disposeLogin = () => {
      context.dispose(); disposeQR?.();
      for (const input of form.querySelectorAll('input,textarea')) input.value = '';
    };

    if (loginMethod === 'password') {
      const username = el('input', null, { type: 'text', placeholder: '手机号 / 邮箱', 'aria-label': '登录账号',
        autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', required: '', maxlength: '254' });
      const password = el('input', null, { type: 'password', placeholder: '密码', 'aria-label': '登录密码',
        autocomplete: 'off', required: '', maxlength: '256' });
      fields.append(username, password); submit('登录并添加');
      submitAction = async () => {
        const account = username.value.trim(); let secret = password.value;
        if (!account || !secret) throw new Error('请输入账号和密码');
        password.value = '';
        try {
          const validation = await captcha();
          setStatus('正在登录…');
          // Fetch the short-lived key after the user has finished the captcha.
          const key = await loginRequest(context, '/x/passport-login/web/key');
          if (typeof key.key !== 'string' || !key.key.includes('PUBLIC KEY') || typeof key.hash !== 'string') throw new Error('无法获取登录密钥');
          LoginRSA ||= createLoginRSA();
          const crypt = new LoginRSA(); crypt.setPublicKey(key.key);
          const encrypted = crypt.encrypt(key.hash + secret); secret = '';
          if (!encrypted) throw new Error('密码加密失败，请重新输入');
          const data = await loginRequest(context, '/x/passport-login/web/login', { username: account, password: encrypted,
            keep: '1', source: 'main_web', go_url: 'https://www.bilibili.com/', ...validation });
          await complete(data);
        } finally { secret = ''; password.value = ''; }
      };
    } else if (loginMethod === 'sms') {
      const phoneRow = el('div', null, { class: 'phone-row' });
      const country = el('input', null, { type: 'tel', class: 'country-code', value: '+86', 'aria-label': '国家或地区区号',
        inputmode: 'tel', maxlength: '5', required: '' });
      const phone = el('input', null, { type: 'tel', placeholder: '手机号', 'aria-label': '手机号',
        autocomplete: 'tel-national', inputmode: 'tel', required: '', maxlength: '20' });
      phoneRow.append(country, phone);
      const codeRow = el('div', null, { class: 'code-row' });
      const code = el('input', null, { type: 'text', placeholder: '短信验证码', 'aria-label': '短信验证码',
        inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '8', required: '' });
      const send = el('button', '获取验证码', { type: 'button', class: 'sms-send text-button' });
      codeRow.append(code, send); fields.append(phoneRow, codeRow); submit('登录并添加');
      let ticket = null;
      const phoneValue = () => {
        const cid = country.value.trim().replace(/^\+/, ''); const tel = phone.value.trim().replace(/[\s-]/g, '');
        if (!/^[1-9]\d{0,3}$/.test(cid) || !/^\d{5,15}$/.test(tel) || (cid === '86' && !/^1\d{10}$/.test(tel))) throw new Error('请输入正确的区号和手机号');
        return { cid, tel };
      };
      cooldownUpdate = () => {
        const seconds = Math.max(0, Math.ceil((smsCooldownUntil - Date.now()) / 1000));
        send.textContent = seconds ? `${seconds} 秒后重发` : '获取验证码'; send.disabled = busy || seconds > 0;
      };
      const tick = () => { cooldownUpdate(); context.delay(tick, 1000); }; tick();
      for (const input of [country, phone]) input.addEventListener('input', () => { ticket = null; code.value = ''; setStatus(''); });
      send.addEventListener('click', () => void run(async () => {
        if (Date.now() < smsCooldownUntil) return;
        const target = phoneValue(); ticket = null;
        const validation = await captcha();
        // An input edited while captcha is open must not receive a code for the
        // old number and then submit it with the new number.
        const current = phoneValue();
        if (current.cid !== target.cid || current.tel !== target.tel) throw new Error('手机号已变更，请重新获取验证码');
        setStatus('正在发送验证码…');
        const data = await loginRequest(context, '/x/passport-login/web/sms/send', { ...target, source: 'main_web', ...validation });
        if (typeof data.captcha_key !== 'string' || !data.captcha_key) throw new Error('验证码发送失败，请重试');
        smsCooldownUntil = Date.now() + 60000;
        const latest = phoneValue();
        if (latest.cid !== target.cid || latest.tel !== target.tel) throw new Error('手机号已变更，请使用原手机号接收的验证码');
        ticket = { ...target, key: data.captcha_key, expires: Date.now() + 300000 };
        setStatus('验证码已发送'); code.focus();
      }));
      submitAction = async () => {
        const target = phoneValue();
        if (!ticket || ticket.cid !== target.cid || ticket.tel !== target.tel || Date.now() >= ticket.expires) throw new Error('请先获取短信验证码');
        if (!/^\d{4,8}$/.test(code.value.trim())) throw new Error('请输入正确的短信验证码');
        setStatus('正在登录…');
        const data = await loginRequest(context, '/x/passport-login/web/login/sms', { ...target, code: code.value.trim(),
          captcha_key: ticket.key, source: 'main_web', keep: 'true', go_url: 'https://www.bilibili.com/' });
        code.value = ''; await complete(data);
      };
    } else if (loginMethod === 'qrcode') {
      const box = el('div', null, { class: 'qr-box' });
      const placeholder = el('div', '正在生成二维码…', { class: 'qr-placeholder' });
      const canvas = el('canvas', null, { class: 'qr-canvas', role: 'img', 'aria-label': '哔哩哔哩登录二维码', hidden: '' });
      box.append(placeholder, canvas); fields.append(box);
      const refresh = el('button', '刷新二维码', { type: 'button', class: 'text-button qr-refresh' }); fields.append(refresh);
      const start = async () => {
        disposeQR?.();
        const session = loginContext();
        const abort = () => session.dispose(); context.signal.addEventListener('abort', abort, { once: true });
        disposeQR = () => { context.signal.removeEventListener('abort', abort); session.dispose(); };
        canvas.hidden = true; canvas.classList.remove('expired'); placeholder.hidden = false; placeholder.textContent = '正在生成二维码…';
        setStatus('');
        const data = await loginRequest(session, '/x/passport-login/web/qrcode/generate', null, { source: 'main_web' });
        const qr = loginQRData(data);
        drawLoginQR(canvas, qr.value); canvas.hidden = false; placeholder.hidden = true;
        setStatus('使用哔哩哔哩客户端扫码');
        const expires = Date.now() + 180000;
        const expired = () => { canvas.classList.add('expired'); setStatus('二维码已失效，点击刷新'); };
        const poll = async () => {
          if (session.signal.aborted) return;
          if (Date.now() >= expires) { expired(); return; }
          try {
            const result = await loginRequest(session, '/x/passport-login/web/qrcode/poll', null, { qrcode_key: qr.key, source: 'main_web' });
            if (Number(result.code) === 0) { await complete(result, session); return; }
            if (Number(result.code) === 86038) { expired(); return; }
            if (Number(result.code) === 86090) setStatus('已扫码，请在手机上确认');
            else if (Number(result.code) === 86101) setStatus('使用哔哩哔哩客户端扫码');
            else throw loginError(result.code);
            session.delay(() => void poll(), 3000);
          } catch (error) {
            if (!context.signal.aborted && !session.signal.aborted) { canvas.classList.add('expired'); setStatus(error.message || '扫码登录失败，请刷新二维码', true); }
          }
        };
        session.delay(() => void poll(), 1000);
      };
      const generate = async () => {
        await run(start);
        if (!context.signal.aborted && canvas.hidden) placeholder.textContent = '点击下方刷新二维码';
      };
      refresh.addEventListener('click', () => void generate());
      queueMicrotask(() => { if (!context.signal.aborted && dialog.open) void generate(); });
    }
    form.append(methods, fields, status); content.append(form);
  }
  function el(tag, text, attrs = {}) {
    const node = document.createElement(tag);
    if (text != null) node.textContent = text;
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    return node;
  }
  function button(text, action, kind = '') {
    const b = el('button', text, { type: 'button', class: kind });
    b.addEventListener('click', async () => {
      b.disabled = true;
      try { await action(); } catch (error) { notice(error.message || '操作失败'); }
      finally { b.disabled = false; }
    });
    return b;
  }
  function friendlyText(value) {
    let text = String(value || '');
    const names = new Map(state.accounts.map(a => [a.mid, displayName(a.mid)]));
    const browserMid = currentBrowserMid();
    if (browserMid) names.set(browserMid, browserLabel());
    for (const [mid, name] of names) text = text.split(mid).join(name);
    return text.replace(/UID\s*\d+/g, '其他账号').replace(/UID\s*/g, '');
  }
  function clearNotice() {
    clearTimeout(noticeTimer); noticeTimer = null;
    if (!statusBox) return;
    statusBox.hidden = true; statusBox.textContent = ''; statusBox.classList.remove('fading');
  }
  function notice(message) {
    clearNotice();
    if (!statusBox || !message) return;
    const box = statusBox;
    box.textContent = friendlyText(message); box.hidden = false;
    // Keep the message legible, then fade it out within three seconds. A new
    // result replaces the previous message and restarts the lifetime.
    noticeTimer = setTimeout(() => {
      box.classList.add('fading');
      noticeTimer = setTimeout(() => {
        box.hidden = true; box.textContent = ''; box.classList.remove('fading'); noticeTimer = null;
      }, 600);
    }, 2400);
  }
  function icon(name, className = '') {
    const paths = {
      person: ['M20 21v-2a7 7 0 0 0-14 0v2', 'M17 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0'],
      history: ['M3 11a9 9 0 1 1 2.7 7', 'M3 4v7h7', 'M12 7v5l3 2'],
      sparkle: ['m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6L12 3'],
      play: ['m9 6 10 6-10 6V6Z'],
      close: ['m6 6 12 12', 'M18 6 6 18'],
      chevron: ['m9 5 7 7-7 7'],
      down: ['m7 10 5 5 5-5'],
      check: ['m5 12 4 4L19 6'],
      refresh: ['M20 11a8 8 0 0 0-14-5L3 9', 'M3 3v6h6', 'M4 13a8 8 0 0 0 14 5l3-3', 'M21 21v-6h-6'],
      shield: ['m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z', 'm8 12 3 3 5-6'],
      download: ['M12 3v12', 'm7 10 5 5 5-5', 'M4 17v4h16v-4'],
      upload: ['M12 16V4', 'm7 9 5-5 5 5', 'M4 17v4h16v-4'],
      plus: ['M12 5v14', 'M5 12h14'],
      back: ['M19 12H5', 'm12 19-7-7 7-7'],
      settings: ['M4 7h16', 'M4 17h16', 'M8 4v6', 'M16 14v6'],
    };
    const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    for (const [key, value] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
      'stroke-width': '1.7', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', class: `icon ${className}` })) node.setAttribute(key, value);
    for (const d of paths[name] || paths.person) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', d); node.append(path);
    }
    return node;
  }
  function avatar(mid, size = '') {
    const box = el('span', null, { class: `avatar ${size}`, 'aria-hidden': 'true' });
    const face = accountFace(mid);
    if (face) {
      const img = el('img', null, { src: face, alt: '', referrerpolicy: 'no-referrer' });
      img.addEventListener('error', () => box.replaceChildren(icon('person')), { once: true }); box.append(img);
    } else box.append(icon(mid === '0' ? 'shield' : 'person'));
    return box;
  }
  function closeAccountMenu(restoreFocus = false) {
    if (!accountMenu) return false;
    const { menu, trigger } = accountMenu;
    accountMenu = null;
    menu.remove(); trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) trigger.focus({ preventScroll: true });
    return true;
  }
  function openTransferMenu(trigger, items) {
    if (accountMenu?.trigger === trigger) { closeAccountMenu(true); return; }
    closeAccountMenu();
    const menu = el('div', null, { class: 'account-menu transfer-menu', role: 'menu', 'aria-label': trigger.textContent });
    const position = () => {
      const bounds = dialog.getBoundingClientRect(); const anchor = trigger.getBoundingClientRect();
      const width = dialog.clientWidth; const height = dialog.clientHeight;
      menu.style.width = `${Math.min(210, width - 16)}px`;
      const below = height - (anchor.bottom - bounds.top) - 12;
      const above = anchor.top - bounds.top - 12;
      const placeBelow = below >= Math.min(menu.scrollHeight, 160) || below >= above;
      menu.style.maxHeight = `${Math.max(0, placeBelow ? below : above)}px`;
      const left = anchor.left - bounds.left - dialog.clientLeft;
      const top = placeBelow ? anchor.bottom - bounds.top - dialog.clientTop + 6
        : anchor.top - bounds.top - dialog.clientTop - menu.offsetHeight - 6;
      menu.style.left = `${Math.max(8, Math.min(left, width - menu.offsetWidth - 8))}px`;
      menu.style.top = `${Math.max(8, Math.min(top, height - menu.offsetHeight - 8))}px`;
      menu.style.transformOrigin = placeBelow ? 'top left' : 'bottom left';
    };
    for (const [label, symbol, action] of items) {
      const item = button('', () => { closeAccountMenu(true); return action(); }, 'transfer-option');
      item.setAttribute('role', 'menuitem'); item.tabIndex = -1;
      item.append(icon(symbol), document.createTextNode(label)); menu.append(item);
    }
    menu.addEventListener('keydown', event => {
      if (event.key === 'Tab') { closeAccountMenu(true); return; }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const buttons = [...menu.children]; const current = buttons.indexOf(shadow.activeElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
        : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    });
    accountMenu = { menu, trigger, update: position };
    dialog.append(menu); trigger.setAttribute('aria-expanded', 'true'); position(); menu.firstElementChild?.focus();
  }
  function mount() {
    if (host || !document.documentElement) return;
    host = el('div', null, { id: 'piliplus-multi-account' });
    shadow = host.attachShadow({ mode: 'open' });
    const style = el('style', `
      :host{all:initial;color-scheme:light dark;font:14px/1.45 -apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;color:var(--text,#1d1d1f)}
      *{box-sizing:border-box}button,input,textarea{font:inherit}button{cursor:pointer;-webkit-tap-highlight-color:transparent}button:disabled{opacity:.45;cursor:wait}
      button:focus-visible,input:focus-visible,textarea:focus-visible,summary:focus-visible{outline:3px solid #007aff66;outline-offset:3px}
      .icon{width:20px;height:20px;flex:none;display:block}button{border:0;color:var(--text);background:transparent}
      .launcher{position:fixed;right:max(20px,env(safe-area-inset-right));bottom:max(20px,env(safe-area-inset-bottom));z-index:2147483646;display:grid;place-items:center;width:44px;height:44px;padding:0;border:1px solid #ffffffb3;border-radius:50%;background:#ffffffdf;color:#26262a;backdrop-filter:blur(24px);box-shadow:0 4px 24px #00000012}
      .launcher .icon{width:20px;height:20px;color:#007aff}
      dialog{--text:#1d1d1f;--secondary:#6e6e76;--card:#ffffff;--line:#0000000b;--field:#f5f5f7;--accent:#007aff;--hover:#00000004;border:1px solid #ffffffc9;border-radius:28px;padding:0;width:min(960px,calc(100vw - 32px));height:min(760px,calc(100dvh - 32px));max-height:calc(100dvh - 32px);overflow:hidden;background:#f5f5f7f5;color:var(--text);box-shadow:0 30px 100px #00000025,0 2px 10px #0000000a;backdrop-filter:blur(40px);-webkit-backdrop-filter:blur(40px)}
      dialog::backdrop{background:#11182738;backdrop-filter:blur(7px);-webkit-backdrop-filter:blur(7px)}
      .sheet{display:flex;flex-direction:column;height:100%;min-height:0}.header{flex:none;display:flex;align-items:center;justify-content:space-between;padding:27px 28px 21px;gap:12px}
      h2{font-size:25px;line-height:1.2;letter-spacing:-.7px;font-weight:650;margin:0}h3{font-size:12px;font-weight:500;color:var(--secondary);margin:22px 0 9px 13px}
      .close{width:29px;height:29px;border-radius:50%;display:grid;place-items:center;background:#e7e7ec;color:#75757b;padding:0}.close .icon{width:15px;height:15px;stroke-width:2.2}
      .tab{padding:7px 6px;border-radius:8px;color:#66666d;font-size:13px;font-weight:500;transition:background .16s,box-shadow .16s}.tab[aria-selected=true]{color:var(--text);background:var(--card);box-shadow:0 2px 5px #0000000d,0 0 0 1px #00000003}
      .workspace{flex:1;display:grid;grid-template-rows:minmax(0,1fr);grid-template-columns:minmax(260px,320px) minmax(0,1fr);gap:28px;padding:0 28px;overflow:hidden;min-height:0}
      .pool-pane,.assignment-pane{min-width:0;min-height:0}.assignment-pane{position:relative;display:flex;flex-direction:column}.pool-pane{overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;padding-right:28px;border-right:1px solid var(--line)}
      .pane-heading{flex:none;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:16px;min-height:44px}.pane-heading h3{margin:0;font-size:17px;color:var(--text);font-weight:600}.pool-count{font-size:12px;color:var(--secondary);font-weight:400;margin-left:8px}
      .pool-actions{display:flex;align-items:center;gap:4px;margin-left:auto}.pool-actions .add-account,.pool-transfer{display:flex;align-items:center;justify-content:center;gap:4px;min-height:44px;padding:8px 6px;border-radius:10px;color:var(--accent);background:var(--card);font-size:12px;white-space:nowrap}.pool-transfer .icon{width:15px;height:15px}.pool-transfer:hover,.pool-transfer[aria-expanded=true]{background:var(--field)}
      .transfer-option{display:flex;align-items:center;gap:10px;width:100%;min-height:44px;padding:10px 12px;border-radius:10px;font-size:13px;text-align:left}.transfer-option:hover,.transfer-option:focus-visible{background:var(--field)}.transfer-option .icon{width:17px;height:17px;color:var(--accent)}
      .add-account{display:flex;align-items:center;justify-content:center;gap:5px;min-height:44px;padding:8px 10px;border-radius:10px;color:var(--accent);background:var(--card);font-size:13px;white-space:nowrap}.add-account .icon{width:15px;height:15px}.add-account:hover{background:var(--field)}
      .content{flex:1;min-height:0;display:grid;grid-template-rows:minmax(0,1fr) auto 72px;gap:10px}.assignment-details{min-height:0;display:grid;grid-template-rows:64px 18px minmax(176px,1fr);gap:10px;overflow:auto;scrollbar-width:thin;overscroll-behavior:contain}.assignment-details>h3{margin:0 0 0 13px;align-self:center}.assignments{display:grid;grid-template-rows:repeat(4,minmax(44px,1fr))}.assignments .setting-row{min-height:0;padding:4px 15px}.pool-pane>.card{margin-bottom:16px}.pool-pane .account-row{gap:10px;padding:15px 12px}.pool-pane .account-row .danger{padding:8px 4px;font-size:12px}.pool-pane .account-name{font-size:14px}.pool-pane .badges{flex-wrap:wrap;gap:4px}.pool-pane .badge.usage{color:var(--accent);background:var(--field)}
      .pool-note{font-size:12px;line-height:1.6;color:var(--secondary);margin:12px 2px 0}.pool-pane .form{padding:12px}.pool-pane .login-tabs .tab{padding:7px 3px;font-size:12px}.pool-pane .qr-box{width:216px;height:216px}.pool-pane .qr-canvas{width:200px;height:200px}.pool-pane .form-actions{gap:4px}.pool-pane .form-actions .action{padding:8px 10px}.assignment-pane .session{margin:0;padding:11px 16px}
      .card{background:var(--card);border-radius:17px;overflow:hidden;box-shadow:0 0 0 1px #00000002}
      .session{display:flex;gap:12px;align-items:center;padding:15px 16px}.session-copy{flex:1;min-width:0}.eyebrow{font-size:11px;color:var(--secondary);margin-bottom:3px}.session-name{font-size:15px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .avatar{width:42px;height:42px;flex:none;overflow:hidden;border-radius:50%;display:grid;place-items:center;background:linear-gradient(145deg,#dceaff,#dfe1f6);color:#627596}.avatar img{width:100%;height:100%;object-fit:cover}.avatar.small{width:36px;height:36px}.avatar .icon{width:21px;height:21px}
      .switch{position:relative;width:43px;height:26px;border-radius:20px;background:#d1d1d6;padding:0;transition:background .2s}.switch[aria-checked=true]{background:#34c759}.switch::after{content:"";position:absolute;width:22px;height:22px;left:2px;top:2px;border-radius:50%;background:white;box-shadow:0 1px 3px #0003;transition:transform .2s}.switch[aria-checked=true]::after{transform:translateX(17px)}
      .setting-row{display:flex;align-items:center;gap:11px;min-height:61px;padding:12px 15px;position:relative}.setting-row+.setting-row::before{content:"";position:absolute;top:0;left:58px;right:0;height:1px;background:var(--line)}.setting-label{font-size:14px;font-weight:500;white-space:nowrap}.setting-icon{display:grid;place-items:center;width:31px;height:31px;border-radius:9px;flex:none}.setting-icon .icon{width:18px;height:18px}
      .blue{color:#007aff;background:#eaf3ff}.green{color:#2baf50;background:#eaf8ee}.purple{color:#9258d8;background:#f1eafd}.orange{color:#ed9636;background:#fff3e4}
      .account-picker{margin-left:auto;max-width:64%;min-width:0;display:flex;align-items:center;justify-content:flex-end;gap:8px;border-radius:9px;padding:7px 0 7px 8px;font-size:14px;font-weight:500}.picker-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}.account-picker>.icon{width:15px;height:15px;color:#b2b2b7;transition:transform .16s}.account-picker[aria-expanded=true]>.icon{transform:rotate(180deg)}.account-picker:hover,.account-picker[aria-expanded=true]{color:var(--accent)}
      .account-menu{position:absolute;z-index:10;width:244px;padding:6px;border-radius:17px;border:1px solid var(--line);background:var(--card);box-shadow:0 12px 36px #00000020,0 2px 6px #00000008;overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;animation:menu-appear .14s ease-out;transform-origin:top right}.account-option{display:flex;align-items:center;gap:10px;width:100%;min-height:47px;padding:7px 10px;border-radius:11px;text-align:left;font-size:13px}.account-option:hover,.account-option:focus-visible{background:var(--field);outline:none}.account-option[aria-checked=true]{background:#007aff0d}.account-option .avatar{width:29px;height:29px}.account-option .avatar .icon{width:16px;height:16px}.account-option>.picker-name{flex:1}.account-option>.icon{width:17px;height:17px;color:var(--accent)}.account-option[aria-checked=false]>.icon{visibility:hidden}
      @keyframes menu-appear{from{opacity:0;transform:scale(.97)}to{opacity:1;transform:scale(1)}}
      .notice-slot{position:relative;height:72px;min-height:72px;pointer-events:none}
      .notice{position:absolute;z-index:20;left:50%;top:8px;transform:translateX(-50%);width:max-content;max-width:calc(100% - 32px);margin:0;padding:10px 16px;border:1px solid var(--line);border-radius:14px;background:var(--card);color:var(--text);box-shadow:0 8px 32px #00000020;font-size:13px;line-height:1.6;text-align:center;white-space:pre-wrap;overflow-wrap:anywhere;pointer-events:none;opacity:1;transition:opacity .6s ease}.notice.fading{opacity:0}.notice[hidden]{display:none}
      .footer{flex:none;padding:21px 28px 25px;display:flex;justify-content:flex-end;align-items:center;gap:9px}.action{padding:9px 18px;border-radius:10px;font-size:13px;font-weight:500;min-height:36px;background:var(--card);box-shadow:0 0 0 1px #00000006,0 1px 2px #00000005}.action:hover{filter:brightness(.98)}.primary{background:#007aff;color:#fff;box-shadow:0 2px 5px #007aff20;min-width:106px}.text-button{color:var(--accent);padding:7px 10px;font-size:13px}.danger{color:#ff453a}
      .account-row{display:flex;gap:11px;align-items:center;padding:13px 14px}.account-row+.account-row{border-top:1px solid var(--line)}.account-copy{flex:1;min-width:0}.account-name{display:block;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.badges{display:flex;gap:6px;margin-top:4px}.badge{font-size:10px;line-height:1.5;padding:1px 5px;border-radius:4px;background:var(--field);color:var(--secondary)}.badge.vip{background:#fff0f4;color:#c66b85}
      .form{padding:14px;display:grid;gap:10px}input[type=text],input[type=password],input[type=tel],textarea{width:100%;min-width:0;border:1px solid var(--line);border-radius:10px;background:var(--field);padding:10px 12px;color:var(--text);font-size:13px}textarea{resize:vertical;min-height:102px;max-height:240px}.form-actions{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}.form-actions .action{padding:8px 13px}.empty{padding:18px;text-align:center;color:var(--secondary);font-size:13px}
      .login-tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:3px;padding:3px;border-radius:11px;background:var(--field);margin-bottom:5px}.login-fields{display:grid;gap:11px;min-width:0}.login-submit{width:100%;margin-top:2px}.form-actions .login-submit{width:auto;margin-top:0}.phone-row,.code-row{display:flex;align-items:center;gap:9px;min-width:0}.phone-row .country-code{width:67px;flex:none;text-align:center;padding:10px 6px}.code-row input{flex:1}.sms-send{flex:none;white-space:nowrap;min-width:96px;text-align:center;padding:9px 3px}.login-status{font-size:12px;color:var(--secondary);text-align:center;overflow-wrap:anywhere;padding:2px 0}.login-status.error{color:#ff453a}.login-status[hidden]{display:none}.qr-box{width:228px;height:228px;max-width:100%;margin:3px auto 5px;padding:8px;display:grid;place-items:center;background:#fff;border:1px solid var(--line);border-radius:18px;overflow:hidden}.qr-canvas{display:block;width:212px;height:212px;max-width:100%;object-fit:contain;image-rendering:pixelated}.qr-canvas.expired{filter:blur(3px);opacity:.25}.qr-placeholder{font-size:13px;color:#86868b;text-align:center}.qr-canvas[hidden],.qr-placeholder[hidden]{display:none}.qr-refresh{justify-self:center;margin-top:-4px}.captcha-overlay{position:absolute;inset:0;z-index:30;background:var(--card);display:flex;flex-direction:column;border-radius:inherit;overflow:hidden}.captcha-header{padding:19px 22px;display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:16px;font-weight:600}.captcha-frame{width:100%;flex:1;min-height:0;border:0;background:white}
      .tool-actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:0}
      .tool-action{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;min-width:0;min-height:80px;padding:10px 8px;border-radius:14px;background:var(--card);box-shadow:0 0 0 1px var(--line);text-align:center;transition:filter .16s}
      .tool-action:hover{filter:brightness(.97)}.tool-action .setting-label{font-size:12px;line-height:1.5;white-space:normal;overflow-wrap:anywhere}
      @media(prefers-color-scheme:dark){dialog{--text:#f5f5f7;--secondary:#9b9ba3;--card:#343438;--line:#ffffff0c;--field:#29292d;--hover:#ffffff05;--accent:#64a8ff;background:#222226f5;border-color:#ffffff19;box-shadow:0 30px 100px #0008}.close{background:#39393e}.close{color:#aaaab3}.tab{color:#a8a8af}.tab[aria-selected=true]{background:#66666c}.launcher{color:#f5f5f7;background:#303035e8;border-color:#ffffff18}.blue{background:#007aff24;color:#68adff}.green{background:#34c75920;color:#5dd280}.purple{background:#a274e923;color:#c19afb}.orange{background:#ef9b3323;color:#ffbd6b}.avatar{background:linear-gradient(145deg,#36475f,#494358);color:#c5d8f0}.badge.vip{background:#71344655;color:#efa7bd}}
      @media(max-height:720px) and (min-width:761px){.header{padding:16px 28px 12px}.footer{padding:12px 28px 14px}.pane-heading{min-height:36px;margin-bottom:8px}.content{gap:8px;grid-template-rows:minmax(0,1fr) auto 72px}.assignment-details{grid-template-rows:54px 16px minmax(176px,1fr);gap:8px}.assignment-pane .session{padding:6px 14px}.tool-action{min-height:64px;gap:6px;padding:6px 8px}.tool-action .setting-icon{width:26px;height:26px}}
      @media(max-width:760px){.workspace{display:block;overflow:auto;overscroll-behavior:contain}.pool-pane{max-height:260px;margin-bottom:20px;padding-right:0;padding-bottom:20px;border-right:0;border-bottom:1px solid var(--line)}.pool-pane .form{max-width:440px;margin:0 auto}.assignment-pane{height:540px}.content{min-height:0}}
      @media(max-width:480px){dialog{border-radius:23px}.header{padding:23px 20px 19px}.workspace{padding:0 20px;gap:20px}.footer{flex:none;padding:19px 20px 22px}.account-picker{max-width:60%}.setting-row{padding:11px 12px}.setting-label,.account-picker{font-size:13px}.setting-icon{width:28px;height:28px}.session{padding:13px}.pane-heading{margin-bottom:12px}}
      @media(prefers-reduced-motion:reduce){*,*::after{transition:none!important;animation:none!important}}
    `);
    const launcher = button('', openPanel, 'launcher');
    launcher.setAttribute('aria-label', '账号切换'); launcher.title = '账号切换'; launcher.append(icon('person'));
    dialog = el('dialog', null, { 'aria-label': '账号切换' });
    dialog.addEventListener('click', e => {
      if (e.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) dialog.close();
    });
    dialog.addEventListener('pointerdown', e => {
      if (accountMenu && !accountMenu.menu.contains(e.target) && !accountMenu.trigger.contains(e.target)) closeAccountMenu();
    });
    dialog.addEventListener('keydown', e => {
      if (e.key === 'Escape' && closeAccountMenu(true)) { e.preventDefault(); e.stopPropagation(); }
    });
    dialog.addEventListener('close', () => { clearNotice(); closeAccountMenu(); stopLogin(); });
    page.addEventListener('resize', () => closeAccountMenu());
    shadow.append(style, launcher, dialog); document.documentElement.append(host);
  }
  function openPanel() {
    mount(); panelDraft = { ...state.roles }; panelEnabled = state.enabled; panelAddingAccount = false;
    render(); if (!dialog.open) dialog.showModal();
    void refreshAccountProfiles();
  }
  function render() {
    clearNotice();
    stopLogin();
    closeAccountMenu();
    dialog.replaceChildren(); browserLabels = []; refreshAccountChoices = null; browserStatusBox = null;
    if (!panelDraft) panelDraft = { ...state.roles };
    if (panelEnabled === null) panelEnabled = state.enabled;
    const draft = panelDraft;
    const sheet = el('div', null, { class: 'sheet' });
    const header = el('div', null, { class: 'header' });
    const close = button('', () => dialog.close(), 'close'); close.setAttribute('aria-label', '关闭'); close.append(icon('close'));
    header.append(el('h2', '账号切换'), close); sheet.append(header);
    const workspace = el('div', null, { class: 'workspace' }); sheet.append(workspace);
    const pool = el('section', null, { class: 'pool-pane', 'aria-labelledby': 'piliplus-pool-title' });
    const management = el('section', null, { class: 'assignment-pane', 'aria-label': '账号分配管理' });
    workspace.append(pool, management);
    workspace.addEventListener('scroll', () => closeAccountMenu(), { passive: true });
    pool.addEventListener('scroll', () => closeAccountMenu(), { passive: true });
    const poolHeader = el('div', null, { class: 'pane-heading' });
    const poolTitle = el('h3', panelAddingAccount ? '添加账号' : '账号池', { id: 'piliplus-pool-title' });
    const entries = state.accounts.slice();
    if (!entries.some(a => a.mid === currentBrowserMid())) entries.unshift({ mid: 'browser' });
    if (!panelAddingAccount) poolTitle.append(el('span', String(entries.length), { class: 'pool-count' }));
    const addAccount = button('', () => {
      panelAddingAccount = !panelAddingAccount; render();
      shadow.querySelector(panelAddingAccount ? `[data-login-method="${loginMethod}"]` : '.add-account')?.focus();
    }, 'add-account');
    addAccount.append(icon(panelAddingAccount ? 'back' : 'plus'), document.createTextNode(panelAddingAccount ? '返回' : '添加账号'));
    addAccount.setAttribute('aria-label', panelAddingAccount ? '返回账号池' : '添加账号');
    addAccount.setAttribute('aria-expanded', String(panelAddingAccount));
    addAccount.setAttribute('aria-controls', 'piliplus-add-account');
    const file = el('input', null, { type: 'file', accept: '.json,.txt,application/json,text/plain', 'aria-label': '从文件导入', hidden: '' });
    file.addEventListener('change', async () => {
      try {
        const selected = file.files[0]; if (!selected) return;
        importPanelAccounts(await selected.text(), panelDraft || draft);
      } catch (error) { notice(error.message || '导入失败'); }
      finally { file.value = ''; }
    });
    const exportText = () => JSON.stringify(validateState({ ...state, roles: { ...draft }, enabled: panelEnabled }), null, 2);
    const transferButton = (label, symbol, items) => {
      const trigger = button('', () => openTransferMenu(trigger, items), 'pool-transfer');
      trigger.setAttribute('aria-haspopup', 'menu'); trigger.setAttribute('aria-expanded', 'false');
      trigger.append(icon(symbol), document.createTextNode(label));
      trigger.addEventListener('keydown', event => {
        if (event.key === 'ArrowDown') { event.preventDefault(); openTransferMenu(trigger, items); }
      });
      return trigger;
    };
    const importButton = transferButton('导入', 'download', [
      ['从剪贴板导入', 'download', async () => {
        let text;
        try { text = await page.navigator.clipboard.readText(); }
        catch (_) { throw new Error('无法读取剪贴板，请使用从文件导入'); }
        if (!text.trim()) throw new Error('剪贴板为空');
        importPanelAccounts(text, panelDraft || draft);
      }],
      ['从文件导入', 'download', () => file.click()],
    ]);
    const exportButton = transferButton('导出', 'upload', [
      ['导出到文件', 'upload', () => {
        const url = URL.createObjectURL(new Blob([exportText()], { type: 'application/json' }));
        el('a', null, { href: url, download: 'piliplus-web-accounts.json' }).click();
        setTimeout(() => URL.revokeObjectURL(url), 1000); notice('已导出到文件');
      }],
      ['导出到剪贴板', 'upload', async () => {
        try { await page.navigator.clipboard.writeText(exportText()); }
        catch (_) { throw new Error('无法写入剪贴板，请使用导出到文件'); }
        notice('已导出到剪贴板');
      }],
    ]);
    const poolActions = el('div', null, { class: 'pool-actions' }); poolActions.append(importButton, exportButton, addAccount);
    poolHeader.append(poolTitle, poolActions, file); pool.append(poolHeader);
    const managementHeader = el('div', null, { class: 'pane-heading' });
    managementHeader.append(el('h3', '账号分配')); management.append(managementHeader);
    const content = el('div', null, { class: 'content', id: 'piliplus-panel-content', role: 'region', 'aria-label': '账号分配' }); management.append(content);
    const profileUpdaters = [];
    content.addEventListener('scroll', () => closeAccountMenu(), { passive: true });
    const options = () => [{ mid: 'browser' }, { mid: '0' },
      ...state.accounts.filter(a => a.mid !== currentBrowserMid())];
    const makePicker = (role, title) => {
      const trigger = el('button', null, { type: 'button', class: 'account-picker', 'aria-haspopup': 'menu',
        'aria-expanded': 'false', 'aria-controls': `piliplus-account-menu-${role}` });
      const name = el('span', null, { class: 'picker-name' }); trigger.append(name, icon('down'));
      const selectedMid = () => currentBrowserMid() && draft[role] === currentBrowserMid() ? 'browser' : draft[role];
      profileUpdaters.push(() => {
        name.textContent = displayName(draft[role]);
        trigger.setAttribute('aria-label', `${title}：${name.textContent}`);
        trigger.title = name.textContent;
      });
      const open = (last = false) => {
        closeAccountMenu();
        const menu = el('div', null, { class: 'account-menu', role: 'menu', id: `piliplus-account-menu-${role}`, 'aria-label': title });
        const position = () => {
          const bounds = dialog.getBoundingClientRect(); const anchor = trigger.getBoundingClientRect();
          const width = dialog.clientWidth; const height = dialog.clientHeight;
          menu.style.width = `${Math.min(244, Math.max(0, width - 24))}px`;
          const below = height - (anchor.bottom - bounds.top) - 12;
          const above = anchor.top - bounds.top - 12;
          const placeBelow = below >= Math.min(menu.scrollHeight, 240) || below >= above;
          menu.style.maxHeight = `${Math.max(0, Math.min(240, placeBelow ? below : above))}px`;
          const left = anchor.right - bounds.left - dialog.clientLeft - menu.offsetWidth;
          const top = placeBelow ? anchor.bottom - bounds.top - dialog.clientTop + 6
            : anchor.top - bounds.top - dialog.clientTop - menu.offsetHeight - 6;
          menu.style.left = `${Math.max(8, Math.min(left, width - menu.offsetWidth - 8))}px`;
          menu.style.top = `${Math.max(8, Math.min(top, height - menu.offsetHeight - 8))}px`;
          menu.style.transformOrigin = placeBelow ? 'top right' : 'bottom right';
        };
        const update = () => {
          const focusedMid = menu.contains(shadow.activeElement) ? shadow.activeElement.dataset.mid : null;
          const scrollTop = menu.scrollTop;
          menu.replaceChildren();
          for (const account of options()) {
            const option = el('button', null, { type: 'button', class: 'account-option', role: 'menuitemradio',
              'aria-checked': String(selectedMid() === account.mid), tabindex: '-1', 'data-mid': account.mid });
            option.append(avatar(account.mid), el('span', displayName(account.mid), { class: 'picker-name' }), icon('check'));
            option.addEventListener('click', () => {
              draft[role] = account.mid; closeAccountMenu(true); refreshAccountChoices?.();
            });
            menu.append(option);
          }
          position();
          if (focusedMid !== null) [...menu.children].find(option => option.dataset.mid === focusedMid)?.focus({ preventScroll: true });
          menu.scrollTop = scrollTop;
        };
        menu.addEventListener('keydown', e => {
          if (e.key === 'Tab') { closeAccountMenu(true); return; }
          if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
          e.preventDefault();
          const items = [...menu.children]; const current = items.indexOf(shadow.activeElement);
          const index = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1
            : (current + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
          items[index]?.focus();
        });
        accountMenu = { menu, trigger, update };
        dialog.append(menu); trigger.setAttribute('aria-expanded', 'true'); update();
        const focused = menu.querySelector('[aria-checked=true]') || (last ? menu.lastElementChild : menu.firstElementChild);
        focused?.focus({ preventScroll: true });
        if (focused) menu.scrollTop = Math.max(0, focused.offsetTop + focused.offsetHeight - menu.clientHeight + 6);
      };
      trigger.addEventListener('click', () => { if (accountMenu?.trigger === trigger) closeAccountMenu(true); else open(); });
      trigger.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(e.key === 'ArrowUp'); }
      });
      return trigger;
    };
    const addTool = (card, title, symbol, color, action) => {
      const row = button('', action, 'tool-action');
      const tile = el('span', null, { class: `setting-icon ${color}` }); tile.append(icon(symbol));
      row.append(tile, el('span', title, { class: 'setting-label' })); card.append(row); return row;
    };
    const saveAndReload = () => { state.roles = { ...draft }; state.enabled = panelEnabled; save(); page.location.reload(); };

    const accounts = el('div', null, { class: 'card' });
    for (const account of panelAddingAccount ? [] : entries) {
      const row = el('div', null, { class: 'account-row' });
      let picture = avatar(account.mid, 'small');
      const copy = el('div', null, { class: 'account-copy' });
      const name = el('span', displayName(account.mid), { class: 'account-name' });
      const badges = el('div', null, { class: 'badges' }); copy.append(name, badges);
      const update = () => {
        name.textContent = displayName(account.mid); name.title = name.textContent;
        const nextPicture = avatar(account.mid, 'small'); picture.replaceWith(nextPicture); picture = nextPicture;
        badges.replaceChildren();
        if (account.mid === 'browser' || account.mid === currentBrowserMid()) badges.append(el('span', '当前登录', { class: 'badge' }));
        if (state.accounts.find(a => a.mid === account.mid)?.vip || ((account.mid === 'browser' || account.mid === currentBrowserMid()) && browserIdentity.vip)) badges.append(el('span', '大会员', { class: 'badge vip' }));
        if (profileAttempts.get(account.mid) === 'failed') badges.append(el('span', '登录需更新', { class: 'badge' }));
        for (const [role, title] of Object.entries(ROLES)) {
          const mid = draft[role];
          if (mid === account.mid || (account.mid === 'browser' && mid === currentBrowserMid())
            || (account.mid === currentBrowserMid() && mid === 'browser')) {
            badges.append(el('span', title, { class: 'badge usage' }));
          }
        }
      };
      profileUpdaters.push(update); row.append(picture, copy);
      if (account.mid !== 'browser') {
        const remove = button('移除', () => {
          if (!page.confirm(`移除“${displayName(account.mid)}”保存的账号？`)) return;
          state.accounts = state.accounts.filter(a => a.mid !== account.mid);
          for (const role of Object.keys(ROLES)) {
            if (state.roles[role] === account.mid) state.roles[role] = 'browser';
            if (draft[role] === account.mid) draft[role] = 'browser';
          }
          profileAttempts.delete(account.mid); save(); render(); notice('账号已移除');
        }, 'text-button danger');
        remove.setAttribute('aria-label', `移除${displayName(account.mid)}`); row.append(remove);
      }
      accounts.append(row);
    }
    if (!panelAddingAccount) pool.append(accounts);
    const addArea = el('div', null, { id: 'piliplus-add-account' }); addArea.hidden = !panelAddingAccount;
    pool.append(addArea);
    if (panelAddingAccount) renderLoginForm(addArea, draft);

    const details = el('div', null, { class: 'assignment-details' }); content.append(details);
    details.addEventListener('scroll', () => closeAccountMenu(), { passive: true });
    const session = el('div', null, { class: 'card session' });
    let picture = avatar('browser');
    const copy = el('div', null, { class: 'session-copy' });
    copy.append(el('div', '当前登录', { class: 'eyebrow' }));
    browserStatusBox = el('div', browserLabel(), { class: 'session-name' }); copy.append(browserStatusBox);
    const enabled = button('', () => {
      panelEnabled = !panelEnabled; enabled.setAttribute('aria-checked', String(panelEnabled));
    }, 'switch');
    enabled.setAttribute('role', 'switch'); enabled.setAttribute('aria-label', '启用多账号'); enabled.setAttribute('aria-checked', String(panelEnabled));
    session.append(picture, copy, enabled); details.append(session);
    profileUpdaters.push(() => { const nextPicture = avatar('browser'); picture.replaceWith(nextPicture); picture = nextPicture; });
    details.append(el('h3', '用途分配'));
    const assignments = el('div', null, { class: 'card assignments' });
    const symbols = { main: ['person', 'blue'], heartbeat: ['history', 'green'], recommend: ['sparkle', 'purple'], video: ['play', 'orange'] };
    for (const [role, title] of Object.entries(ROLES)) {
      const row = el('div', null, { class: 'setting-row' });
      const tile = el('span', null, { class: `setting-icon ${symbols[role][1]}` }); tile.append(icon(symbols[role][0]));
      row.append(tile, el('span', title, { class: 'setting-label' }), makePicker(role, title)); assignments.append(row);
    }
    details.append(assignments);
    const tools = el('div', null, { class: 'tool-actions', role: 'group', 'aria-label': '账号工具' });
    addTool(tools, '验证取流账号', 'shield', 'green', async () => {
      if (draft.video === '0') { notice('当前使用匿名取流'); return; }
      const account = state.accounts.find(a => a.mid === draft.video);
      let data;
      if (draft.video === 'browser') {
        const identity = await detectBrowserAccount();
        if (identity.status !== 'loggedIn') throw new Error('当前未登录');
        data = { uname: identity.name, vipStatus: identity.vip ? 1 : 0 };
      } else {
        if (!account) throw new Error('请选择取流账号');
        data = await verify(account); saveProfile(account.mid, data); save(); refreshAccountChoices?.();
      }
      notice(`${data.uname || displayName(draft.video)} · ${Number(data.vipStatus ?? data.vip?.status) === 1 ? '大会员有效' : '登录有效'}`);
    });
    addTool(tools, '同步播放器账号', 'play', 'blue', async () => {
      if (draft.video !== state.roles.video || panelEnabled !== state.enabled) throw new Error('请先保存设置');
      notice('正在同步…'); const mid = await refreshPlayerAccess(); notice(`${displayName(String(mid || '0'))} · 已同步`);
    });
    addTool(tools, '更新账号信息', 'refresh', 'purple', async () => {
      await detectBrowserAccount(); await refreshAccountProfiles(true); refreshAccountChoices?.(); notice('已更新');
    });
    content.append(tools);
    const noticeSlot = el('div', null, { class: 'notice-slot' });
    statusBox = el('div', null, { class: 'notice', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true', hidden: '' }); noticeSlot.append(statusBox);
    content.append(noticeSlot);
    const footer = el('div', null, { class: 'footer' }); footer.append(button('取消', () => dialog.close(), 'action'), button('保存并刷新', saveAndReload, 'action primary')); sheet.append(footer);
    dialog.append(sheet);
    refreshAccountChoices = () => {
      for (const update of profileUpdaters) update();
      accountMenu?.update();
    };
    updateBrowserInfo();
  }


  async function verify(account) {
    const route = { url: new URL('https://api.bilibili.com/x/web-interface/nav'),
      path: '/x/web-interface/nav', role: 'main', mid: account.mid, account };
    const r = await transport(route).promise;
    if (r.status !== 200) throw new Error(`校验失败：HTTP ${r.status}`);
    const data = JSON.parse(new TextDecoder().decode(r.response));
    if (data.code !== 0 || !data.data?.isLogin) throw new Error(`登录失效或 Cookie 未成功发送（code ${data.code}），请更新 Cookie / Tampermonkey。`);
    if (String(data.data.mid) !== account.mid) throw new Error('校验返回 UID 不匹配，请检查 Tampermonkey 的 Cookie 隔离支持。');
    return data.data;
  }
  // BEGIN BUNDLED LOGIN VENDORS
  // Generated from vendor/ by bundle-login-vendor.ps1. Do not edit this region.
  // https://github.com/travist/jsencrypt (3.5.4)
  /*
File: /src/LICENSE.txt
The MIT License (MIT)
Copyright (c) 2015 Form.io

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in the
Software without restriction, including without limitation the rights to use,
copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the
Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

File: /lib/jsrsasign/LICENSE.txt


CONTAINS CODE FROM YUI LIBRARY SEE LICENSE @ http://yuilibrary.com/license/

The 'jsrsasign'(RSA-Sign JavaScript Library) License

Copyright (c) 2010-2013 Kenji Urushima

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
File: /lib/jsbn/LICENSE.txt


Licensing
---------

This software is covered under the following copyright:

/*
 * Copyright (c) 2003-2005  Tom Wu
 * All Rights Reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining
 * a copy of this software and associated documentation files (the
 * "Software"), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to
 * the following conditions:
 *
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS-IS" AND WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS, IMPLIED OR OTHERWISE, INCLUDING WITHOUT LIMITATION, ANY
 * WARRANTY OF MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE.
 *
 * IN NO EVENT SHALL TOM WU BE LIABLE FOR ANY SPECIAL, INCIDENTAL,
 * INDIRECT OR CONSEQUENTIAL DAMAGES OF ANY KIND, OR ANY DAMAGES WHATSOEVER
 * RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER OR NOT ADVISED OF
 * THE POSSIBILITY OF DAMAGE, AND ON ANY THEORY OF LIABILITY, ARISING OUT
 * OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * In addition, the following condition applies:
 *
 * All redistributions must retain an intact copy of this copyright notice
 * and disclaimer.
 * /

Address all questions regarding this license to:

  Tom Wu
  tjw@cs.Stanford.EDU
File: /lib/asn1js/LICENSE.txt


ASN.1 JavaScript decoder
Copyright (c) 2008-2013 Lapo Luchini <lapo@lapo.it>

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
  */
  function createLoginRSA() {
    const module = { exports: {} }; const exports = module.exports; const define = undefined;
!function(t,e){"object"==typeof exports&&"object"==typeof module?module.exports=e():"function"==typeof define&&define.amd?define([],e):"object"==typeof exports?exports.JSEncrypt=e():t.JSEncrypt=e()}(this,function(){return function(){var t={606:function(t){var e,r,i=t.exports={};function n(){throw new Error("setTimeout has not been defined")}function s(){throw new Error("clearTimeout has not been defined")}function o(t){if(e===setTimeout)return setTimeout(t,0);if((e===n||!e)&&setTimeout)return e=setTimeout,setTimeout(t,0);try{return e(t,0)}catch(r){try{return e.call(null,t,0)}catch(r){return e.call(this,t,0)}}}!function(){try{e="function"==typeof setTimeout?setTimeout:n}catch(t){e=n}try{r="function"==typeof clearTimeout?clearTimeout:s}catch(t){r=s}}();var h,a=[],u=!1,c=-1;function f(){u&&h&&(u=!1,h.length?a=h.concat(a):c=-1,a.length&&l())}function l(){if(!u){var t=o(f);u=!0;for(var e=a.length;e;){for(h=a,a=[];++c<e;)h&&h[c].run();c=-1,e=a.length}h=null,u=!1,function(t){if(r===clearTimeout)return clearTimeout(t);if((r===s||!r)&&clearTimeout)return r=clearTimeout,clearTimeout(t);try{return r(t)}catch(e){try{return r.call(null,t)}catch(e){return r.call(this,t)}}}(t)}}function p(t,e){this.fun=t,this.array=e}function g(){}i.nextTick=function(t){var e=new Array(arguments.length-1);if(arguments.length>1)for(var r=1;r<arguments.length;r++)e[r-1]=arguments[r];a.push(new p(t,e)),1!==a.length||u||o(l)},p.prototype.run=function(){this.fun.apply(null,this.array)},i.title="browser",i.browser=!0,i.env={},i.argv=[],i.version="",i.versions={},i.on=g,i.addListener=g,i.once=g,i.off=g,i.removeListener=g,i.removeAllListeners=g,i.emit=g,i.prependListener=g,i.prependOnceListener=g,i.listeners=function(t){return[]},i.binding=function(t){throw new Error("process.binding is not supported")},i.cwd=function(){return"/"},i.chdir=function(t){throw new Error("process.chdir is not supported")},i.umask=function(){return 0}}},e={};function r(i){var n=e[i];if(void 0!==n)return n.exports;var s=e[i]={exports:{}};return t[i](s,s.exports,r),s.exports}r.d=function(t,e){for(var i in e)r.o(e,i)&&!r.o(t,i)&&Object.defineProperty(t,i,{enumerable:!0,get:e[i]})},r.o=function(t,e){return Object.prototype.hasOwnProperty.call(t,e)};var i={};return function(){"use strict";r.d(i,{default:function(){return Et}});function t(t){return"0123456789abcdefghijklmnopqrstuvwxyz".charAt(t)}function e(t,e){return t&e}function n(t,e){return t|e}function s(t,e){return t^e}function o(t,e){return t&~e}function h(t){if(0==t)return-1;var e=0;return 65535&t||(t>>=16,e+=16),255&t||(t>>=8,e+=8),15&t||(t>>=4,e+=4),3&t||(t>>=2,e+=2),1&t||++e,e}function a(t){for(var e=0;0!=t;)t&=t-1,++e;return e}var u,c="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";function f(t){var e,r,i="";for(e=0;e+3<=t.length;e+=3)r=parseInt(t.substring(e,e+3),16),i+=c.charAt(r>>6)+c.charAt(63&r);for(e+1==t.length?(r=parseInt(t.substring(e,e+1),16),i+=c.charAt(r<<2)):e+2==t.length&&(r=parseInt(t.substring(e,e+2),16),i+=c.charAt(r>>2)+c.charAt((3&r)<<4));(3&i.length)>0;)i+="=";return i}function l(e){var r,i="",n=0,s=0;for(r=0;r<e.length&&"="!=e.charAt(r);++r){var o=c.indexOf(e.charAt(r));o<0||(0==n?(i+=t(o>>2),s=3&o,n=1):1==n?(i+=t(s<<2|o>>4),s=15&o,n=2):2==n?(i+=t(s),i+=t(o>>2),s=3&o,n=3):(i+=t(s<<2|o>>4),i+=t(15&o),n=0))}return 1==n&&(i+=t(s<<2)),i}var p,g=function(t){var e;if(void 0===u){var r="0123456789ABCDEF",i=" \f\n\r\t \u2028\u2029";for(u={},e=0;e<16;++e)u[r.charAt(e)]=e;for(r=r.toLowerCase(),e=10;e<16;++e)u[r.charAt(e)]=e;for(e=0;e<8;++e)u[i.charAt(e)]=-1}var n=[],s=0,o=0;for(e=0;e<t.length;++e){var h=t.charAt(e);if("="==h)break;if(-1!=(h=u[h])){if(void 0===h)throw new Error("Illegal character at offset "+e);s|=h,++o>=2?(n[n.length]=s,s=0,o=0):s<<=4}}if(o)throw new Error("Hex encoding incomplete: 4 bits missing");return n},d={decode:function(t){var e;if(void 0===p){var r="= \f\n\r\t \u2028\u2029";for(p=Object.create(null),e=0;e<64;++e)p["ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".charAt(e)]=e;for(p["-"]=62,p._=63,e=0;e<9;++e)p[r.charAt(e)]=-1}var i=[],n=0,s=0;for(e=0;e<t.length;++e){var o=t.charAt(e);if("="==o)break;if(-1!=(o=p[o])){if(void 0===o)throw new Error("Illegal character at offset "+e);n|=o,++s>=4?(i[i.length]=n>>16,i[i.length]=n>>8&255,i[i.length]=255&n,n=0,s=0):n<<=6}}switch(s){case 1:throw new Error("Base64 encoding incomplete: at least 2 bits missing");case 2:i[i.length]=n>>10;break;case 3:i[i.length]=n>>16,i[i.length]=n>>8&255}return i},re:/-----BEGIN [^-]+-----([A-Za-z0-9+\/=\s]+)-----END [^-]+-----|begin-base64[^\n]+\n([A-Za-z0-9+\/=\s]+)====/,unarmor:function(t){var e=d.re.exec(t);if(e)if(e[1])t=e[1];else{if(!e[2])throw new Error("RegExp out of sync");t=e[2]}return d.decode(t)}},v=1e13,y=function(){function t(t){this.buf=[+t||0]}return t.prototype.mulAdd=function(t,e){var r,i,n=this.buf,s=n.length;for(r=0;r<s;++r)(i=n[r]*t+e)<v?e=0:i-=(e=0|i/v)*v,n[r]=i;e>0&&(n[r]=e)},t.prototype.sub=function(t){var e,r,i=this.buf,n=i.length;for(e=0;e<n;++e)(r=i[e]-t)<0?(r+=v,t=1):t=0,i[e]=r;for(;0===i[i.length-1];)i.pop()},t.prototype.toString=function(t){if(10!=(t||10))throw new Error("only base 10 is supported");for(var e=this.buf,r=e[e.length-1].toString(),i=e.length-2;i>=0;--i)r+=(v+e[i]).toString().substring(1);return r},t.prototype.valueOf=function(){for(var t=this.buf,e=0,r=t.length-1;r>=0;--r)e=e*v+t[r];return e},t.prototype.simplify=function(){var t=this.buf;return 1==t.length?t[0]:this},t}(),m=/^(\d\d)(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])([01]\d|2[0-3])(?:([0-5]\d)(?:([0-5]\d)(?:[.,](\d{1,3}))?)?)?(Z|[-+](?:[0]\d|1[0-2])([0-5]\d)?)?$/,b=/^(\d\d\d\d)(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])([01]\d|2[0-3])(?:([0-5]\d)(?:([0-5]\d)(?:[.,](\d{1,3}))?)?)?(Z|[-+](?:[0]\d|1[0-2])([0-5]\d)?)?$/;function T(t,e){return t.length>e&&(t=t.substring(0,e)+"…"),t}var S,E=function(){function t(e,r){this.hexDigits="0123456789ABCDEF",e instanceof t?(this.enc=e.enc,this.pos=e.pos):(this.enc=e,this.pos=r)}return t.prototype.get=function(t){if(void 0===t&&(t=this.pos++),t>=this.enc.length)throw new Error("Requesting byte offset ".concat(t," on a stream of length ").concat(this.enc.length));return"string"==typeof this.enc?this.enc.charCodeAt(t):this.enc[t]},t.prototype.hexByte=function(t){return this.hexDigits.charAt(t>>4&15)+this.hexDigits.charAt(15&t)},t.prototype.hexDump=function(t,e,r){for(var i="",n=t;n<e;++n)if(i+=this.hexByte(this.get(n)),!0!==r)switch(15&n){case 7:i+="  ";break;case 15:i+="\n";break;default:i+=" "}return i},t.prototype.isASCII=function(t,e){for(var r=t;r<e;++r){var i=this.get(r);if(i<32||i>176)return!1}return!0},t.prototype.parseStringISO=function(t,e){for(var r="",i=t;i<e;++i)r+=String.fromCharCode(this.get(i));return r},t.prototype.parseStringUTF=function(t,e){for(var r="",i=t;i<e;){var n=this.get(i++);r+=n<128?String.fromCharCode(n):n>191&&n<224?String.fromCharCode((31&n)<<6|63&this.get(i++)):String.fromCharCode((15&n)<<12|(63&this.get(i++))<<6|63&this.get(i++))}return r},t.prototype.parseStringBMP=function(t,e){for(var r,i,n="",s=t;s<e;)r=this.get(s++),i=this.get(s++),n+=String.fromCharCode(r<<8|i);return n},t.prototype.parseTime=function(t,e,r){var i=this.parseStringISO(t,e),n=(r?m:b).exec(i);return n?(r&&(n[1]=+n[1],n[1]+=+n[1]<70?2e3:1900),i=n[1]+"-"+n[2]+"-"+n[3]+" "+n[4],n[5]&&(i+=":"+n[5],n[6]&&(i+=":"+n[6],n[7]&&(i+="."+n[7]))),n[8]&&(i+=" UTC","Z"!=n[8]&&(i+=n[8],n[9]&&(i+=":"+n[9]))),i):"Unrecognized time: "+i},t.prototype.parseInteger=function(t,e){for(var r,i=this.get(t),n=i>127,s=n?255:0,o="";i==s&&++t<e;)i=this.get(t);if(0===(r=e-t))return n?-1:0;if(r>4){for(o=i,r<<=3;!(128&(+o^s));)o=+o<<1,--r;o="("+r+" bit)\n"}n&&(i-=256);for(var h=new y(i),a=t+1;a<e;++a)h.mulAdd(256,this.get(a));return o+h.toString()},t.prototype.parseBitString=function(t,e,r){for(var i=this.get(t),n="("+((e-t-1<<3)-i)+" bit)\n",s="",o=t+1;o<e;++o){for(var h=this.get(o),a=o==e-1?i:0,u=7;u>=a;--u)s+=h>>u&1?"1":"0";if(s.length>r)return n+T(s,r)}return n+s},t.prototype.parseOctetString=function(t,e,r){if(this.isASCII(t,e))return T(this.parseStringISO(t,e),r);var i=e-t,n="("+i+" byte)\n";i>(r/=2)&&(e=t+r);for(var s=t;s<e;++s)n+=this.hexByte(this.get(s));return i>r&&(n+="…"),n},t.prototype.parseOID=function(t,e,r){for(var i="",n=new y,s=0,o=t;o<e;++o){var h=this.get(o);if(n.mulAdd(128,127&h),s+=7,!(128&h)){if(""===i)if((n=n.simplify())instanceof y)n.sub(80),i="2."+n.toString();else{var a=n<80?n<40?0:1:2;i=a+"."+(n-40*a)}else i+="."+n.toString();if(i.length>r)return T(i,r);n=new y,s=0}}return s>0&&(i+=".incomplete"),i},t}(),w=function(){function t(t,e,r,i,n){if(!(i instanceof D))throw new Error("Invalid tag value.");this.stream=t,this.header=e,this.length=r,this.tag=i,this.sub=n}return t.prototype.typeName=function(){switch(this.tag.tagClass){case 0:switch(this.tag.tagNumber){case 0:return"EOC";case 1:return"BOOLEAN";case 2:return"INTEGER";case 3:return"BIT_STRING";case 4:return"OCTET_STRING";case 5:return"NULL";case 6:return"OBJECT_IDENTIFIER";case 7:return"ObjectDescriptor";case 8:return"EXTERNAL";case 9:return"REAL";case 10:return"ENUMERATED";case 11:return"EMBEDDED_PDV";case 12:return"UTF8String";case 16:return"SEQUENCE";case 17:return"SET";case 18:return"NumericString";case 19:return"PrintableString";case 20:return"TeletexString";case 21:return"VideotexString";case 22:return"IA5String";case 23:return"UTCTime";case 24:return"GeneralizedTime";case 25:return"GraphicString";case 26:return"VisibleString";case 27:return"GeneralString";case 28:return"UniversalString";case 30:return"BMPString"}return"Universal_"+this.tag.tagNumber.toString();case 1:return"Application_"+this.tag.tagNumber.toString();case 2:return"["+this.tag.tagNumber.toString()+"]";case 3:return"Private_"+this.tag.tagNumber.toString()}},t.prototype.content=function(t){if(void 0===this.tag)return null;void 0===t&&(t=1/0);var e=this.posContent(),r=Math.abs(this.length);if(!this.tag.isUniversal())return null!==this.sub?"("+this.sub.length+" elem)":this.stream.parseOctetString(e,e+r,t);switch(this.tag.tagNumber){case 1:return 0===this.stream.get(e)?"false":"true";case 2:return this.stream.parseInteger(e,e+r);case 3:return this.sub?"("+this.sub.length+" elem)":this.stream.parseBitString(e,e+r,t);case 4:return this.sub?"("+this.sub.length+" elem)":this.stream.parseOctetString(e,e+r,t);case 6:return this.stream.parseOID(e,e+r,t);case 16:case 17:return null!==this.sub?"("+this.sub.length+" elem)":"(no elem)";case 12:return T(this.stream.parseStringUTF(e,e+r),t);case 18:case 19:case 20:case 21:case 22:case 26:return T(this.stream.parseStringISO(e,e+r),t);case 30:return T(this.stream.parseStringBMP(e,e+r),t);case 23:case 24:return this.stream.parseTime(e,e+r,23==this.tag.tagNumber)}return null},t.prototype.toString=function(){return this.typeName()+"@"+this.stream.pos+"[header:"+this.header+",length:"+this.length+",sub:"+(null===this.sub?"null":this.sub.length)+"]"},t.prototype.toPrettyString=function(t){void 0===t&&(t="");var e=t+this.typeName()+" @"+this.stream.pos;if(this.length>=0&&(e+="+"),e+=this.length,this.tag.tagConstructed?e+=" (constructed)":!this.tag.isUniversal()||3!=this.tag.tagNumber&&4!=this.tag.tagNumber||null===this.sub||(e+=" (encapsulates)"),e+="\n",null!==this.sub){t+="  ";for(var r=0,i=this.sub.length;r<i;++r)e+=this.sub[r].toPrettyString(t)}return e},t.prototype.posStart=function(){return this.stream.pos},t.prototype.posContent=function(){return this.stream.pos+this.header},t.prototype.posEnd=function(){return this.stream.pos+this.header+Math.abs(this.length)},t.prototype.toHexString=function(){return this.stream.hexDump(this.posStart(),this.posEnd(),!0)},t.decodeLength=function(t){var e=t.get(),r=127&e;if(r==e)return r;if(r>6)throw new Error("Length over 48 bits not supported at position "+(t.pos-1));if(0===r)return null;e=0;for(var i=0;i<r;++i)e=256*e+t.get();return e},t.prototype.getHexStringValue=function(){var t=this.toHexString(),e=2*this.header,r=2*this.length;return t.substring(e,e+r)},t.decode=function(e){var r;r=e instanceof E?e:new E(e,0);var i=new E(r),n=new D(r),s=t.decodeLength(r),o=r.pos,h=o-i.pos,a=null,u=function(){var e=[];if(null!==s){for(var i=o+s;r.pos<i;)e[e.length]=t.decode(r);if(r.pos!=i)throw new Error("Content size is not correct for container starting at offset "+o)}else try{for(;;){var n=t.decode(r);if(n.tag.isEOC())break;e[e.length]=n}s=o-r.pos}catch(t){throw new Error("Exception while decoding undefined length content: "+t)}return e};if(n.tagConstructed)a=u();else if(n.isUniversal()&&(3==n.tagNumber||4==n.tagNumber))try{if(3==n.tagNumber&&0!=r.get())throw new Error("BIT STRINGs with unused bits cannot encapsulate.");a=u();for(var c=0;c<a.length;++c)if(a[c].tag.isEOC())throw new Error("EOC is not supposed to be actual content.")}catch(t){a=null}if(null===a){if(null===s)throw new Error("We can't skip over an invalid tag with undefined length at offset "+o);r.pos=o+Math.abs(s)}return new t(i,h,s,n,a)},t}(),D=function(){function t(t){var e=t.get();if(this.tagClass=e>>6,this.tagConstructed=!!(32&e),this.tagNumber=31&e,31==this.tagNumber){var r=new y;do{e=t.get(),r.mulAdd(128,127&e)}while(128&e);this.tagNumber=r.simplify()}}return t.prototype.isUniversal=function(){return 0===this.tagClass},t.prototype.isEOC=function(){return 0===this.tagClass&&0===this.tagNumber},t}(),x=[2,3,5,7,11,13,17,19,23,29,31,37,41,43,47,53,59,61,67,71,73,79,83,89,97,101,103,107,109,113,127,131,137,139,149,151,157,163,167,173,179,181,191,193,197,199,211,223,227,229,233,239,241,251,257,263,269,271,277,281,283,293,307,311,313,317,331,337,347,349,353,359,367,373,379,383,389,397,401,409,419,421,431,433,439,443,449,457,461,463,467,479,487,491,499,503,509,521,523,541,547,557,563,569,571,577,587,593,599,601,607,613,617,619,631,641,643,647,653,659,661,673,677,683,691,701,709,719,727,733,739,743,751,757,761,769,773,787,797,809,811,821,823,827,829,839,853,857,859,863,877,881,883,887,907,911,919,929,937,941,947,953,967,971,977,983,991,997],R=(1<<26)/x[x.length-1],A=function(){function r(t,e,r){null!=t&&("number"==typeof t?this.fromNumber(t,e,r):null==e&&"string"!=typeof t?this.fromString(t,256):this.fromString(t,e))}return r.prototype.toString=function(e){if(this.s<0)return"-"+this.negate().toString(e);var r;if(16==e)r=4;else if(8==e)r=3;else if(2==e)r=1;else if(32==e)r=5;else{if(4!=e)return this.toRadix(e);r=2}var i,n=(1<<r)-1,s=!1,o="",h=this.t,a=this.DB-h*this.DB%r;if(h-- >0)for(a<this.DB&&(i=this[h]>>a)>0&&(s=!0,o=t(i));h>=0;)a<r?(i=(this[h]&(1<<a)-1)<<r-a,i|=this[--h]>>(a+=this.DB-r)):(i=this[h]>>(a-=r)&n,a<=0&&(a+=this.DB,--h)),i>0&&(s=!0),s&&(o+=t(i));return s?o:"0"},r.prototype.negate=function(){var t=N();return r.ZERO.subTo(this,t),t},r.prototype.abs=function(){return this.s<0?this.negate():this},r.prototype.compareTo=function(t){var e=this.s-t.s;if(0!=e)return e;var r=this.t;if(0!=(e=r-t.t))return this.s<0?-e:e;for(;--r>=0;)if(0!=(e=this[r]-t[r]))return e;return 0},r.prototype.bitLength=function(){return this.t<=0?0:this.DB*(this.t-1)+F(this[this.t-1]^this.s&this.DM)},r.prototype.mod=function(t){var e=N();return this.abs().divRemTo(t,null,e),this.s<0&&e.compareTo(r.ZERO)>0&&t.subTo(e,e),e},r.prototype.modPowInt=function(t,e){var r;return r=t<256||e.isEven()?new O(e):new V(e),this.exp(t,r)},r.prototype.clone=function(){var t=N();return this.copyTo(t),t},r.prototype.intValue=function(){if(this.s<0){if(1==this.t)return this[0]-this.DV;if(0==this.t)return-1}else{if(1==this.t)return this[0];if(0==this.t)return 0}return(this[1]&(1<<32-this.DB)-1)<<this.DB|this[0]},r.prototype.byteValue=function(){return 0==this.t?this.s:this[0]<<24>>24},r.prototype.shortValue=function(){return 0==this.t?this.s:this[0]<<16>>16},r.prototype.signum=function(){return this.s<0?-1:this.t<=0||1==this.t&&this[0]<=0?0:1},r.prototype.toByteArray=function(){var t=this.t,e=[];e[0]=this.s;var r,i=this.DB-t*this.DB%8,n=0;if(t-- >0)for(i<this.DB&&(r=this[t]>>i)!=(this.s&this.DM)>>i&&(e[n++]=r|this.s<<this.DB-i);t>=0;)i<8?(r=(this[t]&(1<<i)-1)<<8-i,r|=this[--t]>>(i+=this.DB-8)):(r=this[t]>>(i-=8)&255,i<=0&&(i+=this.DB,--t)),128&r&&(r|=-256),0==n&&(128&this.s)!=(128&r)&&++n,(n>0||r!=this.s)&&(e[n++]=r);return e},r.prototype.equals=function(t){return 0==this.compareTo(t)},r.prototype.min=function(t){return this.compareTo(t)<0?this:t},r.prototype.max=function(t){return this.compareTo(t)>0?this:t},r.prototype.and=function(t){var r=N();return this.bitwiseTo(t,e,r),r},r.prototype.or=function(t){var e=N();return this.bitwiseTo(t,n,e),e},r.prototype.xor=function(t){var e=N();return this.bitwiseTo(t,s,e),e},r.prototype.andNot=function(t){var e=N();return this.bitwiseTo(t,o,e),e},r.prototype.not=function(){for(var t=N(),e=0;e<this.t;++e)t[e]=this.DM&~this[e];return t.t=this.t,t.s=~this.s,t},r.prototype.shiftLeft=function(t){var e=N();return t<0?this.rShiftTo(-t,e):this.lShiftTo(t,e),e},r.prototype.shiftRight=function(t){var e=N();return t<0?this.lShiftTo(-t,e):this.rShiftTo(t,e),e},r.prototype.getLowestSetBit=function(){for(var t=0;t<this.t;++t)if(0!=this[t])return t*this.DB+h(this[t]);return this.s<0?this.t*this.DB:-1},r.prototype.bitCount=function(){for(var t=0,e=this.s&this.DM,r=0;r<this.t;++r)t+=a(this[r]^e);return t},r.prototype.testBit=function(t){var e=Math.floor(t/this.DB);return e>=this.t?0!=this.s:!!(this[e]&1<<t%this.DB)},r.prototype.setBit=function(t){return this.changeBit(t,n)},r.prototype.clearBit=function(t){return this.changeBit(t,o)},r.prototype.flipBit=function(t){return this.changeBit(t,s)},r.prototype.add=function(t){var e=N();return this.addTo(t,e),e},r.prototype.subtract=function(t){var e=N();return this.subTo(t,e),e},r.prototype.multiply=function(t){var e=N();return this.multiplyTo(t,e),e},r.prototype.divide=function(t){var e=N();return this.divRemTo(t,e,null),e},r.prototype.remainder=function(t){var e=N();return this.divRemTo(t,null,e),e},r.prototype.divideAndRemainder=function(t){var e=N(),r=N();return this.divRemTo(t,e,r),[e,r]},r.prototype.modPow=function(t,e){var r,i,n=t.bitLength(),s=H(1);if(n<=0)return s;r=n<18?1:n<48?3:n<144?4:n<768?5:6,i=n<8?new O(e):e.isEven()?new I(e):new V(e);var o=[],h=3,a=r-1,u=(1<<r)-1;if(o[1]=i.convert(this),r>1){var c=N();for(i.sqrTo(o[1],c);h<=u;)o[h]=N(),i.mulTo(c,o[h-2],o[h]),h+=2}var f,l,p=t.t-1,g=!0,d=N();for(n=F(t[p])-1;p>=0;){for(n>=a?f=t[p]>>n-a&u:(f=(t[p]&(1<<n+1)-1)<<a-n,p>0&&(f|=t[p-1]>>this.DB+n-a)),h=r;!(1&f);)f>>=1,--h;if((n-=h)<0&&(n+=this.DB,--p),g)o[f].copyTo(s),g=!1;else{for(;h>1;)i.sqrTo(s,d),i.sqrTo(d,s),h-=2;h>0?i.sqrTo(s,d):(l=s,s=d,d=l),i.mulTo(d,o[f],s)}for(;p>=0&&!(t[p]&1<<n);)i.sqrTo(s,d),l=s,s=d,d=l,--n<0&&(n=this.DB-1,--p)}return i.revert(s)},r.prototype.modInverse=function(t){var e=t.isEven();if(this.isEven()&&e||0==t.signum())return r.ZERO;for(var i=t.clone(),n=this.clone(),s=H(1),o=H(0),h=H(0),a=H(1);0!=i.signum();){for(;i.isEven();)i.rShiftTo(1,i),e?(s.isEven()&&o.isEven()||(s.addTo(this,s),o.subTo(t,o)),s.rShiftTo(1,s)):o.isEven()||o.subTo(t,o),o.rShiftTo(1,o);for(;n.isEven();)n.rShiftTo(1,n),e?(h.isEven()&&a.isEven()||(h.addTo(this,h),a.subTo(t,a)),h.rShiftTo(1,h)):a.isEven()||a.subTo(t,a),a.rShiftTo(1,a);i.compareTo(n)>=0?(i.subTo(n,i),e&&s.subTo(h,s),o.subTo(a,o)):(n.subTo(i,n),e&&h.subTo(s,h),a.subTo(o,a))}return 0!=n.compareTo(r.ONE)?r.ZERO:a.compareTo(t)>=0?a.subtract(t):a.signum()<0?(a.addTo(t,a),a.signum()<0?a.add(t):a):a},r.prototype.pow=function(t){return this.exp(t,new B)},r.prototype.gcd=function(t){var e=this.s<0?this.negate():this.clone(),r=t.s<0?t.negate():t.clone();if(e.compareTo(r)<0){var i=e;e=r,r=i}var n=e.getLowestSetBit(),s=r.getLowestSetBit();if(s<0)return e;for(n<s&&(s=n),s>0&&(e.rShiftTo(s,e),r.rShiftTo(s,r));e.signum()>0;)(n=e.getLowestSetBit())>0&&e.rShiftTo(n,e),(n=r.getLowestSetBit())>0&&r.rShiftTo(n,r),e.compareTo(r)>=0?(e.subTo(r,e),e.rShiftTo(1,e)):(r.subTo(e,r),r.rShiftTo(1,r));return s>0&&r.lShiftTo(s,r),r},r.prototype.isProbablePrime=function(t){var e,r=this.abs();if(1==r.t&&r[0]<=x[x.length-1]){for(e=0;e<x.length;++e)if(r[0]==x[e])return!0;return!1}if(r.isEven())return!1;for(e=1;e<x.length;){for(var i=x[e],n=e+1;n<x.length&&i<R;)i*=x[n++];for(i=r.modInt(i);e<n;)if(i%x[e++]==0)return!1}return r.millerRabin(t)},r.prototype.copyTo=function(t){for(var e=this.t-1;e>=0;--e)t[e]=this[e];t.t=this.t,t.s=this.s},r.prototype.fromInt=function(t){this.t=1,this.s=t<0?-1:0,t>0?this[0]=t:t<-1?this[0]=t+this.DV:this.t=0},r.prototype.fromString=function(t,e){var i;if(16==e)i=4;else if(8==e)i=3;else if(256==e)i=8;else if(2==e)i=1;else if(32==e)i=5;else{if(4!=e)return void this.fromRadix(t,e);i=2}this.t=0,this.s=0;for(var n=t.length,s=!1,o=0;--n>=0;){var h=8==i?255&+t[n]:C(t,n);h<0?"-"==t.charAt(n)&&(s=!0):(s=!1,0==o?this[this.t++]=h:o+i>this.DB?(this[this.t-1]|=(h&(1<<this.DB-o)-1)<<o,this[this.t++]=h>>this.DB-o):this[this.t-1]|=h<<o,(o+=i)>=this.DB&&(o-=this.DB))}8==i&&128&+t[0]&&(this.s=-1,o>0&&(this[this.t-1]|=(1<<this.DB-o)-1<<o)),this.clamp(),s&&r.ZERO.subTo(this,this)},r.prototype.clamp=function(){for(var t=this.s&this.DM;this.t>0&&this[this.t-1]==t;)--this.t},r.prototype.dlShiftTo=function(t,e){var r;for(r=this.t-1;r>=0;--r)e[r+t]=this[r];for(r=t-1;r>=0;--r)e[r]=0;e.t=this.t+t,e.s=this.s},r.prototype.drShiftTo=function(t,e){for(var r=t;r<this.t;++r)e[r-t]=this[r];e.t=Math.max(this.t-t,0),e.s=this.s},r.prototype.lShiftTo=function(t,e){for(var r=t%this.DB,i=this.DB-r,n=(1<<i)-1,s=Math.floor(t/this.DB),o=this.s<<r&this.DM,h=this.t-1;h>=0;--h)e[h+s+1]=this[h]>>i|o,o=(this[h]&n)<<r;for(h=s-1;h>=0;--h)e[h]=0;e[s]=o,e.t=this.t+s+1,e.s=this.s,e.clamp()},r.prototype.rShiftTo=function(t,e){e.s=this.s;var r=Math.floor(t/this.DB);if(r>=this.t)e.t=0;else{var i=t%this.DB,n=this.DB-i,s=(1<<i)-1;e[0]=this[r]>>i;for(var o=r+1;o<this.t;++o)e[o-r-1]|=(this[o]&s)<<n,e[o-r]=this[o]>>i;i>0&&(e[this.t-r-1]|=(this.s&s)<<n),e.t=this.t-r,e.clamp()}},r.prototype.subTo=function(t,e){for(var r=0,i=0,n=Math.min(t.t,this.t);r<n;)i+=this[r]-t[r],e[r++]=i&this.DM,i>>=this.DB;if(t.t<this.t){for(i-=t.s;r<this.t;)i+=this[r],e[r++]=i&this.DM,i>>=this.DB;i+=this.s}else{for(i+=this.s;r<t.t;)i-=t[r],e[r++]=i&this.DM,i>>=this.DB;i-=t.s}e.s=i<0?-1:0,i<-1?e[r++]=this.DV+i:i>0&&(e[r++]=i),e.t=r,e.clamp()},r.prototype.multiplyTo=function(t,e){var i=this.abs(),n=t.abs(),s=i.t;for(e.t=s+n.t;--s>=0;)e[s]=0;for(s=0;s<n.t;++s)e[s+i.t]=i.am(0,n[s],e,s,0,i.t);e.s=0,e.clamp(),this.s!=t.s&&r.ZERO.subTo(e,e)},r.prototype.squareTo=function(t){for(var e=this.abs(),r=t.t=2*e.t;--r>=0;)t[r]=0;for(r=0;r<e.t-1;++r){var i=e.am(r,e[r],t,2*r,0,1);(t[r+e.t]+=e.am(r+1,2*e[r],t,2*r+1,i,e.t-r-1))>=e.DV&&(t[r+e.t]-=e.DV,t[r+e.t+1]=1)}t.t>0&&(t[t.t-1]+=e.am(r,e[r],t,2*r,0,1)),t.s=0,t.clamp()},r.prototype.divRemTo=function(t,e,i){var n=t.abs();if(!(n.t<=0)){var s=this.abs();if(s.t<n.t)return null!=e&&e.fromInt(0),void(null!=i&&this.copyTo(i));null==i&&(i=N());var o=N(),h=this.s,a=t.s,u=this.DB-F(n[n.t-1]);u>0?(n.lShiftTo(u,o),s.lShiftTo(u,i)):(n.copyTo(o),s.copyTo(i));var c=o.t,f=o[c-1];if(0!=f){var l=f*(1<<this.F1)+(c>1?o[c-2]>>this.F2:0),p=this.FV/l,g=(1<<this.F1)/l,d=1<<this.F2,v=i.t,y=v-c,m=null==e?N():e;for(o.dlShiftTo(y,m),i.compareTo(m)>=0&&(i[i.t++]=1,i.subTo(m,i)),r.ONE.dlShiftTo(c,m),m.subTo(o,o);o.t<c;)o[o.t++]=0;for(;--y>=0;){var b=i[--v]==f?this.DM:Math.floor(i[v]*p+(i[v-1]+d)*g);if((i[v]+=o.am(0,b,i,y,0,c))<b)for(o.dlShiftTo(y,m),i.subTo(m,i);i[v]<--b;)i.subTo(m,i)}null!=e&&(i.drShiftTo(c,e),h!=a&&r.ZERO.subTo(e,e)),i.t=c,i.clamp(),u>0&&i.rShiftTo(u,i),h<0&&r.ZERO.subTo(i,i)}}},r.prototype.invDigit=function(){if(this.t<1)return 0;var t=this[0];if(!(1&t))return 0;var e=3&t;return(e=(e=(e=(e=e*(2-(15&t)*e)&15)*(2-(255&t)*e)&255)*(2-((65535&t)*e&65535))&65535)*(2-t*e%this.DV)%this.DV)>0?this.DV-e:-e},r.prototype.isEven=function(){return 0==(this.t>0?1&this[0]:this.s)},r.prototype.exp=function(t,e){if(t>4294967295||t<1)return r.ONE;var i=N(),n=N(),s=e.convert(this),o=F(t)-1;for(s.copyTo(i);--o>=0;)if(e.sqrTo(i,n),(t&1<<o)>0)e.mulTo(n,s,i);else{var h=i;i=n,n=h}return e.revert(i)},r.prototype.chunkSize=function(t){return Math.floor(Math.LN2*this.DB/Math.log(t))},r.prototype.toRadix=function(t){if(null==t&&(t=10),0==this.signum()||t<2||t>36)return"0";var e=this.chunkSize(t),r=Math.pow(t,e),i=H(r),n=N(),s=N(),o="";for(this.divRemTo(i,n,s);n.signum()>0;)o=(r+s.intValue()).toString(t).substring(1)+o,n.divRemTo(i,n,s);return s.intValue().toString(t)+o},r.prototype.fromRadix=function(t,e){this.fromInt(0),null==e&&(e=10);for(var i=this.chunkSize(e),n=Math.pow(e,i),s=!1,o=0,h=0,a=0;a<t.length;++a){var u=C(t,a);u<0?"-"==t.charAt(a)&&0==this.signum()&&(s=!0):(h=e*h+u,++o>=i&&(this.dMultiply(n),this.dAddOffset(h,0),o=0,h=0))}o>0&&(this.dMultiply(Math.pow(e,o)),this.dAddOffset(h,0)),s&&r.ZERO.subTo(this,this)},r.prototype.fromNumber=function(t,e,i){if("number"==typeof e)if(t<2)this.fromInt(1);else for(this.fromNumber(t,i),this.testBit(t-1)||this.bitwiseTo(r.ONE.shiftLeft(t-1),n,this),this.isEven()&&this.dAddOffset(1,0);!this.isProbablePrime(e);)this.dAddOffset(2,0),this.bitLength()>t&&this.subTo(r.ONE.shiftLeft(t-1),this);else{var s=[],o=7&t;s.length=1+(t>>3),e.nextBytes(s),o>0?s[0]&=(1<<o)-1:s[0]=0,this.fromString(s,256)}},r.prototype.bitwiseTo=function(t,e,r){var i,n,s=Math.min(t.t,this.t);for(i=0;i<s;++i)r[i]=e(this[i],t[i]);if(t.t<this.t){for(n=t.s&this.DM,i=s;i<this.t;++i)r[i]=e(this[i],n);r.t=this.t}else{for(n=this.s&this.DM,i=s;i<t.t;++i)r[i]=e(n,t[i]);r.t=t.t}r.s=e(this.s,t.s),r.clamp()},r.prototype.changeBit=function(t,e){var i=r.ONE.shiftLeft(t);return this.bitwiseTo(i,e,i),i},r.prototype.addTo=function(t,e){for(var r=0,i=0,n=Math.min(t.t,this.t);r<n;)i+=this[r]+t[r],e[r++]=i&this.DM,i>>=this.DB;if(t.t<this.t){for(i+=t.s;r<this.t;)i+=this[r],e[r++]=i&this.DM,i>>=this.DB;i+=this.s}else{for(i+=this.s;r<t.t;)i+=t[r],e[r++]=i&this.DM,i>>=this.DB;i+=t.s}e.s=i<0?-1:0,i>0?e[r++]=i:i<-1&&(e[r++]=this.DV+i),e.t=r,e.clamp()},r.prototype.dMultiply=function(t){this[this.t]=this.am(0,t-1,this,0,0,this.t),++this.t,this.clamp()},r.prototype.dAddOffset=function(t,e){if(0!=t){for(;this.t<=e;)this[this.t++]=0;for(this[e]+=t;this[e]>=this.DV;)this[e]-=this.DV,++e>=this.t&&(this[this.t++]=0),++this[e]}},r.prototype.multiplyLowerTo=function(t,e,r){var i=Math.min(this.t+t.t,e);for(r.s=0,r.t=i;i>0;)r[--i]=0;for(var n=r.t-this.t;i<n;++i)r[i+this.t]=this.am(0,t[i],r,i,0,this.t);for(n=Math.min(t.t,e);i<n;++i)this.am(0,t[i],r,i,0,e-i);r.clamp()},r.prototype.multiplyUpperTo=function(t,e,r){--e;var i=r.t=this.t+t.t-e;for(r.s=0;--i>=0;)r[i]=0;for(i=Math.max(e-this.t,0);i<t.t;++i)r[this.t+i-e]=this.am(e-i,t[i],r,0,0,this.t+i-e);r.clamp(),r.drShiftTo(1,r)},r.prototype.modInt=function(t){if(t<=0)return 0;var e=this.DV%t,r=this.s<0?t-1:0;if(this.t>0)if(0==e)r=this[0]%t;else for(var i=this.t-1;i>=0;--i)r=(e*r+this[i])%t;return r},r.prototype.millerRabin=function(t){var e=this.subtract(r.ONE),i=e.getLowestSetBit();if(i<=0)return!1;var n=e.shiftRight(i);(t=t+1>>1)>x.length&&(t=x.length);for(var s=N(),o=0;o<t;++o){s.fromInt(x[Math.floor(Math.random()*x.length)]);var h=s.modPow(n,this);if(0!=h.compareTo(r.ONE)&&0!=h.compareTo(e)){for(var a=1;a++<i&&0!=h.compareTo(e);)if(0==(h=h.modPowInt(2,this)).compareTo(r.ONE))return!1;if(0!=h.compareTo(e))return!1}}return!0},r.prototype.square=function(){var t=N();return this.squareTo(t),t},r.prototype.gcda=function(t,e){var r=this.s<0?this.negate():this.clone(),i=t.s<0?t.negate():t.clone();if(r.compareTo(i)<0){var n=r;r=i,i=n}var s=r.getLowestSetBit(),o=i.getLowestSetBit();if(o<0)e(r);else{s<o&&(o=s),o>0&&(r.rShiftTo(o,r),i.rShiftTo(o,i));var h=function(){(s=r.getLowestSetBit())>0&&r.rShiftTo(s,r),(s=i.getLowestSetBit())>0&&i.rShiftTo(s,i),r.compareTo(i)>=0?(r.subTo(i,r),r.rShiftTo(1,r)):(i.subTo(r,i),i.rShiftTo(1,i)),r.signum()>0?setTimeout(h,0):(o>0&&i.lShiftTo(o,i),setTimeout(function(){e(i)},0))};setTimeout(h,10)}},r.prototype.fromNumberAsync=function(t,e,i,s){if("number"==typeof e)if(t<2)this.fromInt(1);else{this.fromNumber(t,i),this.testBit(t-1)||this.bitwiseTo(r.ONE.shiftLeft(t-1),n,this),this.isEven()&&this.dAddOffset(1,0);var o=this,h=function(){o.dAddOffset(2,0),o.bitLength()>t&&o.subTo(r.ONE.shiftLeft(t-1),o),o.isProbablePrime(e)?setTimeout(function(){s()},0):setTimeout(h,0)};setTimeout(h,0)}else{var a=[],u=7&t;a.length=1+(t>>3),e.nextBytes(a),u>0?a[0]&=(1<<u)-1:a[0]=0,this.fromString(a,256)}},r}(),B=function(){function t(){}return t.prototype.convert=function(t){return t},t.prototype.revert=function(t){return t},t.prototype.mulTo=function(t,e,r){t.multiplyTo(e,r)},t.prototype.sqrTo=function(t,e){t.squareTo(e)},t}(),O=function(){function t(t){this.m=t}return t.prototype.convert=function(t){return t.s<0||t.compareTo(this.m)>=0?t.mod(this.m):t},t.prototype.revert=function(t){return t},t.prototype.reduce=function(t){t.divRemTo(this.m,null,t)},t.prototype.mulTo=function(t,e,r){t.multiplyTo(e,r),this.reduce(r)},t.prototype.sqrTo=function(t,e){t.squareTo(e),this.reduce(e)},t}(),V=function(){function t(t){this.m=t,this.mp=t.invDigit(),this.mpl=32767&this.mp,this.mph=this.mp>>15,this.um=(1<<t.DB-15)-1,this.mt2=2*t.t}return t.prototype.convert=function(t){var e=N();return t.abs().dlShiftTo(this.m.t,e),e.divRemTo(this.m,null,e),t.s<0&&e.compareTo(A.ZERO)>0&&this.m.subTo(e,e),e},t.prototype.revert=function(t){var e=N();return t.copyTo(e),this.reduce(e),e},t.prototype.reduce=function(t){for(;t.t<=this.mt2;)t[t.t++]=0;for(var e=0;e<this.m.t;++e){var r=32767&t[e],i=r*this.mpl+((r*this.mph+(t[e]>>15)*this.mpl&this.um)<<15)&t.DM;for(t[r=e+this.m.t]+=this.m.am(0,i,t,e,0,this.m.t);t[r]>=t.DV;)t[r]-=t.DV,t[++r]++}t.clamp(),t.drShiftTo(this.m.t,t),t.compareTo(this.m)>=0&&t.subTo(this.m,t)},t.prototype.mulTo=function(t,e,r){t.multiplyTo(e,r),this.reduce(r)},t.prototype.sqrTo=function(t,e){t.squareTo(e),this.reduce(e)},t}(),I=function(){function t(t){this.m=t,this.r2=N(),this.q3=N(),A.ONE.dlShiftTo(2*t.t,this.r2),this.mu=this.r2.divide(t)}return t.prototype.convert=function(t){if(t.s<0||t.t>2*this.m.t)return t.mod(this.m);if(t.compareTo(this.m)<0)return t;var e=N();return t.copyTo(e),this.reduce(e),e},t.prototype.revert=function(t){return t},t.prototype.reduce=function(t){for(t.drShiftTo(this.m.t-1,this.r2),t.t>this.m.t+1&&(t.t=this.m.t+1,t.clamp()),this.mu.multiplyUpperTo(this.r2,this.m.t+1,this.q3),this.m.multiplyLowerTo(this.q3,this.m.t+1,this.r2);t.compareTo(this.r2)<0;)t.dAddOffset(1,this.m.t+1);for(t.subTo(this.r2,t);t.compareTo(this.m)>=0;)t.subTo(this.m,t)},t.prototype.mulTo=function(t,e,r){t.multiplyTo(e,r),this.reduce(r)},t.prototype.sqrTo=function(t,e){t.squareTo(e),this.reduce(e)},t}();function N(){return new A(null)}function P(t,e){return new A(t,e)}var M="undefined"!=typeof navigator;M&&"Microsoft Internet Explorer"==navigator.appName?(A.prototype.am=function(t,e,r,i,n,s){for(var o=32767&e,h=e>>15;--s>=0;){var a=32767&this[t],u=this[t++]>>15,c=h*a+u*o;n=((a=o*a+((32767&c)<<15)+r[i]+(1073741823&n))>>>30)+(c>>>15)+h*u+(n>>>30),r[i++]=1073741823&a}return n},S=30):M&&"Netscape"!=navigator.appName?(A.prototype.am=function(t,e,r,i,n,s){for(;--s>=0;){var o=e*this[t++]+r[i]+n;n=Math.floor(o/67108864),r[i++]=67108863&o}return n},S=26):(A.prototype.am=function(t,e,r,i,n,s){for(var o=16383&e,h=e>>14;--s>=0;){var a=16383&this[t],u=this[t++]>>14,c=h*a+u*o;n=((a=o*a+((16383&c)<<14)+r[i]+n)>>28)+(c>>14)+h*u,r[i++]=268435455&a}return n},S=28),A.prototype.DB=S,A.prototype.DM=(1<<S)-1,A.prototype.DV=1<<S;A.prototype.FV=Math.pow(2,52),A.prototype.F1=52-S,A.prototype.F2=2*S-52;var L,j,q=[];for(L="0".charCodeAt(0),j=0;j<=9;++j)q[L++]=j;for(L="a".charCodeAt(0),j=10;j<36;++j)q[L++]=j;for(L="A".charCodeAt(0),j=10;j<36;++j)q[L++]=j;function C(t,e){var r=q[t.charCodeAt(e)];return null==r?-1:r}function H(t){var e=N();return e.fromInt(t),e}function F(t){var e,r=1;return 0!=(e=t>>>16)&&(t=e,r+=16),0!=(e=t>>8)&&(t=e,r+=8),0!=(e=t>>4)&&(t=e,r+=4),0!=(e=t>>2)&&(t=e,r+=2),0!=(e=t>>1)&&(t=e,r+=1),r}A.ZERO=H(0),A.ONE=H(1);var K=function(){function t(){this.i=0,this.j=0,this.S=[]}return t.prototype.init=function(t){var e,r,i;for(e=0;e<256;++e)this.S[e]=e;for(r=0,e=0;e<256;++e)r=r+this.S[e]+t[e%t.length]&255,i=this.S[e],this.S[e]=this.S[r],this.S[r]=i;this.i=0,this.j=0},t.prototype.next=function(){var t;return this.i=this.i+1&255,this.j=this.j+this.S[this.i]&255,t=this.S[this.i],this.S[this.i]=this.S[this.j],this.S[this.j]=t,this.S[t+this.S[this.i]&255]},t}();var U,k,_=null;if(null==_){_=[],k=0;var z=void 0;if("undefined"!=typeof window&&self.crypto&&self.crypto.getRandomValues){var Z=new Uint32Array(256);for(self.crypto.getRandomValues(Z),z=0;z<Z.length;++z)_[k++]=255&Z[z]}var G=0,$=function(t){if((G=G||0)>=256||k>=256)self.removeEventListener?self.removeEventListener("mousemove",$,!1):self.detachEvent&&self.detachEvent("onmousemove",$);else try{var e=t.x+t.y;_[k++]=255&e,G+=1}catch(t){}};"undefined"!=typeof window&&(self.addEventListener?self.addEventListener("mousemove",$,!1):self.attachEvent&&self.attachEvent("onmousemove",$))}function Y(){if(null==U){for(U=new K;k<256;){var t=Math.floor(65536*Math.random());_[k++]=255&t}for(U.init(_),k=0;k<_.length;++k)_[k]=0;k=0}return U.next()}var J=function(){function t(){}return t.prototype.nextBytes=function(t){for(var e=0;e<t.length;++e)t[e]=Y()},t}();function X(t){return function(t){for(var e="",r=0;r<32*t.length;r+=8)e+=String.fromCharCode(t[r>>5]>>>24-r%32&255);return e}(function(t,e){var r,i,n,s,o,h,a,u,c,f,l,p,g=new Array(1779033703,-1150833019,1013904242,-1521486534,1359893119,-1694144372,528734635,1541459225),d=new Array(64);for(t[e>>5]|=128<<24-e%32,t[15+(e+64>>9<<4)]=e,c=0;c<t.length;c+=16){for(r=g[0],i=g[1],n=g[2],s=g[3],o=g[4],h=g[5],a=g[6],u=g[7],f=0;f<64;f++)d[f]=f<16?t[f+c]:at(at(at(ot(d[f-2]),d[f-7]),st(d[f-15])),d[f-16]),l=at(at(at(at(u,nt(o)),et(o,h,a)),ht[f]),d[f]),p=at(it(r),rt(r,i,n)),u=a,a=h,h=o,o=at(s,l),s=n,n=i,i=r,r=at(l,p);g[0]=at(r,g[0]),g[1]=at(i,g[1]),g[2]=at(n,g[2]),g[3]=at(s,g[3]),g[4]=at(o,g[4]),g[5]=at(h,g[5]),g[6]=at(a,g[6]),g[7]=at(u,g[7])}return g}(function(t){for(var e=Array(t.length>>2),r=0;r<e.length;r++)e[r]=0;for(r=0;r<8*t.length;r+=8)e[r>>5]|=(255&t.charCodeAt(r/8))<<24-r%32;return e}(t),8*t.length))}function Q(t){for(var e="0123456789abcdef",r="",i=0;i<t.length;i++){var n=t.charCodeAt(i);r+=e.charAt(n>>>4&15)+e.charAt(15&n)}return r}function W(t,e){return t>>>e|t<<32-e}function tt(t,e){return t>>>e}function et(t,e,r){return t&e^~t&r}function rt(t,e,r){return t&e^t&r^e&r}function it(t){return W(t,2)^W(t,13)^W(t,22)}function nt(t){return W(t,6)^W(t,11)^W(t,25)}function st(t){return W(t,7)^W(t,18)^tt(t,3)}function ot(t){return W(t,17)^W(t,19)^tt(t,10)}var ht=new Array(1116352408,1899447441,-1245643825,-373957723,961987163,1508970993,-1841331548,-1424204075,-670586216,310598401,607225278,1426881987,1925078388,-2132889090,-1680079193,-1046744716,-459576895,-272742522,264347078,604807628,770255983,1249150122,1555081692,1996064986,-1740746414,-1473132947,-1341970488,-1084653625,-958395405,-710438585,113926993,338241895,666307205,773529912,1294757372,1396182291,1695183700,1986661051,-2117940946,-1838011259,-1564481375,-1474664885,-1035236496,-949202525,-778901479,-694614492,-200395387,275423344,430227734,506948616,659060556,883997877,958139571,1322822218,1537002063,1747873779,1955562222,2024104815,-2067236844,-1933114872,-1866530822,-1538233109,-1090935817,-965641998);function at(t,e){var r=(65535&t)+(65535&e);return(t>>16)+(e>>16)+(r>>16)<<16|65535&r}function ut(t,e){if(e<t.length+11)return console.error("Message too long for RSA"),null;for(var r=[],i=t.length-1;i>=0&&e>0;){var n=t.charCodeAt(i--);n<128?r[--e]=n:n>127&&n<2048?(r[--e]=63&n|128,r[--e]=n>>6|192):(r[--e]=63&n|128,r[--e]=n>>6&63|128,r[--e]=n>>12|224)}r[--e]=0;for(var s=new J,o=[];e>2;){for(o[0]=0;0==o[0];)s.nextBytes(o);r[--e]=o[0]}return r[--e]=2,r[--e]=0,new A(r)}function ct(t,e,r){for(var i="",n=0;i.length<e;)i+=r(String.fromCharCode.apply(String,t.concat([(4278190080&n)>>24,(16711680&n)>>16,(65280&n)>>8,255&n]))),n+=1;return i}function ft(t,e){var r=X;if(t.length+64+2>e)throw"Message too long for RSA";var i,n="";for(i=0;i<e-t.length-64-2;i+=1)n+="\0";var s=r("")+n+""+t,o=new Array(32);(new J).nextBytes(o);var h=ct(o,s.length,r),a=[];for(i=0;i<s.length;i+=1)a[i]=s.charCodeAt(i)^h.charCodeAt(i);var u=ct(a,o.length,r),c=[0];for(i=0;i<o.length;i+=1)c[i+1]=o[i]^u.charCodeAt(i);return new A(c.concat(a))}var lt=function(){function t(){this.n=null,this.e=0,this.d=null,this.p=null,this.q=null,this.dmp1=null,this.dmq1=null,this.coeff=null}return t.prototype.doPublic=function(t){return t.modPowInt(this.e,this.n)},t.prototype.doPrivate=function(t){if(null==this.p||null==this.q)return t.modPow(this.d,this.n);for(var e=t.mod(this.p).modPow(this.dmp1,this.p),r=t.mod(this.q).modPow(this.dmq1,this.q);e.compareTo(r)<0;)e=e.add(this.p);return e.subtract(r).multiply(this.coeff).mod(this.p).multiply(this.q).add(r)},t.prototype.setPublic=function(t,e){null!=t&&null!=e&&t.length>0&&e.length>0?(this.n=P(t,16),this.e=parseInt(e,16)):console.error("Invalid RSA public key")},t.prototype.encrypt=function(t,e){void 0===e&&(e=ut);var r=this.n.bitLength()+7>>3,i=e(t,r);if(null==i)return null;var n=this.doPublic(i);if(null==n)return null;for(var s=n.toString(16),o=s.length,h=0;h<2*r-o;h++)s="0"+s;return s},t.prototype.setPrivate=function(t,e,r){null!=t&&null!=e&&t.length>0&&e.length>0?(this.n=P(t,16),this.e=parseInt(e,16),this.d=P(r,16)):console.error("Invalid RSA private key")},t.prototype.setPrivateEx=function(t,e,r,i,n,s,o,h){null!=t&&null!=e&&t.length>0&&e.length>0?(this.n=P(t,16),this.e=parseInt(e,16),this.d=P(r,16),this.p=P(i,16),this.q=P(n,16),this.dmp1=P(s,16),this.dmq1=P(o,16),this.coeff=P(h,16)):console.error("Invalid RSA private key")},t.prototype.generate=function(t,e){var r=new J,i=t>>1;this.e=parseInt(e,16);for(var n=new A(e,16);;){for(;this.p=new A(t-i,1,r),0!=this.p.subtract(A.ONE).gcd(n).compareTo(A.ONE)||!this.p.isProbablePrime(10););for(;this.q=new A(i,1,r),0!=this.q.subtract(A.ONE).gcd(n).compareTo(A.ONE)||!this.q.isProbablePrime(10););if(this.p.compareTo(this.q)<=0){var s=this.p;this.p=this.q,this.q=s}var o=this.p.subtract(A.ONE),h=this.q.subtract(A.ONE),a=o.multiply(h);if(0==a.gcd(n).compareTo(A.ONE)){this.n=this.p.multiply(this.q),this.d=n.modInverse(a),this.dmp1=this.d.mod(o),this.dmq1=this.d.mod(h),this.coeff=this.q.modInverse(this.p);break}}},t.prototype.decrypt=function(t){var e=P(t,16),r=this.doPrivate(e);return null==r?null:function(t,e){var r=t.toByteArray(),i=0;for(;i<r.length&&0==r[i];)++i;if(r.length-i!=e-1||2!=r[i])return null;++i;for(;0!=r[i];)if(++i>=r.length)return null;var n="";for(;++i<r.length;){var s=255&r[i];s<128?n+=String.fromCharCode(s):s>191&&s<224?(n+=String.fromCharCode((31&s)<<6|63&r[i+1]),++i):(n+=String.fromCharCode((15&s)<<12|(63&r[i+1])<<6|63&r[i+2]),i+=2)}return n}(r,this.n.bitLength()+7>>3)},t.prototype.generateAsync=function(t,e,r){var i=new J,n=t>>1;this.e=parseInt(e,16);var s=new A(e,16),o=this,h=function(){var e=function(){if(o.p.compareTo(o.q)<=0){var t=o.p;o.p=o.q,o.q=t}var e=o.p.subtract(A.ONE),i=o.q.subtract(A.ONE),n=e.multiply(i);0==n.gcd(s).compareTo(A.ONE)?(o.n=o.p.multiply(o.q),o.d=s.modInverse(n),o.dmp1=o.d.mod(e),o.dmq1=o.d.mod(i),o.coeff=o.q.modInverse(o.p),setTimeout(function(){r()},0)):setTimeout(h,0)},a=function(){o.q=N(),o.q.fromNumberAsync(n,1,i,function(){o.q.subtract(A.ONE).gcda(s,function(t){0==t.compareTo(A.ONE)&&o.q.isProbablePrime(10)?setTimeout(e,0):setTimeout(a,0)})})},u=function(){o.p=N(),o.p.fromNumberAsync(t-n,1,i,function(){o.p.subtract(A.ONE).gcda(s,function(t){0==t.compareTo(A.ONE)&&o.p.isProbablePrime(10)?setTimeout(a,0):setTimeout(u,0)})})};setTimeout(u,0)};setTimeout(h,0)},t.prototype.sign=function(t,e,r){var i=(pt[r]||"")+e(t).toString(),n=this.n.bitLength()/4,s=function(t,e){if(e<t.length+22)return console.error("Message too long for RSA"),null;for(var r=e-t.length-6,i="",n=0;n<r;n+=2)i+="ff";return P("0001"+i+"00"+t,16)}(i,n);if(null==s)return null;var o=this.doPrivate(s);if(null==o)return null;for(var h=o.toString(16),a=h.length,u=0;u<n-a;u++)h="0"+h;return h},t.prototype.verify=function(t,e,r){var i=P(e,16),n=this.doPublic(i);return null==n?null:function(t){for(var e in pt)if(pt.hasOwnProperty(e)){var r=pt[e],i=r.length;if(t.substring(0,i)==r)return t.substring(i)}return t}(n.toString(16).replace(/^1f+00/,""))==r(t).toString()},t}();var pt={md2:"3020300c06082a864886f70d020205000410",md5:"3020300c06082a864886f70d020505000410",sha1:"3021300906052b0e03021a05000414",sha224:"302d300d06096086480165030402040500041c",sha256:"3031300d060960864801650304020105000420",sha384:"3041300d060960864801650304020205000430",sha512:"3051300d060960864801650304020305000440",ripemd160:"3021300906052b2403020105000414"};function gt(t,e,r){if(!e||!t)throw new Error("extend failed, please check that all dependencies are included.");var i=function(){};if(i.prototype=e.prototype,t.prototype=new i,t.prototype.constructor=t,t.superclass=e.prototype,e.prototype.constructor==Object.prototype.constructor&&(e.prototype.constructor=e),r){var n;for(n in r)t.prototype[n]=r[n];var s=function(){},o=["toString","valueOf"];try{/MSIE/.test(navigator.userAgent)&&(s=function(t,e){for(n=0;n<o.length;n+=1){var r=o[n],i=e[r];"function"==typeof i&&i!=Object.prototype[r]&&(t[r]=i)}})}catch(t){}s(t.prototype,r)}}var dt={};void 0!==dt.asn1&&dt.asn1||(dt.asn1={}),dt.asn1.ASN1Util=new function(){this.integerToByteHex=function(t){var e=t.toString(16);return e.length%2==1&&(e="0"+e),e},this.bigIntToMinTwosComplementsHex=function(t){var e=t.toString(16);if("-"!=e.substring(0,1))e.length%2==1?e="0"+e:e.match(/^[0-7]/)||(e="00"+e);else{var r=e.substring(1).length;r%2==1?r+=1:e.match(/^[0-7]/)||(r+=2);for(var i="",n=0;n<r;n++)i+="f";e=new A(i,16).xor(t).add(A.ONE).toString(16).replace(/^-/,"")}return e},this.getPEMStringFromHex=function(t,e){return hextopem(t,e)},this.newObject=function(t){var e=dt.asn1,r=e.DERBoolean,i=e.DERInteger,n=e.DERBitString,s=e.DEROctetString,o=e.DERNull,h=e.DERObjectIdentifier,a=e.DEREnumerated,u=e.DERUTF8String,c=e.DERNumericString,f=e.DERPrintableString,l=e.DERTeletexString,p=e.DERIA5String,g=e.DERUTCTime,d=e.DERGeneralizedTime,v=e.DERSequence,y=e.DERSet,m=e.DERTaggedObject,b=e.ASN1Util.newObject,T=Object.keys(t);if(1!=T.length)throw"key of param shall be only one.";var S=T[0];if(-1==":bool:int:bitstr:octstr:null:oid:enum:utf8str:numstr:prnstr:telstr:ia5str:utctime:gentime:seq:set:tag:".indexOf(":"+S+":"))throw"undefined key: "+S;if("bool"==S)return new r(t[S]);if("int"==S)return new i(t[S]);if("bitstr"==S)return new n(t[S]);if("octstr"==S)return new s(t[S]);if("null"==S)return new o(t[S]);if("oid"==S)return new h(t[S]);if("enum"==S)return new a(t[S]);if("utf8str"==S)return new u(t[S]);if("numstr"==S)return new c(t[S]);if("prnstr"==S)return new f(t[S]);if("telstr"==S)return new l(t[S]);if("ia5str"==S)return new p(t[S]);if("utctime"==S)return new g(t[S]);if("gentime"==S)return new d(t[S]);if("seq"==S){for(var E=t[S],w=[],D=0;D<E.length;D++){var x=b(E[D]);w.push(x)}return new v({array:w})}if("set"==S){for(E=t[S],w=[],D=0;D<E.length;D++){x=b(E[D]);w.push(x)}return new y({array:w})}if("tag"==S){var R=t[S];if("[object Array]"===Object.prototype.toString.call(R)&&3==R.length){var A=b(R[2]);return new m({tag:R[0],explicit:R[1],obj:A})}var B={};if(void 0!==R.explicit&&(B.explicit=R.explicit),void 0!==R.tag&&(B.tag=R.tag),void 0===R.obj)throw"obj shall be specified for 'tag'.";return B.obj=b(R.obj),new m(B)}},this.jsonToASN1HEX=function(t){return this.newObject(t).getEncodedHex()}},dt.asn1.ASN1Util.oidHexToInt=function(t){for(var e="",r=parseInt(t.substring(0,2),16),i=(e=Math.floor(r/40)+"."+r%40,""),n=2;n<t.length;n+=2){var s=("00000000"+parseInt(t.substring(n,n+2),16).toString(2)).slice(-8);if(i+=s.substring(1,8),"0"==s.substring(0,1))e=e+"."+new A(i,2).toString(10),i=""}return e},dt.asn1.ASN1Util.oidIntToHex=function(t){var e=function(t){var e=t.toString(16);return 1==e.length&&(e="0"+e),e},r=function(t){var r="",i=new A(t,10).toString(2),n=7-i.length%7;7==n&&(n=0);for(var s="",o=0;o<n;o++)s+="0";i=s+i;for(o=0;o<i.length-1;o+=7){var h=i.substring(o,o+7);o!=i.length-7&&(h="1"+h),r+=e(parseInt(h,2))}return r};if(!t.match(/^[0-9.]+$/))throw"malformed oid string: "+t;var i="",n=t.split("."),s=40*parseInt(n[0])+parseInt(n[1]);i+=e(s),n.splice(0,2);for(var o=0;o<n.length;o++)i+=r(n[o]);return i},dt.asn1.ASN1Object=function(){this.getLengthHexFromValue=function(){if(void 0===this.hV||null==this.hV)throw"this.hV is null or undefined.";if(this.hV.length%2==1)throw"value hex must be even length: n=0,v="+this.hV;var t=this.hV.length/2,e=t.toString(16);if(e.length%2==1&&(e="0"+e),t<128)return e;var r=e.length/2;if(r>15)throw"ASN.1 length too long to represent by 8x: n = "+t.toString(16);return(128+r).toString(16)+e},this.getEncodedHex=function(){return(null==this.hTLV||this.isModified)&&(this.hV=this.getFreshValueHex(),this.hL=this.getLengthHexFromValue(),this.hTLV=this.hT+this.hL+this.hV,this.isModified=!1),this.hTLV},this.getValueHex=function(){return this.getEncodedHex(),this.hV},this.getFreshValueHex=function(){return""}},dt.asn1.DERAbstractString=function(t){dt.asn1.DERAbstractString.superclass.constructor.call(this);this.getString=function(){return this.s},this.setString=function(t){this.hTLV=null,this.isModified=!0,this.s=t,this.hV=stohex(this.s)},this.setStringHex=function(t){this.hTLV=null,this.isModified=!0,this.s=null,this.hV=t},this.getFreshValueHex=function(){return this.hV},void 0!==t&&("string"==typeof t?this.setString(t):void 0!==t.str?this.setString(t.str):void 0!==t.hex&&this.setStringHex(t.hex))},gt(dt.asn1.DERAbstractString,dt.asn1.ASN1Object),dt.asn1.DERAbstractTime=function(t){dt.asn1.DERAbstractTime.superclass.constructor.call(this);this.localDateToUTC=function(t){return utc=t.getTime()+6e4*t.getTimezoneOffset(),new Date(utc)},this.formatDate=function(t,e,r){var i=this.zeroPadding,n=this.localDateToUTC(t),s=String(n.getFullYear());"utc"==e&&(s=s.substring(2,4));var o=s+i(String(n.getMonth()+1),2)+i(String(n.getDate()),2)+i(String(n.getHours()),2)+i(String(n.getMinutes()),2)+i(String(n.getSeconds()),2);if(!0===r){var h=n.getMilliseconds();if(0!=h){var a=i(String(h),3);o=o+"."+(a=a.replace(/[0]+$/,""))}}return o+"Z"},this.zeroPadding=function(t,e){return t.length>=e?t:new Array(e-t.length+1).join("0")+t},this.getString=function(){return this.s},this.setString=function(t){this.hTLV=null,this.isModified=!0,this.s=t,this.hV=stohex(t)},this.setByDateValue=function(t,e,r,i,n,s){var o=new Date(Date.UTC(t,e-1,r,i,n,s,0));this.setByDate(o)},this.getFreshValueHex=function(){return this.hV}},gt(dt.asn1.DERAbstractTime,dt.asn1.ASN1Object),dt.asn1.DERAbstractStructured=function(t){dt.asn1.DERAbstractString.superclass.constructor.call(this);this.setByASN1ObjectArray=function(t){this.hTLV=null,this.isModified=!0,this.asn1Array=t},this.appendASN1Object=function(t){this.hTLV=null,this.isModified=!0,this.asn1Array.push(t)},this.asn1Array=new Array,void 0!==t&&void 0!==t.array&&(this.asn1Array=t.array)},gt(dt.asn1.DERAbstractStructured,dt.asn1.ASN1Object),dt.asn1.DERBoolean=function(){dt.asn1.DERBoolean.superclass.constructor.call(this),this.hT="01",this.hTLV="0101ff"},gt(dt.asn1.DERBoolean,dt.asn1.ASN1Object),dt.asn1.DERInteger=function(t){dt.asn1.DERInteger.superclass.constructor.call(this),this.hT="02",this.setByBigInteger=function(t){this.hTLV=null,this.isModified=!0,this.hV=dt.asn1.ASN1Util.bigIntToMinTwosComplementsHex(t)},this.setByInteger=function(t){var e=new A(String(t),10);this.setByBigInteger(e)},this.setValueHex=function(t){this.hV=t},this.getFreshValueHex=function(){return this.hV},void 0!==t&&(void 0!==t.bigint?this.setByBigInteger(t.bigint):void 0!==t.int?this.setByInteger(t.int):"number"==typeof t?this.setByInteger(t):void 0!==t.hex&&this.setValueHex(t.hex))},gt(dt.asn1.DERInteger,dt.asn1.ASN1Object),dt.asn1.DERBitString=function(t){if(void 0!==t&&void 0!==t.obj){var e=dt.asn1.ASN1Util.newObject(t.obj);t.hex="00"+e.getEncodedHex()}dt.asn1.DERBitString.superclass.constructor.call(this),this.hT="03",this.setHexValueIncludingUnusedBits=function(t){this.hTLV=null,this.isModified=!0,this.hV=t},this.setUnusedBitsAndHexValue=function(t,e){if(t<0||7<t)throw"unused bits shall be from 0 to 7: u = "+t;var r="0"+t;this.hTLV=null,this.isModified=!0,this.hV=r+e},this.setByBinaryString=function(t){var e=8-(t=t.replace(/0+$/,"")).length%8;8==e&&(e=0);for(var r=0;r<=e;r++)t+="0";var i="";for(r=0;r<t.length-1;r+=8){var n=t.substring(r,r+8),s=parseInt(n,2).toString(16);1==s.length&&(s="0"+s),i+=s}this.hTLV=null,this.isModified=!0,this.hV="0"+e+i},this.setByBooleanArray=function(t){for(var e="",r=0;r<t.length;r++)1==t[r]?e+="1":e+="0";this.setByBinaryString(e)},this.newFalseArray=function(t){for(var e=new Array(t),r=0;r<t;r++)e[r]=!1;return e},this.getFreshValueHex=function(){return this.hV},void 0!==t&&("string"==typeof t&&t.toLowerCase().match(/^[0-9a-f]+$/)?this.setHexValueIncludingUnusedBits(t):void 0!==t.hex?this.setHexValueIncludingUnusedBits(t.hex):void 0!==t.bin?this.setByBinaryString(t.bin):void 0!==t.array&&this.setByBooleanArray(t.array))},gt(dt.asn1.DERBitString,dt.asn1.ASN1Object),dt.asn1.DEROctetString=function(t){if(void 0!==t&&void 0!==t.obj){var e=dt.asn1.ASN1Util.newObject(t.obj);t.hex=e.getEncodedHex()}dt.asn1.DEROctetString.superclass.constructor.call(this,t),this.hT="04"},gt(dt.asn1.DEROctetString,dt.asn1.DERAbstractString),dt.asn1.DERNull=function(){dt.asn1.DERNull.superclass.constructor.call(this),this.hT="05",this.hTLV="0500"},gt(dt.asn1.DERNull,dt.asn1.ASN1Object),dt.asn1.DERObjectIdentifier=function(t){var e=function(t){var e=t.toString(16);return 1==e.length&&(e="0"+e),e},r=function(t){var r="",i=new A(t,10).toString(2),n=7-i.length%7;7==n&&(n=0);for(var s="",o=0;o<n;o++)s+="0";i=s+i;for(o=0;o<i.length-1;o+=7){var h=i.substring(o,o+7);o!=i.length-7&&(h="1"+h),r+=e(parseInt(h,2))}return r};dt.asn1.DERObjectIdentifier.superclass.constructor.call(this),this.hT="06",this.setValueHex=function(t){this.hTLV=null,this.isModified=!0,this.s=null,this.hV=t},this.setValueOidString=function(t){if(!t.match(/^[0-9.]+$/))throw"malformed oid string: "+t;var i="",n=t.split("."),s=40*parseInt(n[0])+parseInt(n[1]);i+=e(s),n.splice(0,2);for(var o=0;o<n.length;o++)i+=r(n[o]);this.hTLV=null,this.isModified=!0,this.s=null,this.hV=i},this.setValueName=function(t){var e=dt.asn1.x509.OID.name2oid(t);if(""===e)throw"DERObjectIdentifier oidName undefined: "+t;this.setValueOidString(e)},this.getFreshValueHex=function(){return this.hV},void 0!==t&&("string"==typeof t?t.match(/^[0-2].[0-9.]+$/)?this.setValueOidString(t):this.setValueName(t):void 0!==t.oid?this.setValueOidString(t.oid):void 0!==t.hex?this.setValueHex(t.hex):void 0!==t.name&&this.setValueName(t.name))},gt(dt.asn1.DERObjectIdentifier,dt.asn1.ASN1Object),dt.asn1.DEREnumerated=function(t){dt.asn1.DEREnumerated.superclass.constructor.call(this),this.hT="0a",this.setByBigInteger=function(t){this.hTLV=null,this.isModified=!0,this.hV=dt.asn1.ASN1Util.bigIntToMinTwosComplementsHex(t)},this.setByInteger=function(t){var e=new A(String(t),10);this.setByBigInteger(e)},this.setValueHex=function(t){this.hV=t},this.getFreshValueHex=function(){return this.hV},void 0!==t&&(void 0!==t.int?this.setByInteger(t.int):"number"==typeof t?this.setByInteger(t):void 0!==t.hex&&this.setValueHex(t.hex))},gt(dt.asn1.DEREnumerated,dt.asn1.ASN1Object),dt.asn1.DERUTF8String=function(t){dt.asn1.DERUTF8String.superclass.constructor.call(this,t),this.hT="0c"},gt(dt.asn1.DERUTF8String,dt.asn1.DERAbstractString),dt.asn1.DERNumericString=function(t){dt.asn1.DERNumericString.superclass.constructor.call(this,t),this.hT="12"},gt(dt.asn1.DERNumericString,dt.asn1.DERAbstractString),dt.asn1.DERPrintableString=function(t){dt.asn1.DERPrintableString.superclass.constructor.call(this,t),this.hT="13"},gt(dt.asn1.DERPrintableString,dt.asn1.DERAbstractString),dt.asn1.DERTeletexString=function(t){dt.asn1.DERTeletexString.superclass.constructor.call(this,t),this.hT="14"},gt(dt.asn1.DERTeletexString,dt.asn1.DERAbstractString),dt.asn1.DERIA5String=function(t){dt.asn1.DERIA5String.superclass.constructor.call(this,t),this.hT="16"},gt(dt.asn1.DERIA5String,dt.asn1.DERAbstractString),dt.asn1.DERUTCTime=function(t){dt.asn1.DERUTCTime.superclass.constructor.call(this,t),this.hT="17",this.setByDate=function(t){this.hTLV=null,this.isModified=!0,this.date=t,this.s=this.formatDate(this.date,"utc"),this.hV=stohex(this.s)},this.getFreshValueHex=function(){return void 0===this.date&&void 0===this.s&&(this.date=new Date,this.s=this.formatDate(this.date,"utc"),this.hV=stohex(this.s)),this.hV},void 0!==t&&(void 0!==t.str?this.setString(t.str):"string"==typeof t&&t.match(/^[0-9]{12}Z$/)?this.setString(t):void 0!==t.hex?this.setStringHex(t.hex):void 0!==t.date&&this.setByDate(t.date))},gt(dt.asn1.DERUTCTime,dt.asn1.DERAbstractTime),dt.asn1.DERGeneralizedTime=function(t){dt.asn1.DERGeneralizedTime.superclass.constructor.call(this,t),this.hT="18",this.withMillis=!1,this.setByDate=function(t){this.hTLV=null,this.isModified=!0,this.date=t,this.s=this.formatDate(this.date,"gen",this.withMillis),this.hV=stohex(this.s)},this.getFreshValueHex=function(){return void 0===this.date&&void 0===this.s&&(this.date=new Date,this.s=this.formatDate(this.date,"gen",this.withMillis),this.hV=stohex(this.s)),this.hV},void 0!==t&&(void 0!==t.str?this.setString(t.str):"string"==typeof t&&t.match(/^[0-9]{14}Z$/)?this.setString(t):void 0!==t.hex?this.setStringHex(t.hex):void 0!==t.date&&this.setByDate(t.date),!0===t.millis&&(this.withMillis=!0))},gt(dt.asn1.DERGeneralizedTime,dt.asn1.DERAbstractTime),dt.asn1.DERSequence=function(t){dt.asn1.DERSequence.superclass.constructor.call(this,t),this.hT="30",this.getFreshValueHex=function(){for(var t="",e=0;e<this.asn1Array.length;e++){t+=this.asn1Array[e].getEncodedHex()}return this.hV=t,this.hV}},gt(dt.asn1.DERSequence,dt.asn1.DERAbstractStructured),dt.asn1.DERSet=function(t){dt.asn1.DERSet.superclass.constructor.call(this,t),this.hT="31",this.sortFlag=!0,this.getFreshValueHex=function(){for(var t=new Array,e=0;e<this.asn1Array.length;e++){var r=this.asn1Array[e];t.push(r.getEncodedHex())}return 1==this.sortFlag&&t.sort(),this.hV=t.join(""),this.hV},void 0!==t&&void 0!==t.sortflag&&0==t.sortflag&&(this.sortFlag=!1)},gt(dt.asn1.DERSet,dt.asn1.DERAbstractStructured),dt.asn1.DERTaggedObject=function(t){dt.asn1.DERTaggedObject.superclass.constructor.call(this),this.hT="a0",this.hV="",this.isExplicit=!0,this.asn1Object=null,this.setASN1Object=function(t,e,r){this.hT=e,this.isExplicit=t,this.asn1Object=r,this.isExplicit?(this.hV=this.asn1Object.getEncodedHex(),this.hTLV=null,this.isModified=!0):(this.hV=null,this.hTLV=r.getEncodedHex(),this.hTLV=this.hTLV.replace(/^../,e),this.isModified=!1)},this.getFreshValueHex=function(){return this.hV},void 0!==t&&(void 0!==t.tag&&(this.hT=t.tag),void 0!==t.explicit&&(this.isExplicit=t.explicit),void 0!==t.obj&&(this.asn1Object=t.obj,this.setASN1Object(this.isExplicit,this.hT,this.asn1Object)))},gt(dt.asn1.DERTaggedObject,dt.asn1.ASN1Object);var vt,yt,mt=(vt=function(t,e){return vt=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(t,e){t.__proto__=e}||function(t,e){for(var r in e)Object.prototype.hasOwnProperty.call(e,r)&&(t[r]=e[r])},vt(t,e)},function(t,e){if("function"!=typeof e&&null!==e)throw new TypeError("Class extends value "+String(e)+" is not a constructor or null");function r(){this.constructor=t}vt(t,e),t.prototype=null===e?Object.create(e):(r.prototype=e.prototype,new r)}),bt=function(t){function e(r){var i=t.call(this)||this;return r&&("string"==typeof r?i.parseKey(r):(e.hasPrivateKeyProperty(r)||e.hasPublicKeyProperty(r))&&i.parsePropertiesFrom(r)),i}return mt(e,t),e.prototype.parseKey=function(t){try{var e=0,r=0,i=/^\s*(?:[0-9A-Fa-f][0-9A-Fa-f]\s*)+$/.test(t)?g(t):d.unarmor(t),n=w.decode(i);if(3===n.sub.length&&(n=n.sub[2].sub[0]),9===n.sub.length){e=n.sub[1].getHexStringValue(),this.n=P(e,16),r=n.sub[2].getHexStringValue(),this.e=parseInt(r,16);var s=n.sub[3].getHexStringValue();this.d=P(s,16);var o=n.sub[4].getHexStringValue();this.p=P(o,16);var h=n.sub[5].getHexStringValue();this.q=P(h,16);var a=n.sub[6].getHexStringValue();this.dmp1=P(a,16);var u=n.sub[7].getHexStringValue();this.dmq1=P(u,16);var c=n.sub[8].getHexStringValue();this.coeff=P(c,16)}else{if(2!==n.sub.length)return!1;if(n.sub[0].sub){var f=n.sub[1].sub[0];e=f.sub[0].getHexStringValue(),this.n=P(e,16),r=f.sub[1].getHexStringValue(),this.e=parseInt(r,16)}else e=n.sub[0].getHexStringValue(),this.n=P(e,16),r=n.sub[1].getHexStringValue(),this.e=parseInt(r,16)}return!0}catch(t){return!1}},e.prototype.getPrivateBaseKey=function(){var t={array:[new dt.asn1.DERInteger({int:0}),new dt.asn1.DERInteger({bigint:this.n}),new dt.asn1.DERInteger({int:this.e}),new dt.asn1.DERInteger({bigint:this.d}),new dt.asn1.DERInteger({bigint:this.p}),new dt.asn1.DERInteger({bigint:this.q}),new dt.asn1.DERInteger({bigint:this.dmp1}),new dt.asn1.DERInteger({bigint:this.dmq1}),new dt.asn1.DERInteger({bigint:this.coeff})]};return new dt.asn1.DERSequence(t).getEncodedHex()},e.prototype.getPrivateBaseKeyB64=function(){return f(this.getPrivateBaseKey())},e.prototype.getPublicBaseKey=function(){var t=new dt.asn1.DERSequence({array:[new dt.asn1.DERObjectIdentifier({oid:"1.2.840.113549.1.1.1"}),new dt.asn1.DERNull]}),e=new dt.asn1.DERSequence({array:[new dt.asn1.DERInteger({bigint:this.n}),new dt.asn1.DERInteger({int:this.e})]}),r=new dt.asn1.DERBitString({hex:"00"+e.getEncodedHex()});return new dt.asn1.DERSequence({array:[t,r]}).getEncodedHex()},e.prototype.getPublicBaseKeyB64=function(){return f(this.getPublicBaseKey())},e.wordwrap=function(t,e){if(!t)return t;var r="(.{1,"+(e=e||64)+"})( +|$\n?)|(.{1,"+e+"})";return t.match(RegExp(r,"g")).join("\n")},e.prototype.getPrivateKey=function(){var t="-----BEGIN RSA PRIVATE KEY-----\n";return t+=e.wordwrap(this.getPrivateBaseKeyB64())+"\n",t+="-----END RSA PRIVATE KEY-----"},e.prototype.getPublicKey=function(){var t="-----BEGIN PUBLIC KEY-----\n";return t+=e.wordwrap(this.getPublicBaseKeyB64())+"\n",t+="-----END PUBLIC KEY-----"},e.hasPublicKeyProperty=function(t){return(t=t||{}).hasOwnProperty("n")&&t.hasOwnProperty("e")},e.hasPrivateKeyProperty=function(t){return(t=t||{}).hasOwnProperty("n")&&t.hasOwnProperty("e")&&t.hasOwnProperty("d")&&t.hasOwnProperty("p")&&t.hasOwnProperty("q")&&t.hasOwnProperty("dmp1")&&t.hasOwnProperty("dmq1")&&t.hasOwnProperty("coeff")},e.prototype.parsePropertiesFrom=function(t){this.n=t.n,this.e=t.e,t.hasOwnProperty("d")&&(this.d=t.d,this.p=t.p,this.q=t.q,this.dmp1=t.dmp1,this.dmq1=t.dmq1,this.coeff=t.coeff)},e}(lt),Tt=r(606),St=void 0!==Tt?null===(yt=Tt.env)||void 0===yt?void 0:"3.5.4":void 0,Et=function(){function t(t){void 0===t&&(t={}),this.default_key_size=t.default_key_size?parseInt(t.default_key_size,10):1024,this.default_public_exponent=t.default_public_exponent||"010001",this.log=t.log||!1,this.key=t.key||null}return t.prototype.setKey=function(t){t?(this.log&&this.key&&console.warn("A key was already set, overriding existing."),this.key=new bt(t)):!this.key&&this.log&&console.error("A key was not set.")},t.prototype.setPrivateKey=function(t){this.setKey(t)},t.prototype.setPublicKey=function(t){this.setKey(t)},t.prototype.decrypt=function(t){try{return this.getKey().decrypt(l(t))}catch(t){return!1}},t.prototype.encrypt=function(t){try{return f(this.getKey().encrypt(t))}catch(t){return!1}},t.prototype.encryptOAEP=function(t){try{return f(this.getKey().encrypt(t,ft))}catch(t){return!1}},t.prototype.sign=function(t,e,r){void 0===e&&(e=function(t){return t}),void 0===r&&(r="");try{return f(this.getKey().sign(t,e,r))}catch(t){return!1}},t.prototype.signSha256=function(t){return this.sign(t,function(t){return Q(X(t))},"sha256")},t.prototype.verify=function(t,e,r){void 0===r&&(r=function(t){return t});try{return this.getKey().verify(t,l(e),r)}catch(t){return!1}},t.prototype.verifySha256=function(t,e){return this.verify(t,e,function(t){return Q(X(t))})},t.prototype.getKey=function(t){if(!this.key){if(this.key=new bt,t&&"[object Function]"==={}.toString.call(t))return void this.key.generateAsync(this.default_key_size,this.default_public_exponent,t);this.key.generate(this.default_key_size,this.default_public_exponent)}return this.key},t.prototype.getPrivateKey=function(){return this.getKey().getPrivateKey()},t.prototype.getPrivateKeyB64=function(){return this.getKey().getPrivateBaseKeyB64()},t.prototype.getPublicKey=function(){return this.getKey().getPublicKey()},t.prototype.getPublicKeyB64=function(){return this.getKey().getPublicBaseKeyB64()},t.version=St,t}()}(),i=i.default}()});
    return module.exports;
  }
  // https://github.com/kazuhikoarase/qrcode-generator (1.4.4)
  /*
The MIT License (MIT)

Copyright (c) 2009 Kazuhiko Arase

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

  */
  function createLoginQR() {
    const module = { exports: {} }; const exports = module.exports; const define = undefined;
//---------------------------------------------------------------------
//
// QR Code Generator for JavaScript
//
// Copyright (c) 2009 Kazuhiko Arase
//
// URL: http://www.d-project.com/
//
// Licensed under the MIT license:
//  http://www.opensource.org/licenses/mit-license.php
//
// The word 'QR Code' is registered trademark of
// DENSO WAVE INCORPORATED
//  http://www.denso-wave.com/qrcode/faqpatent-e.html
//
//---------------------------------------------------------------------

var qrcode = function() {

  //---------------------------------------------------------------------
  // qrcode
  //---------------------------------------------------------------------

  /**
   * qrcode
   * @param typeNumber 1 to 40
   * @param errorCorrectionLevel 'L','M','Q','H'
   */
  var qrcode = function(typeNumber, errorCorrectionLevel) {

    var PAD0 = 0xEC;
    var PAD1 = 0x11;

    var _typeNumber = typeNumber;
    var _errorCorrectionLevel = QRErrorCorrectionLevel[errorCorrectionLevel];
    var _modules = null;
    var _moduleCount = 0;
    var _dataCache = null;
    var _dataList = [];

    var _this = {};

    var makeImpl = function(test, maskPattern) {

      _moduleCount = _typeNumber * 4 + 17;
      _modules = function(moduleCount) {
        var modules = new Array(moduleCount);
        for (var row = 0; row < moduleCount; row += 1) {
          modules[row] = new Array(moduleCount);
          for (var col = 0; col < moduleCount; col += 1) {
            modules[row][col] = null;
          }
        }
        return modules;
      }(_moduleCount);

      setupPositionProbePattern(0, 0);
      setupPositionProbePattern(_moduleCount - 7, 0);
      setupPositionProbePattern(0, _moduleCount - 7);
      setupPositionAdjustPattern();
      setupTimingPattern();
      setupTypeInfo(test, maskPattern);

      if (_typeNumber >= 7) {
        setupTypeNumber(test);
      }

      if (_dataCache == null) {
        _dataCache = createData(_typeNumber, _errorCorrectionLevel, _dataList);
      }

      mapData(_dataCache, maskPattern);
    };

    var setupPositionProbePattern = function(row, col) {

      for (var r = -1; r <= 7; r += 1) {

        if (row + r <= -1 || _moduleCount <= row + r) continue;

        for (var c = -1; c <= 7; c += 1) {

          if (col + c <= -1 || _moduleCount <= col + c) continue;

          if ( (0 <= r && r <= 6 && (c == 0 || c == 6) )
              || (0 <= c && c <= 6 && (r == 0 || r == 6) )
              || (2 <= r && r <= 4 && 2 <= c && c <= 4) ) {
            _modules[row + r][col + c] = true;
          } else {
            _modules[row + r][col + c] = false;
          }
        }
      }
    };

    var getBestMaskPattern = function() {

      var minLostPoint = 0;
      var pattern = 0;

      for (var i = 0; i < 8; i += 1) {

        makeImpl(true, i);

        var lostPoint = QRUtil.getLostPoint(_this);

        if (i == 0 || minLostPoint > lostPoint) {
          minLostPoint = lostPoint;
          pattern = i;
        }
      }

      return pattern;
    };

    var setupTimingPattern = function() {

      for (var r = 8; r < _moduleCount - 8; r += 1) {
        if (_modules[r][6] != null) {
          continue;
        }
        _modules[r][6] = (r % 2 == 0);
      }

      for (var c = 8; c < _moduleCount - 8; c += 1) {
        if (_modules[6][c] != null) {
          continue;
        }
        _modules[6][c] = (c % 2 == 0);
      }
    };

    var setupPositionAdjustPattern = function() {

      var pos = QRUtil.getPatternPosition(_typeNumber);

      for (var i = 0; i < pos.length; i += 1) {

        for (var j = 0; j < pos.length; j += 1) {

          var row = pos[i];
          var col = pos[j];

          if (_modules[row][col] != null) {
            continue;
          }

          for (var r = -2; r <= 2; r += 1) {

            for (var c = -2; c <= 2; c += 1) {

              if (r == -2 || r == 2 || c == -2 || c == 2
                  || (r == 0 && c == 0) ) {
                _modules[row + r][col + c] = true;
              } else {
                _modules[row + r][col + c] = false;
              }
            }
          }
        }
      }
    };

    var setupTypeNumber = function(test) {

      var bits = QRUtil.getBCHTypeNumber(_typeNumber);

      for (var i = 0; i < 18; i += 1) {
        var mod = (!test && ( (bits >> i) & 1) == 1);
        _modules[Math.floor(i / 3)][i % 3 + _moduleCount - 8 - 3] = mod;
      }

      for (var i = 0; i < 18; i += 1) {
        var mod = (!test && ( (bits >> i) & 1) == 1);
        _modules[i % 3 + _moduleCount - 8 - 3][Math.floor(i / 3)] = mod;
      }
    };

    var setupTypeInfo = function(test, maskPattern) {

      var data = (_errorCorrectionLevel << 3) | maskPattern;
      var bits = QRUtil.getBCHTypeInfo(data);

      // vertical
      for (var i = 0; i < 15; i += 1) {

        var mod = (!test && ( (bits >> i) & 1) == 1);

        if (i < 6) {
          _modules[i][8] = mod;
        } else if (i < 8) {
          _modules[i + 1][8] = mod;
        } else {
          _modules[_moduleCount - 15 + i][8] = mod;
        }
      }

      // horizontal
      for (var i = 0; i < 15; i += 1) {

        var mod = (!test && ( (bits >> i) & 1) == 1);

        if (i < 8) {
          _modules[8][_moduleCount - i - 1] = mod;
        } else if (i < 9) {
          _modules[8][15 - i - 1 + 1] = mod;
        } else {
          _modules[8][15 - i - 1] = mod;
        }
      }

      // fixed module
      _modules[_moduleCount - 8][8] = (!test);
    };

    var mapData = function(data, maskPattern) {

      var inc = -1;
      var row = _moduleCount - 1;
      var bitIndex = 7;
      var byteIndex = 0;
      var maskFunc = QRUtil.getMaskFunction(maskPattern);

      for (var col = _moduleCount - 1; col > 0; col -= 2) {

        if (col == 6) col -= 1;

        while (true) {

          for (var c = 0; c < 2; c += 1) {

            if (_modules[row][col - c] == null) {

              var dark = false;

              if (byteIndex < data.length) {
                dark = ( ( (data[byteIndex] >>> bitIndex) & 1) == 1);
              }

              var mask = maskFunc(row, col - c);

              if (mask) {
                dark = !dark;
              }

              _modules[row][col - c] = dark;
              bitIndex -= 1;

              if (bitIndex == -1) {
                byteIndex += 1;
                bitIndex = 7;
              }
            }
          }

          row += inc;

          if (row < 0 || _moduleCount <= row) {
            row -= inc;
            inc = -inc;
            break;
          }
        }
      }
    };

    var createBytes = function(buffer, rsBlocks) {

      var offset = 0;

      var maxDcCount = 0;
      var maxEcCount = 0;

      var dcdata = new Array(rsBlocks.length);
      var ecdata = new Array(rsBlocks.length);

      for (var r = 0; r < rsBlocks.length; r += 1) {

        var dcCount = rsBlocks[r].dataCount;
        var ecCount = rsBlocks[r].totalCount - dcCount;

        maxDcCount = Math.max(maxDcCount, dcCount);
        maxEcCount = Math.max(maxEcCount, ecCount);

        dcdata[r] = new Array(dcCount);

        for (var i = 0; i < dcdata[r].length; i += 1) {
          dcdata[r][i] = 0xff & buffer.getBuffer()[i + offset];
        }
        offset += dcCount;

        var rsPoly = QRUtil.getErrorCorrectPolynomial(ecCount);
        var rawPoly = qrPolynomial(dcdata[r], rsPoly.getLength() - 1);

        var modPoly = rawPoly.mod(rsPoly);
        ecdata[r] = new Array(rsPoly.getLength() - 1);
        for (var i = 0; i < ecdata[r].length; i += 1) {
          var modIndex = i + modPoly.getLength() - ecdata[r].length;
          ecdata[r][i] = (modIndex >= 0)? modPoly.getAt(modIndex) : 0;
        }
      }

      var totalCodeCount = 0;
      for (var i = 0; i < rsBlocks.length; i += 1) {
        totalCodeCount += rsBlocks[i].totalCount;
      }

      var data = new Array(totalCodeCount);
      var index = 0;

      for (var i = 0; i < maxDcCount; i += 1) {
        for (var r = 0; r < rsBlocks.length; r += 1) {
          if (i < dcdata[r].length) {
            data[index] = dcdata[r][i];
            index += 1;
          }
        }
      }

      for (var i = 0; i < maxEcCount; i += 1) {
        for (var r = 0; r < rsBlocks.length; r += 1) {
          if (i < ecdata[r].length) {
            data[index] = ecdata[r][i];
            index += 1;
          }
        }
      }

      return data;
    };

    var createData = function(typeNumber, errorCorrectionLevel, dataList) {

      var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, errorCorrectionLevel);

      var buffer = qrBitBuffer();

      for (var i = 0; i < dataList.length; i += 1) {
        var data = dataList[i];
        buffer.put(data.getMode(), 4);
        buffer.put(data.getLength(), QRUtil.getLengthInBits(data.getMode(), typeNumber) );
        data.write(buffer);
      }

      // calc num max data.
      var totalDataCount = 0;
      for (var i = 0; i < rsBlocks.length; i += 1) {
        totalDataCount += rsBlocks[i].dataCount;
      }

      if (buffer.getLengthInBits() > totalDataCount * 8) {
        throw 'code length overflow. ('
          + buffer.getLengthInBits()
          + '>'
          + totalDataCount * 8
          + ')';
      }

      // end code
      if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) {
        buffer.put(0, 4);
      }

      // padding
      while (buffer.getLengthInBits() % 8 != 0) {
        buffer.putBit(false);
      }

      // padding
      while (true) {

        if (buffer.getLengthInBits() >= totalDataCount * 8) {
          break;
        }
        buffer.put(PAD0, 8);

        if (buffer.getLengthInBits() >= totalDataCount * 8) {
          break;
        }
        buffer.put(PAD1, 8);
      }

      return createBytes(buffer, rsBlocks);
    };

    _this.addData = function(data, mode) {

      mode = mode || 'Byte';

      var newData = null;

      switch(mode) {
      case 'Numeric' :
        newData = qrNumber(data);
        break;
      case 'Alphanumeric' :
        newData = qrAlphaNum(data);
        break;
      case 'Byte' :
        newData = qr8BitByte(data);
        break;
      case 'Kanji' :
        newData = qrKanji(data);
        break;
      default :
        throw 'mode:' + mode;
      }

      _dataList.push(newData);
      _dataCache = null;
    };

    _this.isDark = function(row, col) {
      if (row < 0 || _moduleCount <= row || col < 0 || _moduleCount <= col) {
        throw row + ',' + col;
      }
      return _modules[row][col];
    };

    _this.getModuleCount = function() {
      return _moduleCount;
    };

    _this.make = function() {
      if (_typeNumber < 1) {
        var typeNumber = 1;

        for (; typeNumber < 40; typeNumber++) {
          var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, _errorCorrectionLevel);
          var buffer = qrBitBuffer();

          for (var i = 0; i < _dataList.length; i++) {
            var data = _dataList[i];
            buffer.put(data.getMode(), 4);
            buffer.put(data.getLength(), QRUtil.getLengthInBits(data.getMode(), typeNumber) );
            data.write(buffer);
          }

          var totalDataCount = 0;
          for (var i = 0; i < rsBlocks.length; i++) {
            totalDataCount += rsBlocks[i].dataCount;
          }

          if (buffer.getLengthInBits() <= totalDataCount * 8) {
            break;
          }
        }

        _typeNumber = typeNumber;
      }

      makeImpl(false, getBestMaskPattern() );
    };

    _this.createTableTag = function(cellSize, margin) {

      cellSize = cellSize || 2;
      margin = (typeof margin == 'undefined')? cellSize * 4 : margin;

      var qrHtml = '';

      qrHtml += '<table style="';
      qrHtml += ' border-width: 0px; border-style: none;';
      qrHtml += ' border-collapse: collapse;';
      qrHtml += ' padding: 0px; margin: ' + margin + 'px;';
      qrHtml += '">';
      qrHtml += '<tbody>';

      for (var r = 0; r < _this.getModuleCount(); r += 1) {

        qrHtml += '<tr>';

        for (var c = 0; c < _this.getModuleCount(); c += 1) {
          qrHtml += '<td style="';
          qrHtml += ' border-width: 0px; border-style: none;';
          qrHtml += ' border-collapse: collapse;';
          qrHtml += ' padding: 0px; margin: 0px;';
          qrHtml += ' width: ' + cellSize + 'px;';
          qrHtml += ' height: ' + cellSize + 'px;';
          qrHtml += ' background-color: ';
          qrHtml += _this.isDark(r, c)? '#000000' : '#ffffff';
          qrHtml += ';';
          qrHtml += '"/>';
        }

        qrHtml += '</tr>';
      }

      qrHtml += '</tbody>';
      qrHtml += '</table>';

      return qrHtml;
    };

    _this.createSvgTag = function(cellSize, margin, alt, title) {

      var opts = {};
      if (typeof arguments[0] == 'object') {
        // Called by options.
        opts = arguments[0];
        // overwrite cellSize and margin.
        cellSize = opts.cellSize;
        margin = opts.margin;
        alt = opts.alt;
        title = opts.title;
      }

      cellSize = cellSize || 2;
      margin = (typeof margin == 'undefined')? cellSize * 4 : margin;

      // Compose alt property surrogate
      alt = (typeof alt === 'string') ? {text: alt} : alt || {};
      alt.text = alt.text || null;
      alt.id = (alt.text) ? alt.id || 'qrcode-description' : null;

      // Compose title property surrogate
      title = (typeof title === 'string') ? {text: title} : title || {};
      title.text = title.text || null;
      title.id = (title.text) ? title.id || 'qrcode-title' : null;

      var size = _this.getModuleCount() * cellSize + margin * 2;
      var c, mc, r, mr, qrSvg='', rect;

      rect = 'l' + cellSize + ',0 0,' + cellSize +
        ' -' + cellSize + ',0 0,-' + cellSize + 'z ';

      qrSvg += '<svg version="1.1" xmlns="http://www.w3.org/2000/svg"';
      qrSvg += !opts.scalable ? ' width="' + size + 'px" height="' + size + 'px"' : '';
      qrSvg += ' viewBox="0 0 ' + size + ' ' + size + '" ';
      qrSvg += ' preserveAspectRatio="xMinYMin meet"';
      qrSvg += (title.text || alt.text) ? ' role="img" aria-labelledby="' +
          escapeXml([title.id, alt.id].join(' ').trim() ) + '"' : '';
      qrSvg += '>';
      qrSvg += (title.text) ? '<title id="' + escapeXml(title.id) + '">' +
          escapeXml(title.text) + '</title>' : '';
      qrSvg += (alt.text) ? '<description id="' + escapeXml(alt.id) + '">' +
          escapeXml(alt.text) + '</description>' : '';
      qrSvg += '<rect width="100%" height="100%" fill="white" cx="0" cy="0"/>';
      qrSvg += '<path d="';

      for (r = 0; r < _this.getModuleCount(); r += 1) {
        mr = r * cellSize + margin;
        for (c = 0; c < _this.getModuleCount(); c += 1) {
          if (_this.isDark(r, c) ) {
            mc = c*cellSize+margin;
            qrSvg += 'M' + mc + ',' + mr + rect;
          }
        }
      }

      qrSvg += '" stroke="transparent" fill="black"/>';
      qrSvg += '</svg>';

      return qrSvg;
    };

    _this.createDataURL = function(cellSize, margin) {

      cellSize = cellSize || 2;
      margin = (typeof margin == 'undefined')? cellSize * 4 : margin;

      var size = _this.getModuleCount() * cellSize + margin * 2;
      var min = margin;
      var max = size - margin;

      return createDataURL(size, size, function(x, y) {
        if (min <= x && x < max && min <= y && y < max) {
          var c = Math.floor( (x - min) / cellSize);
          var r = Math.floor( (y - min) / cellSize);
          return _this.isDark(r, c)? 0 : 1;
        } else {
          return 1;
        }
      } );
    };

    _this.createImgTag = function(cellSize, margin, alt) {

      cellSize = cellSize || 2;
      margin = (typeof margin == 'undefined')? cellSize * 4 : margin;

      var size = _this.getModuleCount() * cellSize + margin * 2;

      var img = '';
      img += '<img';
      img += '\u0020src="';
      img += _this.createDataURL(cellSize, margin);
      img += '"';
      img += '\u0020width="';
      img += size;
      img += '"';
      img += '\u0020height="';
      img += size;
      img += '"';
      if (alt) {
        img += '\u0020alt="';
        img += escapeXml(alt);
        img += '"';
      }
      img += '/>';

      return img;
    };

    var escapeXml = function(s) {
      var escaped = '';
      for (var i = 0; i < s.length; i += 1) {
        var c = s.charAt(i);
        switch(c) {
        case '<': escaped += '&lt;'; break;
        case '>': escaped += '&gt;'; break;
        case '&': escaped += '&amp;'; break;
        case '"': escaped += '&quot;'; break;
        default : escaped += c; break;
        }
      }
      return escaped;
    };

    var _createHalfASCII = function(margin) {
      var cellSize = 1;
      margin = (typeof margin == 'undefined')? cellSize * 2 : margin;

      var size = _this.getModuleCount() * cellSize + margin * 2;
      var min = margin;
      var max = size - margin;

      var y, x, r1, r2, p;

      var blocks = {
        '██': '█',
        '█ ': '▀',
        ' █': '▄',
        '  ': ' '
      };

      var blocksLastLineNoMargin = {
        '██': '▀',
        '█ ': '▀',
        ' █': ' ',
        '  ': ' '
      };

      var ascii = '';
      for (y = 0; y < size; y += 2) {
        r1 = Math.floor((y - min) / cellSize);
        r2 = Math.floor((y + 1 - min) / cellSize);
        for (x = 0; x < size; x += 1) {
          p = '█';

          if (min <= x && x < max && min <= y && y < max && _this.isDark(r1, Math.floor((x - min) / cellSize))) {
            p = ' ';
          }

          if (min <= x && x < max && min <= y+1 && y+1 < max && _this.isDark(r2, Math.floor((x - min) / cellSize))) {
            p += ' ';
          }
          else {
            p += '█';
          }

          // Output 2 characters per pixel, to create full square. 1 character per pixels gives only half width of square.
          ascii += (margin < 1 && y+1 >= max) ? blocksLastLineNoMargin[p] : blocks[p];
        }

        ascii += '\n';
      }

      if (size % 2 && margin > 0) {
        return ascii.substring(0, ascii.length - size - 1) + Array(size+1).join('▀');
      }

      return ascii.substring(0, ascii.length-1);
    };

    _this.createASCII = function(cellSize, margin) {
      cellSize = cellSize || 1;

      if (cellSize < 2) {
        return _createHalfASCII(margin);
      }

      cellSize -= 1;
      margin = (typeof margin == 'undefined')? cellSize * 2 : margin;

      var size = _this.getModuleCount() * cellSize + margin * 2;
      var min = margin;
      var max = size - margin;

      var y, x, r, p;

      var white = Array(cellSize+1).join('██');
      var black = Array(cellSize+1).join('  ');

      var ascii = '';
      var line = '';
      for (y = 0; y < size; y += 1) {
        r = Math.floor( (y - min) / cellSize);
        line = '';
        for (x = 0; x < size; x += 1) {
          p = 1;

          if (min <= x && x < max && min <= y && y < max && _this.isDark(r, Math.floor((x - min) / cellSize))) {
            p = 0;
          }

          // Output 2 characters per pixel, to create full square. 1 character per pixels gives only half width of square.
          line += p ? white : black;
        }

        for (r = 0; r < cellSize; r += 1) {
          ascii += line + '\n';
        }
      }

      return ascii.substring(0, ascii.length-1);
    };

    _this.renderTo2dContext = function(context, cellSize) {
      cellSize = cellSize || 2;
      var length = _this.getModuleCount();
      for (var row = 0; row < length; row++) {
        for (var col = 0; col < length; col++) {
          context.fillStyle = _this.isDark(row, col) ? 'black' : 'white';
          context.fillRect(row * cellSize, col * cellSize, cellSize, cellSize);
        }
      }
    }

    return _this;
  };

  //---------------------------------------------------------------------
  // qrcode.stringToBytes
  //---------------------------------------------------------------------

  qrcode.stringToBytesFuncs = {
    'default' : function(s) {
      var bytes = [];
      for (var i = 0; i < s.length; i += 1) {
        var c = s.charCodeAt(i);
        bytes.push(c & 0xff);
      }
      return bytes;
    }
  };

  qrcode.stringToBytes = qrcode.stringToBytesFuncs['default'];

  //---------------------------------------------------------------------
  // qrcode.createStringToBytes
  //---------------------------------------------------------------------

  /**
   * @param unicodeData base64 string of byte array.
   * [16bit Unicode],[16bit Bytes], ...
   * @param numChars
   */
  qrcode.createStringToBytes = function(unicodeData, numChars) {

    // create conversion map.

    var unicodeMap = function() {

      var bin = base64DecodeInputStream(unicodeData);
      var read = function() {
        var b = bin.read();
        if (b == -1) throw 'eof';
        return b;
      };

      var count = 0;
      var unicodeMap = {};
      while (true) {
        var b0 = bin.read();
        if (b0 == -1) break;
        var b1 = read();
        var b2 = read();
        var b3 = read();
        var k = String.fromCharCode( (b0 << 8) | b1);
        var v = (b2 << 8) | b3;
        unicodeMap[k] = v;
        count += 1;
      }
      if (count != numChars) {
        throw count + ' != ' + numChars;
      }

      return unicodeMap;
    }();

    var unknownChar = '?'.charCodeAt(0);

    return function(s) {
      var bytes = [];
      for (var i = 0; i < s.length; i += 1) {
        var c = s.charCodeAt(i);
        if (c < 128) {
          bytes.push(c);
        } else {
          var b = unicodeMap[s.charAt(i)];
          if (typeof b == 'number') {
            if ( (b & 0xff) == b) {
              // 1byte
              bytes.push(b);
            } else {
              // 2bytes
              bytes.push(b >>> 8);
              bytes.push(b & 0xff);
            }
          } else {
            bytes.push(unknownChar);
          }
        }
      }
      return bytes;
    };
  };

  //---------------------------------------------------------------------
  // QRMode
  //---------------------------------------------------------------------

  var QRMode = {
    MODE_NUMBER :    1 << 0,
    MODE_ALPHA_NUM : 1 << 1,
    MODE_8BIT_BYTE : 1 << 2,
    MODE_KANJI :     1 << 3
  };

  //---------------------------------------------------------------------
  // QRErrorCorrectionLevel
  //---------------------------------------------------------------------

  var QRErrorCorrectionLevel = {
    L : 1,
    M : 0,
    Q : 3,
    H : 2
  };

  //---------------------------------------------------------------------
  // QRMaskPattern
  //---------------------------------------------------------------------

  var QRMaskPattern = {
    PATTERN000 : 0,
    PATTERN001 : 1,
    PATTERN010 : 2,
    PATTERN011 : 3,
    PATTERN100 : 4,
    PATTERN101 : 5,
    PATTERN110 : 6,
    PATTERN111 : 7
  };

  //---------------------------------------------------------------------
  // QRUtil
  //---------------------------------------------------------------------

  var QRUtil = function() {

    var PATTERN_POSITION_TABLE = [
      [],
      [6, 18],
      [6, 22],
      [6, 26],
      [6, 30],
      [6, 34],
      [6, 22, 38],
      [6, 24, 42],
      [6, 26, 46],
      [6, 28, 50],
      [6, 30, 54],
      [6, 32, 58],
      [6, 34, 62],
      [6, 26, 46, 66],
      [6, 26, 48, 70],
      [6, 26, 50, 74],
      [6, 30, 54, 78],
      [6, 30, 56, 82],
      [6, 30, 58, 86],
      [6, 34, 62, 90],
      [6, 28, 50, 72, 94],
      [6, 26, 50, 74, 98],
      [6, 30, 54, 78, 102],
      [6, 28, 54, 80, 106],
      [6, 32, 58, 84, 110],
      [6, 30, 58, 86, 114],
      [6, 34, 62, 90, 118],
      [6, 26, 50, 74, 98, 122],
      [6, 30, 54, 78, 102, 126],
      [6, 26, 52, 78, 104, 130],
      [6, 30, 56, 82, 108, 134],
      [6, 34, 60, 86, 112, 138],
      [6, 30, 58, 86, 114, 142],
      [6, 34, 62, 90, 118, 146],
      [6, 30, 54, 78, 102, 126, 150],
      [6, 24, 50, 76, 102, 128, 154],
      [6, 28, 54, 80, 106, 132, 158],
      [6, 32, 58, 84, 110, 136, 162],
      [6, 26, 54, 82, 110, 138, 166],
      [6, 30, 58, 86, 114, 142, 170]
    ];
    var G15 = (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0);
    var G18 = (1 << 12) | (1 << 11) | (1 << 10) | (1 << 9) | (1 << 8) | (1 << 5) | (1 << 2) | (1 << 0);
    var G15_MASK = (1 << 14) | (1 << 12) | (1 << 10) | (1 << 4) | (1 << 1);

    var _this = {};

    var getBCHDigit = function(data) {
      var digit = 0;
      while (data != 0) {
        digit += 1;
        data >>>= 1;
      }
      return digit;
    };

    _this.getBCHTypeInfo = function(data) {
      var d = data << 10;
      while (getBCHDigit(d) - getBCHDigit(G15) >= 0) {
        d ^= (G15 << (getBCHDigit(d) - getBCHDigit(G15) ) );
      }
      return ( (data << 10) | d) ^ G15_MASK;
    };

    _this.getBCHTypeNumber = function(data) {
      var d = data << 12;
      while (getBCHDigit(d) - getBCHDigit(G18) >= 0) {
        d ^= (G18 << (getBCHDigit(d) - getBCHDigit(G18) ) );
      }
      return (data << 12) | d;
    };

    _this.getPatternPosition = function(typeNumber) {
      return PATTERN_POSITION_TABLE[typeNumber - 1];
    };

    _this.getMaskFunction = function(maskPattern) {

      switch (maskPattern) {

      case QRMaskPattern.PATTERN000 :
        return function(i, j) { return (i + j) % 2 == 0; };
      case QRMaskPattern.PATTERN001 :
        return function(i, j) { return i % 2 == 0; };
      case QRMaskPattern.PATTERN010 :
        return function(i, j) { return j % 3 == 0; };
      case QRMaskPattern.PATTERN011 :
        return function(i, j) { return (i + j) % 3 == 0; };
      case QRMaskPattern.PATTERN100 :
        return function(i, j) { return (Math.floor(i / 2) + Math.floor(j / 3) ) % 2 == 0; };
      case QRMaskPattern.PATTERN101 :
        return function(i, j) { return (i * j) % 2 + (i * j) % 3 == 0; };
      case QRMaskPattern.PATTERN110 :
        return function(i, j) { return ( (i * j) % 2 + (i * j) % 3) % 2 == 0; };
      case QRMaskPattern.PATTERN111 :
        return function(i, j) { return ( (i * j) % 3 + (i + j) % 2) % 2 == 0; };

      default :
        throw 'bad maskPattern:' + maskPattern;
      }
    };

    _this.getErrorCorrectPolynomial = function(errorCorrectLength) {
      var a = qrPolynomial([1], 0);
      for (var i = 0; i < errorCorrectLength; i += 1) {
        a = a.multiply(qrPolynomial([1, QRMath.gexp(i)], 0) );
      }
      return a;
    };

    _this.getLengthInBits = function(mode, type) {

      if (1 <= type && type < 10) {

        // 1 - 9

        switch(mode) {
        case QRMode.MODE_NUMBER    : return 10;
        case QRMode.MODE_ALPHA_NUM : return 9;
        case QRMode.MODE_8BIT_BYTE : return 8;
        case QRMode.MODE_KANJI     : return 8;
        default :
          throw 'mode:' + mode;
        }

      } else if (type < 27) {

        // 10 - 26

        switch(mode) {
        case QRMode.MODE_NUMBER    : return 12;
        case QRMode.MODE_ALPHA_NUM : return 11;
        case QRMode.MODE_8BIT_BYTE : return 16;
        case QRMode.MODE_KANJI     : return 10;
        default :
          throw 'mode:' + mode;
        }

      } else if (type < 41) {

        // 27 - 40

        switch(mode) {
        case QRMode.MODE_NUMBER    : return 14;
        case QRMode.MODE_ALPHA_NUM : return 13;
        case QRMode.MODE_8BIT_BYTE : return 16;
        case QRMode.MODE_KANJI     : return 12;
        default :
          throw 'mode:' + mode;
        }

      } else {
        throw 'type:' + type;
      }
    };

    _this.getLostPoint = function(qrcode) {

      var moduleCount = qrcode.getModuleCount();

      var lostPoint = 0;

      // LEVEL1

      for (var row = 0; row < moduleCount; row += 1) {
        for (var col = 0; col < moduleCount; col += 1) {

          var sameCount = 0;
          var dark = qrcode.isDark(row, col);

          for (var r = -1; r <= 1; r += 1) {

            if (row + r < 0 || moduleCount <= row + r) {
              continue;
            }

            for (var c = -1; c <= 1; c += 1) {

              if (col + c < 0 || moduleCount <= col + c) {
                continue;
              }

              if (r == 0 && c == 0) {
                continue;
              }

              if (dark == qrcode.isDark(row + r, col + c) ) {
                sameCount += 1;
              }
            }
          }

          if (sameCount > 5) {
            lostPoint += (3 + sameCount - 5);
          }
        }
      };

      // LEVEL2

      for (var row = 0; row < moduleCount - 1; row += 1) {
        for (var col = 0; col < moduleCount - 1; col += 1) {
          var count = 0;
          if (qrcode.isDark(row, col) ) count += 1;
          if (qrcode.isDark(row + 1, col) ) count += 1;
          if (qrcode.isDark(row, col + 1) ) count += 1;
          if (qrcode.isDark(row + 1, col + 1) ) count += 1;
          if (count == 0 || count == 4) {
            lostPoint += 3;
          }
        }
      }

      // LEVEL3

      for (var row = 0; row < moduleCount; row += 1) {
        for (var col = 0; col < moduleCount - 6; col += 1) {
          if (qrcode.isDark(row, col)
              && !qrcode.isDark(row, col + 1)
              &&  qrcode.isDark(row, col + 2)
              &&  qrcode.isDark(row, col + 3)
              &&  qrcode.isDark(row, col + 4)
              && !qrcode.isDark(row, col + 5)
              &&  qrcode.isDark(row, col + 6) ) {
            lostPoint += 40;
          }
        }
      }

      for (var col = 0; col < moduleCount; col += 1) {
        for (var row = 0; row < moduleCount - 6; row += 1) {
          if (qrcode.isDark(row, col)
              && !qrcode.isDark(row + 1, col)
              &&  qrcode.isDark(row + 2, col)
              &&  qrcode.isDark(row + 3, col)
              &&  qrcode.isDark(row + 4, col)
              && !qrcode.isDark(row + 5, col)
              &&  qrcode.isDark(row + 6, col) ) {
            lostPoint += 40;
          }
        }
      }

      // LEVEL4

      var darkCount = 0;

      for (var col = 0; col < moduleCount; col += 1) {
        for (var row = 0; row < moduleCount; row += 1) {
          if (qrcode.isDark(row, col) ) {
            darkCount += 1;
          }
        }
      }

      var ratio = Math.abs(100 * darkCount / moduleCount / moduleCount - 50) / 5;
      lostPoint += ratio * 10;

      return lostPoint;
    };

    return _this;
  }();

  //---------------------------------------------------------------------
  // QRMath
  //---------------------------------------------------------------------

  var QRMath = function() {

    var EXP_TABLE = new Array(256);
    var LOG_TABLE = new Array(256);

    // initialize tables
    for (var i = 0; i < 8; i += 1) {
      EXP_TABLE[i] = 1 << i;
    }
    for (var i = 8; i < 256; i += 1) {
      EXP_TABLE[i] = EXP_TABLE[i - 4]
        ^ EXP_TABLE[i - 5]
        ^ EXP_TABLE[i - 6]
        ^ EXP_TABLE[i - 8];
    }
    for (var i = 0; i < 255; i += 1) {
      LOG_TABLE[EXP_TABLE[i] ] = i;
    }

    var _this = {};

    _this.glog = function(n) {

      if (n < 1) {
        throw 'glog(' + n + ')';
      }

      return LOG_TABLE[n];
    };

    _this.gexp = function(n) {

      while (n < 0) {
        n += 255;
      }

      while (n >= 256) {
        n -= 255;
      }

      return EXP_TABLE[n];
    };

    return _this;
  }();

  //---------------------------------------------------------------------
  // qrPolynomial
  //---------------------------------------------------------------------

  function qrPolynomial(num, shift) {

    if (typeof num.length == 'undefined') {
      throw num.length + '/' + shift;
    }

    var _num = function() {
      var offset = 0;
      while (offset < num.length && num[offset] == 0) {
        offset += 1;
      }
      var _num = new Array(num.length - offset + shift);
      for (var i = 0; i < num.length - offset; i += 1) {
        _num[i] = num[i + offset];
      }
      return _num;
    }();

    var _this = {};

    _this.getAt = function(index) {
      return _num[index];
    };

    _this.getLength = function() {
      return _num.length;
    };

    _this.multiply = function(e) {

      var num = new Array(_this.getLength() + e.getLength() - 1);

      for (var i = 0; i < _this.getLength(); i += 1) {
        for (var j = 0; j < e.getLength(); j += 1) {
          num[i + j] ^= QRMath.gexp(QRMath.glog(_this.getAt(i) ) + QRMath.glog(e.getAt(j) ) );
        }
      }

      return qrPolynomial(num, 0);
    };

    _this.mod = function(e) {

      if (_this.getLength() - e.getLength() < 0) {
        return _this;
      }

      var ratio = QRMath.glog(_this.getAt(0) ) - QRMath.glog(e.getAt(0) );

      var num = new Array(_this.getLength() );
      for (var i = 0; i < _this.getLength(); i += 1) {
        num[i] = _this.getAt(i);
      }

      for (var i = 0; i < e.getLength(); i += 1) {
        num[i] ^= QRMath.gexp(QRMath.glog(e.getAt(i) ) + ratio);
      }

      // recursive call
      return qrPolynomial(num, 0).mod(e);
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // QRRSBlock
  //---------------------------------------------------------------------

  var QRRSBlock = function() {

    var RS_BLOCK_TABLE = [

      // L
      // M
      // Q
      // H

      // 1
      [1, 26, 19],
      [1, 26, 16],
      [1, 26, 13],
      [1, 26, 9],

      // 2
      [1, 44, 34],
      [1, 44, 28],
      [1, 44, 22],
      [1, 44, 16],

      // 3
      [1, 70, 55],
      [1, 70, 44],
      [2, 35, 17],
      [2, 35, 13],

      // 4
      [1, 100, 80],
      [2, 50, 32],
      [2, 50, 24],
      [4, 25, 9],

      // 5
      [1, 134, 108],
      [2, 67, 43],
      [2, 33, 15, 2, 34, 16],
      [2, 33, 11, 2, 34, 12],

      // 6
      [2, 86, 68],
      [4, 43, 27],
      [4, 43, 19],
      [4, 43, 15],

      // 7
      [2, 98, 78],
      [4, 49, 31],
      [2, 32, 14, 4, 33, 15],
      [4, 39, 13, 1, 40, 14],

      // 8
      [2, 121, 97],
      [2, 60, 38, 2, 61, 39],
      [4, 40, 18, 2, 41, 19],
      [4, 40, 14, 2, 41, 15],

      // 9
      [2, 146, 116],
      [3, 58, 36, 2, 59, 37],
      [4, 36, 16, 4, 37, 17],
      [4, 36, 12, 4, 37, 13],

      // 10
      [2, 86, 68, 2, 87, 69],
      [4, 69, 43, 1, 70, 44],
      [6, 43, 19, 2, 44, 20],
      [6, 43, 15, 2, 44, 16],

      // 11
      [4, 101, 81],
      [1, 80, 50, 4, 81, 51],
      [4, 50, 22, 4, 51, 23],
      [3, 36, 12, 8, 37, 13],

      // 12
      [2, 116, 92, 2, 117, 93],
      [6, 58, 36, 2, 59, 37],
      [4, 46, 20, 6, 47, 21],
      [7, 42, 14, 4, 43, 15],

      // 13
      [4, 133, 107],
      [8, 59, 37, 1, 60, 38],
      [8, 44, 20, 4, 45, 21],
      [12, 33, 11, 4, 34, 12],

      // 14
      [3, 145, 115, 1, 146, 116],
      [4, 64, 40, 5, 65, 41],
      [11, 36, 16, 5, 37, 17],
      [11, 36, 12, 5, 37, 13],

      // 15
      [5, 109, 87, 1, 110, 88],
      [5, 65, 41, 5, 66, 42],
      [5, 54, 24, 7, 55, 25],
      [11, 36, 12, 7, 37, 13],

      // 16
      [5, 122, 98, 1, 123, 99],
      [7, 73, 45, 3, 74, 46],
      [15, 43, 19, 2, 44, 20],
      [3, 45, 15, 13, 46, 16],

      // 17
      [1, 135, 107, 5, 136, 108],
      [10, 74, 46, 1, 75, 47],
      [1, 50, 22, 15, 51, 23],
      [2, 42, 14, 17, 43, 15],

      // 18
      [5, 150, 120, 1, 151, 121],
      [9, 69, 43, 4, 70, 44],
      [17, 50, 22, 1, 51, 23],
      [2, 42, 14, 19, 43, 15],

      // 19
      [3, 141, 113, 4, 142, 114],
      [3, 70, 44, 11, 71, 45],
      [17, 47, 21, 4, 48, 22],
      [9, 39, 13, 16, 40, 14],

      // 20
      [3, 135, 107, 5, 136, 108],
      [3, 67, 41, 13, 68, 42],
      [15, 54, 24, 5, 55, 25],
      [15, 43, 15, 10, 44, 16],

      // 21
      [4, 144, 116, 4, 145, 117],
      [17, 68, 42],
      [17, 50, 22, 6, 51, 23],
      [19, 46, 16, 6, 47, 17],

      // 22
      [2, 139, 111, 7, 140, 112],
      [17, 74, 46],
      [7, 54, 24, 16, 55, 25],
      [34, 37, 13],

      // 23
      [4, 151, 121, 5, 152, 122],
      [4, 75, 47, 14, 76, 48],
      [11, 54, 24, 14, 55, 25],
      [16, 45, 15, 14, 46, 16],

      // 24
      [6, 147, 117, 4, 148, 118],
      [6, 73, 45, 14, 74, 46],
      [11, 54, 24, 16, 55, 25],
      [30, 46, 16, 2, 47, 17],

      // 25
      [8, 132, 106, 4, 133, 107],
      [8, 75, 47, 13, 76, 48],
      [7, 54, 24, 22, 55, 25],
      [22, 45, 15, 13, 46, 16],

      // 26
      [10, 142, 114, 2, 143, 115],
      [19, 74, 46, 4, 75, 47],
      [28, 50, 22, 6, 51, 23],
      [33, 46, 16, 4, 47, 17],

      // 27
      [8, 152, 122, 4, 153, 123],
      [22, 73, 45, 3, 74, 46],
      [8, 53, 23, 26, 54, 24],
      [12, 45, 15, 28, 46, 16],

      // 28
      [3, 147, 117, 10, 148, 118],
      [3, 73, 45, 23, 74, 46],
      [4, 54, 24, 31, 55, 25],
      [11, 45, 15, 31, 46, 16],

      // 29
      [7, 146, 116, 7, 147, 117],
      [21, 73, 45, 7, 74, 46],
      [1, 53, 23, 37, 54, 24],
      [19, 45, 15, 26, 46, 16],

      // 30
      [5, 145, 115, 10, 146, 116],
      [19, 75, 47, 10, 76, 48],
      [15, 54, 24, 25, 55, 25],
      [23, 45, 15, 25, 46, 16],

      // 31
      [13, 145, 115, 3, 146, 116],
      [2, 74, 46, 29, 75, 47],
      [42, 54, 24, 1, 55, 25],
      [23, 45, 15, 28, 46, 16],

      // 32
      [17, 145, 115],
      [10, 74, 46, 23, 75, 47],
      [10, 54, 24, 35, 55, 25],
      [19, 45, 15, 35, 46, 16],

      // 33
      [17, 145, 115, 1, 146, 116],
      [14, 74, 46, 21, 75, 47],
      [29, 54, 24, 19, 55, 25],
      [11, 45, 15, 46, 46, 16],

      // 34
      [13, 145, 115, 6, 146, 116],
      [14, 74, 46, 23, 75, 47],
      [44, 54, 24, 7, 55, 25],
      [59, 46, 16, 1, 47, 17],

      // 35
      [12, 151, 121, 7, 152, 122],
      [12, 75, 47, 26, 76, 48],
      [39, 54, 24, 14, 55, 25],
      [22, 45, 15, 41, 46, 16],

      // 36
      [6, 151, 121, 14, 152, 122],
      [6, 75, 47, 34, 76, 48],
      [46, 54, 24, 10, 55, 25],
      [2, 45, 15, 64, 46, 16],

      // 37
      [17, 152, 122, 4, 153, 123],
      [29, 74, 46, 14, 75, 47],
      [49, 54, 24, 10, 55, 25],
      [24, 45, 15, 46, 46, 16],

      // 38
      [4, 152, 122, 18, 153, 123],
      [13, 74, 46, 32, 75, 47],
      [48, 54, 24, 14, 55, 25],
      [42, 45, 15, 32, 46, 16],

      // 39
      [20, 147, 117, 4, 148, 118],
      [40, 75, 47, 7, 76, 48],
      [43, 54, 24, 22, 55, 25],
      [10, 45, 15, 67, 46, 16],

      // 40
      [19, 148, 118, 6, 149, 119],
      [18, 75, 47, 31, 76, 48],
      [34, 54, 24, 34, 55, 25],
      [20, 45, 15, 61, 46, 16]
    ];

    var qrRSBlock = function(totalCount, dataCount) {
      var _this = {};
      _this.totalCount = totalCount;
      _this.dataCount = dataCount;
      return _this;
    };

    var _this = {};

    var getRsBlockTable = function(typeNumber, errorCorrectionLevel) {

      switch(errorCorrectionLevel) {
      case QRErrorCorrectionLevel.L :
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 0];
      case QRErrorCorrectionLevel.M :
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 1];
      case QRErrorCorrectionLevel.Q :
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 2];
      case QRErrorCorrectionLevel.H :
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 3];
      default :
        return undefined;
      }
    };

    _this.getRSBlocks = function(typeNumber, errorCorrectionLevel) {

      var rsBlock = getRsBlockTable(typeNumber, errorCorrectionLevel);

      if (typeof rsBlock == 'undefined') {
        throw 'bad rs block @ typeNumber:' + typeNumber +
            '/errorCorrectionLevel:' + errorCorrectionLevel;
      }

      var length = rsBlock.length / 3;

      var list = [];

      for (var i = 0; i < length; i += 1) {

        var count = rsBlock[i * 3 + 0];
        var totalCount = rsBlock[i * 3 + 1];
        var dataCount = rsBlock[i * 3 + 2];

        for (var j = 0; j < count; j += 1) {
          list.push(qrRSBlock(totalCount, dataCount) );
        }
      }

      return list;
    };

    return _this;
  }();

  //---------------------------------------------------------------------
  // qrBitBuffer
  //---------------------------------------------------------------------

  var qrBitBuffer = function() {

    var _buffer = [];
    var _length = 0;

    var _this = {};

    _this.getBuffer = function() {
      return _buffer;
    };

    _this.getAt = function(index) {
      var bufIndex = Math.floor(index / 8);
      return ( (_buffer[bufIndex] >>> (7 - index % 8) ) & 1) == 1;
    };

    _this.put = function(num, length) {
      for (var i = 0; i < length; i += 1) {
        _this.putBit( ( (num >>> (length - i - 1) ) & 1) == 1);
      }
    };

    _this.getLengthInBits = function() {
      return _length;
    };

    _this.putBit = function(bit) {

      var bufIndex = Math.floor(_length / 8);
      if (_buffer.length <= bufIndex) {
        _buffer.push(0);
      }

      if (bit) {
        _buffer[bufIndex] |= (0x80 >>> (_length % 8) );
      }

      _length += 1;
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // qrNumber
  //---------------------------------------------------------------------

  var qrNumber = function(data) {

    var _mode = QRMode.MODE_NUMBER;
    var _data = data;

    var _this = {};

    _this.getMode = function() {
      return _mode;
    };

    _this.getLength = function(buffer) {
      return _data.length;
    };

    _this.write = function(buffer) {

      var data = _data;

      var i = 0;

      while (i + 2 < data.length) {
        buffer.put(strToNum(data.substring(i, i + 3) ), 10);
        i += 3;
      }

      if (i < data.length) {
        if (data.length - i == 1) {
          buffer.put(strToNum(data.substring(i, i + 1) ), 4);
        } else if (data.length - i == 2) {
          buffer.put(strToNum(data.substring(i, i + 2) ), 7);
        }
      }
    };

    var strToNum = function(s) {
      var num = 0;
      for (var i = 0; i < s.length; i += 1) {
        num = num * 10 + chatToNum(s.charAt(i) );
      }
      return num;
    };

    var chatToNum = function(c) {
      if ('0' <= c && c <= '9') {
        return c.charCodeAt(0) - '0'.charCodeAt(0);
      }
      throw 'illegal char :' + c;
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // qrAlphaNum
  //---------------------------------------------------------------------

  var qrAlphaNum = function(data) {

    var _mode = QRMode.MODE_ALPHA_NUM;
    var _data = data;

    var _this = {};

    _this.getMode = function() {
      return _mode;
    };

    _this.getLength = function(buffer) {
      return _data.length;
    };

    _this.write = function(buffer) {

      var s = _data;

      var i = 0;

      while (i + 1 < s.length) {
        buffer.put(
          getCode(s.charAt(i) ) * 45 +
          getCode(s.charAt(i + 1) ), 11);
        i += 2;
      }

      if (i < s.length) {
        buffer.put(getCode(s.charAt(i) ), 6);
      }
    };

    var getCode = function(c) {

      if ('0' <= c && c <= '9') {
        return c.charCodeAt(0) - '0'.charCodeAt(0);
      } else if ('A' <= c && c <= 'Z') {
        return c.charCodeAt(0) - 'A'.charCodeAt(0) + 10;
      } else {
        switch (c) {
        case ' ' : return 36;
        case '$' : return 37;
        case '%' : return 38;
        case '*' : return 39;
        case '+' : return 40;
        case '-' : return 41;
        case '.' : return 42;
        case '/' : return 43;
        case ':' : return 44;
        default :
          throw 'illegal char :' + c;
        }
      }
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // qr8BitByte
  //---------------------------------------------------------------------

  var qr8BitByte = function(data) {

    var _mode = QRMode.MODE_8BIT_BYTE;
    var _data = data;
    var _bytes = qrcode.stringToBytes(data);

    var _this = {};

    _this.getMode = function() {
      return _mode;
    };

    _this.getLength = function(buffer) {
      return _bytes.length;
    };

    _this.write = function(buffer) {
      for (var i = 0; i < _bytes.length; i += 1) {
        buffer.put(_bytes[i], 8);
      }
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // qrKanji
  //---------------------------------------------------------------------

  var qrKanji = function(data) {

    var _mode = QRMode.MODE_KANJI;
    var _data = data;

    var stringToBytes = qrcode.stringToBytesFuncs['SJIS'];
    if (!stringToBytes) {
      throw 'sjis not supported.';
    }
    !function(c, code) {
      // self test for sjis support.
      var test = stringToBytes(c);
      if (test.length != 2 || ( (test[0] << 8) | test[1]) != code) {
        throw 'sjis not supported.';
      }
    }('\u53cb', 0x9746);

    var _bytes = stringToBytes(data);

    var _this = {};

    _this.getMode = function() {
      return _mode;
    };

    _this.getLength = function(buffer) {
      return ~~(_bytes.length / 2);
    };

    _this.write = function(buffer) {

      var data = _bytes;

      var i = 0;

      while (i + 1 < data.length) {

        var c = ( (0xff & data[i]) << 8) | (0xff & data[i + 1]);

        if (0x8140 <= c && c <= 0x9FFC) {
          c -= 0x8140;
        } else if (0xE040 <= c && c <= 0xEBBF) {
          c -= 0xC140;
        } else {
          throw 'illegal char at ' + (i + 1) + '/' + c;
        }

        c = ( (c >>> 8) & 0xff) * 0xC0 + (c & 0xff);

        buffer.put(c, 13);

        i += 2;
      }

      if (i < data.length) {
        throw 'illegal char at ' + (i + 1);
      }
    };

    return _this;
  };

  //=====================================================================
  // GIF Support etc.
  //

  //---------------------------------------------------------------------
  // byteArrayOutputStream
  //---------------------------------------------------------------------

  var byteArrayOutputStream = function() {

    var _bytes = [];

    var _this = {};

    _this.writeByte = function(b) {
      _bytes.push(b & 0xff);
    };

    _this.writeShort = function(i) {
      _this.writeByte(i);
      _this.writeByte(i >>> 8);
    };

    _this.writeBytes = function(b, off, len) {
      off = off || 0;
      len = len || b.length;
      for (var i = 0; i < len; i += 1) {
        _this.writeByte(b[i + off]);
      }
    };

    _this.writeString = function(s) {
      for (var i = 0; i < s.length; i += 1) {
        _this.writeByte(s.charCodeAt(i) );
      }
    };

    _this.toByteArray = function() {
      return _bytes;
    };

    _this.toString = function() {
      var s = '';
      s += '[';
      for (var i = 0; i < _bytes.length; i += 1) {
        if (i > 0) {
          s += ',';
        }
        s += _bytes[i];
      }
      s += ']';
      return s;
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // base64EncodeOutputStream
  //---------------------------------------------------------------------

  var base64EncodeOutputStream = function() {

    var _buffer = 0;
    var _buflen = 0;
    var _length = 0;
    var _base64 = '';

    var _this = {};

    var writeEncoded = function(b) {
      _base64 += String.fromCharCode(encode(b & 0x3f) );
    };

    var encode = function(n) {
      if (n < 0) {
        // error.
      } else if (n < 26) {
        return 0x41 + n;
      } else if (n < 52) {
        return 0x61 + (n - 26);
      } else if (n < 62) {
        return 0x30 + (n - 52);
      } else if (n == 62) {
        return 0x2b;
      } else if (n == 63) {
        return 0x2f;
      }
      throw 'n:' + n;
    };

    _this.writeByte = function(n) {

      _buffer = (_buffer << 8) | (n & 0xff);
      _buflen += 8;
      _length += 1;

      while (_buflen >= 6) {
        writeEncoded(_buffer >>> (_buflen - 6) );
        _buflen -= 6;
      }
    };

    _this.flush = function() {

      if (_buflen > 0) {
        writeEncoded(_buffer << (6 - _buflen) );
        _buffer = 0;
        _buflen = 0;
      }

      if (_length % 3 != 0) {
        // padding
        var padlen = 3 - _length % 3;
        for (var i = 0; i < padlen; i += 1) {
          _base64 += '=';
        }
      }
    };

    _this.toString = function() {
      return _base64;
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // base64DecodeInputStream
  //---------------------------------------------------------------------

  var base64DecodeInputStream = function(str) {

    var _str = str;
    var _pos = 0;
    var _buffer = 0;
    var _buflen = 0;

    var _this = {};

    _this.read = function() {

      while (_buflen < 8) {

        if (_pos >= _str.length) {
          if (_buflen == 0) {
            return -1;
          }
          throw 'unexpected end of file./' + _buflen;
        }

        var c = _str.charAt(_pos);
        _pos += 1;

        if (c == '=') {
          _buflen = 0;
          return -1;
        } else if (c.match(/^\s$/) ) {
          // ignore if whitespace.
          continue;
        }

        _buffer = (_buffer << 6) | decode(c.charCodeAt(0) );
        _buflen += 6;
      }

      var n = (_buffer >>> (_buflen - 8) ) & 0xff;
      _buflen -= 8;
      return n;
    };

    var decode = function(c) {
      if (0x41 <= c && c <= 0x5a) {
        return c - 0x41;
      } else if (0x61 <= c && c <= 0x7a) {
        return c - 0x61 + 26;
      } else if (0x30 <= c && c <= 0x39) {
        return c - 0x30 + 52;
      } else if (c == 0x2b) {
        return 62;
      } else if (c == 0x2f) {
        return 63;
      } else {
        throw 'c:' + c;
      }
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // gifImage (B/W)
  //---------------------------------------------------------------------

  var gifImage = function(width, height) {

    var _width = width;
    var _height = height;
    var _data = new Array(width * height);

    var _this = {};

    _this.setPixel = function(x, y, pixel) {
      _data[y * _width + x] = pixel;
    };

    _this.write = function(out) {

      //---------------------------------
      // GIF Signature

      out.writeString('GIF87a');

      //---------------------------------
      // Screen Descriptor

      out.writeShort(_width);
      out.writeShort(_height);

      out.writeByte(0x80); // 2bit
      out.writeByte(0);
      out.writeByte(0);

      //---------------------------------
      // Global Color Map

      // black
      out.writeByte(0x00);
      out.writeByte(0x00);
      out.writeByte(0x00);

      // white
      out.writeByte(0xff);
      out.writeByte(0xff);
      out.writeByte(0xff);

      //---------------------------------
      // Image Descriptor

      out.writeString(',');
      out.writeShort(0);
      out.writeShort(0);
      out.writeShort(_width);
      out.writeShort(_height);
      out.writeByte(0);

      //---------------------------------
      // Local Color Map

      //---------------------------------
      // Raster Data

      var lzwMinCodeSize = 2;
      var raster = getLZWRaster(lzwMinCodeSize);

      out.writeByte(lzwMinCodeSize);

      var offset = 0;

      while (raster.length - offset > 255) {
        out.writeByte(255);
        out.writeBytes(raster, offset, 255);
        offset += 255;
      }

      out.writeByte(raster.length - offset);
      out.writeBytes(raster, offset, raster.length - offset);
      out.writeByte(0x00);

      //---------------------------------
      // GIF Terminator
      out.writeString(';');
    };

    var bitOutputStream = function(out) {

      var _out = out;
      var _bitLength = 0;
      var _bitBuffer = 0;

      var _this = {};

      _this.write = function(data, length) {

        if ( (data >>> length) != 0) {
          throw 'length over';
        }

        while (_bitLength + length >= 8) {
          _out.writeByte(0xff & ( (data << _bitLength) | _bitBuffer) );
          length -= (8 - _bitLength);
          data >>>= (8 - _bitLength);
          _bitBuffer = 0;
          _bitLength = 0;
        }

        _bitBuffer = (data << _bitLength) | _bitBuffer;
        _bitLength = _bitLength + length;
      };

      _this.flush = function() {
        if (_bitLength > 0) {
          _out.writeByte(_bitBuffer);
        }
      };

      return _this;
    };

    var getLZWRaster = function(lzwMinCodeSize) {

      var clearCode = 1 << lzwMinCodeSize;
      var endCode = (1 << lzwMinCodeSize) + 1;
      var bitLength = lzwMinCodeSize + 1;

      // Setup LZWTable
      var table = lzwTable();

      for (var i = 0; i < clearCode; i += 1) {
        table.add(String.fromCharCode(i) );
      }
      table.add(String.fromCharCode(clearCode) );
      table.add(String.fromCharCode(endCode) );

      var byteOut = byteArrayOutputStream();
      var bitOut = bitOutputStream(byteOut);

      // clear code
      bitOut.write(clearCode, bitLength);

      var dataIndex = 0;

      var s = String.fromCharCode(_data[dataIndex]);
      dataIndex += 1;

      while (dataIndex < _data.length) {

        var c = String.fromCharCode(_data[dataIndex]);
        dataIndex += 1;

        if (table.contains(s + c) ) {

          s = s + c;

        } else {

          bitOut.write(table.indexOf(s), bitLength);

          if (table.size() < 0xfff) {

            if (table.size() == (1 << bitLength) ) {
              bitLength += 1;
            }

            table.add(s + c);
          }

          s = c;
        }
      }

      bitOut.write(table.indexOf(s), bitLength);

      // end code
      bitOut.write(endCode, bitLength);

      bitOut.flush();

      return byteOut.toByteArray();
    };

    var lzwTable = function() {

      var _map = {};
      var _size = 0;

      var _this = {};

      _this.add = function(key) {
        if (_this.contains(key) ) {
          throw 'dup key:' + key;
        }
        _map[key] = _size;
        _size += 1;
      };

      _this.size = function() {
        return _size;
      };

      _this.indexOf = function(key) {
        return _map[key];
      };

      _this.contains = function(key) {
        return typeof _map[key] != 'undefined';
      };

      return _this;
    };

    return _this;
  };

  var createDataURL = function(width, height, getPixel) {
    var gif = gifImage(width, height);
    for (var y = 0; y < height; y += 1) {
      for (var x = 0; x < width; x += 1) {
        gif.setPixel(x, y, getPixel(x, y) );
      }
    }

    var b = byteArrayOutputStream();
    gif.write(b);

    var base64 = base64EncodeOutputStream();
    var bytes = b.toByteArray();
    for (var i = 0; i < bytes.length; i += 1) {
      base64.writeByte(bytes[i]);
    }
    base64.flush();

    return 'data:image/gif;base64,' + base64;
  };

  //---------------------------------------------------------------------
  // returns qrcode function.

  return qrcode;
}();

// multibyte support
!function() {

  qrcode.stringToBytesFuncs['UTF-8'] = function(s) {
    // http://stackoverflow.com/questions/18729405/how-to-convert-utf8-string-to-byte-array
    function toUTF8Array(str) {
      var utf8 = [];
      for (var i=0; i < str.length; i++) {
        var charcode = str.charCodeAt(i);
        if (charcode < 0x80) utf8.push(charcode);
        else if (charcode < 0x800) {
          utf8.push(0xc0 | (charcode >> 6),
              0x80 | (charcode & 0x3f));
        }
        else if (charcode < 0xd800 || charcode >= 0xe000) {
          utf8.push(0xe0 | (charcode >> 12),
              0x80 | ((charcode>>6) & 0x3f),
              0x80 | (charcode & 0x3f));
        }
        // surrogate pair
        else {
          i++;
          // UTF-16 encodes 0x10000-0x10FFFF by
          // subtracting 0x10000 and splitting the
          // 20 bits of 0x0-0xFFFFF into two halves
          charcode = 0x10000 + (((charcode & 0x3ff)<<10)
            | (str.charCodeAt(i) & 0x3ff));
          utf8.push(0xf0 | (charcode >>18),
              0x80 | ((charcode>>12) & 0x3f),
              0x80 | ((charcode>>6) & 0x3f),
              0x80 | (charcode & 0x3f));
        }
      }
      return utf8;
    }
    return toUTF8Array(s);
  };

}();

(function (factory) {
  if (typeof define === 'function' && define.amd) {
      define([], factory);
  } else if (typeof exports === 'object') {
      module.exports = factory();
  }
}(function () {
    return qrcode;
}));

    return module.exports;
  }
  // END BUNDLED LOGIN VENDORS

  if (page.self === page.top) {
    // Start reading the real browser account before presenting account choices.
    void detectBrowserAccount();
    GM_registerMenuCommand('PiliPlus：账号切换', openPanel);
    GM_registerMenuCommand('PiliPlus：紧急停用并刷新', () => { state.enabled = false; save(); page.location.reload(); });
    if (document.documentElement) mount();
    else new MutationObserver((_records, observer) => {
      if (document.documentElement) { observer.disconnect(); mount(); }
    }).observe(document, { childList: true });
  }
})();
