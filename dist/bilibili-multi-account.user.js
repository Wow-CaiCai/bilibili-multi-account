// ==UserScript==
// @name         Bilibili Multi-Account｜哔哩哔哩多账号管理
// @namespace    bilibili.local.multi-account
// @version      1.0
// @description  支持密码、短信、二维码登录，按主账号、记录观看、推荐和视频取流分别选择 B 站账号。
// @author       Wow-CaiCai (https://github.com/Wow-CaiCai)
// @homepageURL  https://github.com/Wow-CaiCai/bilibili-multi-account
// @source       https://github.com/Wow-CaiCai/bilibili-multi-account/blob/main/dist/bilibili-multi-account.user.js
// @supportURL   https://github.com/Wow-CaiCai/bilibili-multi-account/issues
// @downloadURL  https://github.com/Wow-CaiCai/bilibili-multi-account/releases/latest/download/bilibili-multi-account.user.js
// @updateURL    https://github.com/Wow-CaiCai/bilibili-multi-account/releases/latest/download/bilibili-multi-account.user.js
// @icon         https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/users-round.svg
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

(() => {
  // src/core/runtime.js
  var runtime = {
    state: null,
    host: void 0,
    shadow: void 0,
    dialog: void 0,
    statusBox: void 0,
    refreshAccountChoices: void 0,
    accountMenu: null,
    loginMethod: "qrcode",
    disposeLogin: null,
    smsCooldownUntil: 0,
    LoginRSA: void 0,
    LoginQR: void 0,
    browserLabels: [],
    browserIdentity: { status: "loading", mid: "", name: "" },
    browserReadPromise: void 0,
    profileRefreshPromise: void 0,
    panelDraft: null,
    panelAddingAccount: false,
    wbiKeys: void 0
  };
  var page = unsafeWindow;
  var noticeTimers = /* @__PURE__ */ new Map();
  var profileAttempts = /* @__PURE__ */ new Map();
  var nativeFetch = page.fetch;
  var nativeBeacon = page.navigator.sendBeacon;
  var playbackBootstraps = /* @__PURE__ */ new Map();
  var trustedPlaybackData = /* @__PURE__ */ new WeakSet();
  var PLAYER_INFO = /* @__PURE__ */ new Set(["/x/player/v2", "/x/player/wbi/v2"]);

  // src/core/config.js
  var KEY = "bilibili-web-accounts-v1";
  var ROLES = {
    main: "主账号",
    heartbeat: "记录观看",
    recommend: "推荐",
    video: "视频取流"
  };
  var HOSTS = /* @__PURE__ */ new Set([
    "api.bilibili.com",
    "api.live.bilibili.com",
    "api.vc.bilibili.com",
    "app.bilibili.com",
    "www.bilibili.com",
    "s.search.bilibili.com"
  ]);
  var GROUPS = {
    heartbeat: /* @__PURE__ */ new Set([
      "/x/web-interface/wbi/view",
      "/x/web-interface/view",
      "/x/web-interface/view/detail",
      "/x/v2/reply",
      "/x/v2/reply/main",
      "/x/v2/reply/wbi/main",
      "/x/v2/reply/reply",
      "/x/click-interface/web/heartbeat",
      "/x/click-interface/click/web/h5",
      "/x/v2/history/report",
      "/x/v1/medialist/history",
      "/x/player/pagelist",
      "/x/player/online/total",
      "/x/polymer/web-dynamic/v1/detail",
      "/x/web-interface/view/conclusion/get",
      "/x/polymer/web-space/seasons_archives_list",
      "/x/series/archives",
      "/xlive/web-room/v1/index/roomEntryAction",
      "/xlive/app-ucenter/v1/like_info_v3/like/likeReportV3",
      "/xlive/web-room/v2/index/getRoomPlayInfo",
      "/xlive/web-room/v1/index/getH5InfoByRoom",
      "/xlive/web-room/v1/index/getDanmuInfo",
      "/xlive/web-room/v1/dM/gethistory",
      "/av/v1/SuperChat/getMessageList",
      "/xlive/web-room/v1/index/getInfoByUser"
    ]),
    recommend: /* @__PURE__ */ new Set([
      "/x/web-interface/wbi/index/top/feed/rcmd",
      "/x/web-interface/index/top/feed/rcmd",
      "/x/v2/feed/index",
      "/x/feed/dislike",
      "/x/feed/dislike/cancel",
      "/x/web-interface/popular",
      "/x/web-interface/archive/related",
      "/xlive/web-interface/v1/second/getUserRecommend",
      "/x/v2/search/trending/ranking",
      "/x/v2/search/recommend",
      "/x/web-interface/ranking/v2",
      "/pgc/web/rank/list",
      "/pgc/season/rank/web/list",
      "/pgc/season/index/result",
      "/x/web-interface/popular/series/one",
      "/x/web-interface/popular/series/list",
      "/x/web-interface/popular/precious",
      "/xlive/app-interface/v2/index/getAreaList",
      "/xlive/app-interface/v2/index/feed",
      "/xlive/app-interface/v2/second/getList",
      "/room/v1/Area/getList",
      "/x/copyright-music-publicity/bgm/recommend_list",
      "/x/topic/web/dynamic/rcmd",
      "/x/polymer/web-dynamic/v1/feed/topic",
      "/x/topic/web/details/top",
      "/xlive/app-interface/v2/index/feedback",
      "/main/hotword",
      "/x/web-interface/wbi/search/default",
      "/x/web-interface/search/default",
      "/x/web-interface/suggest",
      "/x/web-interface/wbi/search/type",
      "/x/web-interface/search/type",
      "/x/web-interface/wbi/search/all/v2",
      "/x/web-interface/search/all/v2",
      "/x/polymer/web-dynamic/v1/feed/space/search",
      "/x/space/wbi/arc/search",
      "/xlive/app-interface/v2/search_live"
    ]),
    video: /* @__PURE__ */ new Set([
      "/x/player/wbi/playurl",
      "/x/player/playurl",
      "/pgc/player/web/v2/playurl",
      "/pgc/player/web/playurl",
      "/pugv/player/web/playurl",
      "/ogv/player/playview",
      "/x/tv/playurl",
      "/x/player/videoshot",
      "/x/player/v2",
      "/x/player/wbi/v2",
      "/pgc/view/web/season",
      "/pgc/view/web/season/user/status",
      "/pgc/view/web/season/user/section",
      "/pugv/view/web/season"
    ])
  };
  var REPORTS = /* @__PURE__ */ new Set([
    "/x/click-interface/web/heartbeat",
    "/x/click-interface/click/web/h5",
    "/x/v2/history/report",
    "/x/v1/medialist/history",
    "/xlive/web-room/v1/index/roomEntryAction",
    "/xlive/app-ucenter/v1/like_info_v3/like/likeReportV3"
  ]);
  var defaults = () => ({
    version: 1,
    enabled: true,
    accounts: [],
    roles: { main: "browser", heartbeat: "browser", recommend: "browser", video: "browser" }
  });

  // src/network/signing.js
  function md5(text) {
    const input = new TextEncoder().encode(text);
    const bytes = new Uint8Array(Math.ceil((input.length + 9) / 64) * 64);
    bytes.set(input);
    bytes[input.length] = 128;
    const view = new DataView(bytes.buffer);
    view.setUint32(bytes.length - 8, input.length * 8 >>> 0, true);
    view.setUint32(bytes.length - 4, Math.floor(input.length / 536870912), true);
    const shifts = [
      [7, 12, 17, 22],
      [5, 9, 14, 20],
      [4, 11, 16, 23],
      [6, 10, 15, 21]
    ];
    const sum = [1732584193, 4023233417, 2562383102, 271733878];
    for (let offset = 0; offset < bytes.length; offset += 64) {
      let [a, b, c, d] = sum;
      for (let i = 0; i < 64; i++) {
        const round = i >>> 4;
        const f = round === 0 ? b & c | ~b & d : round === 1 ? d & b | ~d & c : round === 2 ? b ^ c ^ d : c ^ (b | ~d);
        const g = round === 0 ? i : round === 1 ? (5 * i + 1) % 16 : round === 2 ? (3 * i + 5) % 16 : 7 * i % 16;
        const k = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296);
        const x = a + f + k + view.getUint32(offset + g * 4, true) | 0;
        const shift = shifts[round][i % 4];
        [a, b, c, d] = [d, b + (x << shift | x >>> 32 - shift) | 0, b, c];
      }
      sum[0] = sum[0] + a | 0;
      sum[1] = sum[1] + b | 0;
      sum[2] = sum[2] + c | 0;
      sum[3] = sum[3] + d | 0;
    }
    return sum.map((n) => [0, 8, 16, 24].map((s) => (n >>> s & 255).toString(16).padStart(2, "0")).join("")).join("");
  }
  async function wbiKey() {
    if (!runtime.wbiKeys || Date.now() - runtime.wbiKeys.time > 36e5) {
      runtime.wbiKeys = {
        time: Date.now(),
        promise: nativeFetch.call(page, "https://api.bilibili.com/x/web-interface/nav", {
          credentials: "include",
          cache: "no-store",
          signal: page.AbortSignal.timeout(1e4)
        }).then((r) => r.json()).then((data) => {
          const images = data.data?.wbi_img;
          const key = [images?.img_url, images?.sub_url].map(
            (url) => String(url || "").split("/").pop().split(".")[0]
          ).join("");
          if (key.length !== 64) throw new Error("无法取得 WBI 签名信息");
          return [
            46,
            47,
            18,
            2,
            53,
            8,
            23,
            32,
            15,
            50,
            10,
            31,
            58,
            3,
            45,
            35,
            27,
            43,
            5,
            49,
            33,
            9,
            42,
            19,
            29,
            28,
            14,
            39,
            12,
            38,
            41,
            13
          ].map((i) => key[i]).join("");
        }).catch((error) => {
          runtime.wbiKeys = null;
          throw error;
        })
      };
    }
    return runtime.wbiKeys.promise;
  }
  async function prepareRoute(route) {
    const url = new URL(route.url.href);
    const csrf = route.account?.cookies.bili_jct || "";
    let changed = false;
    for (const key of ["access_key", "refresh_token"])
      if (url.searchParams.has(key)) {
        url.searchParams.delete(key);
        changed = true;
      }
    for (const key of ["csrf", "csrf_token"]) {
      if (url.searchParams.has(key) && url.searchParams.get(key) !== csrf) {
        url.searchParams.set(key, csrf);
        changed = true;
      }
    }
    if (changed && url.searchParams.has("w_rid")) {
      const key = await wbiKey();
      url.searchParams.delete("w_rid");
      url.searchParams.set("wts", String(Math.floor(Date.now() / 1e3)));
      const entries = [...url.searchParams].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
      const query = entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v.replace(/[!'()*]/g, ""))}`).join("&");
      url.search = `${query}&w_rid=${md5(query + key)}`;
    }
    return { ...route, url };
  }

  // src/network/routing.js
  function classify(input) {
    let url;
    try {
      url = new URL(String(input), page.location.href);
    } catch (_) {
      return null;
    }
    if (url.protocol !== "https:" || url.port || url.username || url.password || !HOSTS.has(url.hostname))
      return null;
    if (/\/(?:login|logout|passport|oauth|qrcode|cookie|captcha|sms)(?:\/|$)/i.test(url.pathname))
      return null;
    const path = url.pathname.replace(/\/$/, "");
    let role = Object.keys(GROUPS).find((k) => GROUPS[k].has(path));
    if (!role && /^\/(?:x|pgc|pugv|ogv|xlive|room|av)\//.test(path)) role = "main";
    if (!role) return null;
    return { url, path, role };
  }
  function target(input) {
    if (!runtime.state.enabled) return null;
    const route = classify(input);
    if (!route) return null;
    const mid = runtime.state.roles[route.role];
    if (mid === "browser") {
      return null;
    }
    const account = mid === "0" ? null : runtime.state.accounts.find((a) => a.mid === mid);
    if (mid !== "0" && !account) throw new Error("用途账号不存在，请重新配置");
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
      if (!headers.has("Content-Type"))
        headers.set("Content-Type", "application/x-www-form-urlencoded;charset=UTF-8");
    }
    if (typeof body === "string") {
      const contentType = headers.get("Content-Type") || "";
      if (contentType.includes("application/json")) {
        const data = JSON.parse(body);
        if (data && typeof data === "object" && !Array.isArray(data)) {
          for (const k of ["csrf", "csrf_token"]) if (Object.hasOwn(data, k)) data[k] = csrf;
        }
        return JSON.stringify(data);
      }
      if (contentType.includes("application/x-www-form-urlencoded") || /(?:^|&)(?:csrf|csrf_token)=/.test(body)) {
        const params = new URLSearchParams(body);
        for (const k of ["csrf", "csrf_token"]) if (params.has(k)) params.set(k, csrf);
        return params.toString();
      }
    }
    return body;
  }

  // src/network/transport.js
  function transport(route, options = {}) {
    const requests = [];
    const controller = new page.AbortController();
    let cancelled = false, timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      abort();
    }, options.timeout || 3e4);
    const abort = () => {
      cancelled = true;
      controller.abort();
      for (const task of requests) task.abort();
    };
    const promise = (async () => {
      const prepared = await prepareRoute(route);
      if (cancelled) throw new DOMException("请求已取消", "AbortError");
      const task = rawTransport(prepared, options);
      requests.push(task);
      const result = await task.promise;
      if (PLAYER_INFO.has(route.path) && runtime.state.roles.heartbeat !== route.mid && result.status === 200) {
        let payload;
        try {
          payload = JSON.parse(new TextDecoder().decode(result.response));
        } catch (_) {
          return result;
        }
        if (payload.code !== 0 || !payload.data) return result;
        const mid = runtime.state.roles.heartbeat;
        let progress;
        try {
          if (mid === "browser") {
            const r = await nativeFetch.call(page, route.url.href, {
              method: "GET",
              credentials: "include",
              signal: controller.signal
            });
            const value = await r.json();
            if (r.ok && value.code === 0) progress = value.data;
          } else if (mid !== "0") {
            const account = runtime.state.accounts.find((a) => a.mid === mid);
            if (account) {
              const r = rawTransport(
                await prepareRoute({ ...route, role: "heartbeat", mid, account }),
                options
              );
              if (cancelled) {
                r.abort();
                throw new DOMException("请求已取消", "AbortError");
              }
              requests.push(r);
              const response = await r.promise;
              const value = JSON.parse(new TextDecoder().decode(response.response));
              if (value.code === 0) progress = value.data;
            }
          }
        } catch (_) {
        }
        payload.data.last_play_time = progress?.last_play_time || 0;
        payload.data.last_play_cid = progress?.last_play_cid || 0;
        if (cancelled) throw new DOMException("请求已取消", "AbortError");
        return { ...result, response: new TextEncoder().encode(JSON.stringify(payload)).buffer };
      }
      if (cancelled) throw new DOMException("请求已取消", "AbortError");
      return result;
    })().catch((error) => {
      if (timedOut) throw new DOMException("请求超时", "TimeoutError");
      throw error;
    }).finally(() => clearTimeout(timer));
    return { promise, abort };
  }
  function rawTransport(route, options = {}) {
    let cancel;
    const promise = new Promise((resolve, reject) => {
      if (!route.account && REPORTS.has(route.path)) {
        resolve({
          status: 200,
          statusText: "OK",
          responseHeaders: "Content-Type: application/json\r\n",
          response: new TextEncoder().encode('{"code":0,"message":"0","data":null}').buffer,
          finalUrl: route.url.href
        });
        return;
      }
      const headers = new Headers(options.headers || {});
      const csrf = route.account?.cookies.bili_jct || "";
      const data = replaceCSRF(options.body, headers, csrf);
      const url = new URL(route.url.href);
      const outgoing = {};
      for (const [k, v] of headers) {
        if (!/^(?:cookie|host|origin|referer|authorization|proxy-authorization|content-length|user-agent|sec-.+|x-bili-.+)$/i.test(
          k
        )) {
          outgoing[k] = /^(?:x-csrf-token|x-csrf)$/i.test(k) ? csrf : v;
        }
      }
      outgoing.Referer = page.location.href.split("#")[0];
      const cookie = route.account ? Object.entries(route.account.cookies).filter(([k]) => !/^bili_ticket/.test(k)).map(([k, v]) => `${k}=${v}`).join("; ") : "";
      let settled = false;
      let handle;
      const timer = setTimeout(() => {
        if (settled) return;
        finish(false, new DOMException("请求超时", "TimeoutError"));
        handle?.abort();
      }, options.timeout || 3e4);
      const finish = (ok, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (ok) {
          let finalUrl;
          try {
            finalUrl = new URL(value.finalUrl || url.href);
          } catch (_) {
            reject(new TypeError("接口返回无效地址"));
            return;
          }
          if (finalUrl.protocol !== "https:" || !HOSTS.has(finalUrl.hostname)) {
            reject(new TypeError("拒绝非 B 站接口的重定向"));
            return;
          }
          resolve(value);
        } else {
          reject(value);
        }
      };
      try {
        handle = GM_xmlhttpRequest({
          method: options.method || "GET",
          url: url.href,
          headers: outgoing,
          data,
          anonymous: true,
          cookie,
          redirect: "error",
          responseType: "arraybuffer",
          onload: (r) => finish(true, r),
          onerror: () => finish(false, new TypeError("多账号请求失败，请检查脚本权限或网络")),
          ontimeout: () => finish(false, new DOMException("请求超时", "TimeoutError")),
          onabort: () => finish(false, new DOMException("请求已取消", "AbortError"))
        });
      } catch (error) {
        finish(false, error);
      }
      cancel = () => {
        finish(false, new DOMException("请求已取消", "AbortError"));
        handle?.abort();
      };
    });
    return { promise, abort: () => cancel?.() };
  }
  function responseHeaders(raw) {
    const headers = new Headers();
    for (const line of (raw || "").split(/\r?\n/)) {
      const i = line.indexOf(":");
      if (i < 1) continue;
      const name = line.slice(0, i).trim();
      if (/^(?:set-cookie2?|content-encoding|content-length|transfer-encoding)$/i.test(name))
        continue;
      try {
        headers.append(name, line.slice(i + 1).trim());
      } catch (_) {
      }
    }
    return headers;
  }

  // src/accounts/verify.js
  async function verify(account) {
    const route = {
      url: new URL("https://api.bilibili.com/x/web-interface/nav"),
      path: "/x/web-interface/nav",
      role: "main",
      mid: account.mid,
      account
    };
    const r = await transport(route).promise;
    if (r.status !== 200) throw new Error(`校验失败：HTTP ${r.status}`);
    const data = JSON.parse(new TextDecoder().decode(r.response));
    if (data.code !== 0 || !data.data?.isLogin)
      throw new Error(
        `登录失效或 Cookie 未成功发送（code ${data.code}），请更新 Cookie / Tampermonkey。`
      );
    if (String(data.data.mid) !== account.mid)
      throw new Error("校验返回 UID 不匹配，请检查 Tampermonkey 的 Cookie 隔离支持。");
    return data.data;
  }

  // src/accounts/profiles.js
  function currentBrowserMid() {
    if (runtime.browserIdentity.status === "loggedOut") return "";
    return runtime.browserIdentity.mid || /(?:^|;\s*)DedeUserID=(\d+)(?:;|$)/.exec(document.cookie)?.[1] || "";
  }
  function browserLabel() {
    if (runtime.browserIdentity.name) return runtime.browserIdentity.name;
    if (runtime.browserIdentity.status === "loading") return "读取中…";
    if (runtime.browserIdentity.status === "loggedOut") return "未登录";
    return "浏览器账号";
  }
  function safeAvatar(value) {
    try {
      const url = new URL(String(value || "").replace(/^\/\//, "https://"));
      return url.protocol === "https:" && !url.username && !url.password && /(?:^|\.)(?:hdslb|biliimg)\.com$/.test(url.hostname) ? url.href : "";
    } catch (_) {
      return "";
    }
  }
  function displayName(mid) {
    if (mid === "0") return "匿名";
    if (mid === "browser" || mid === currentBrowserMid()) return browserLabel();
    const account = runtime.state.accounts.find((a) => a.mid === mid);
    if (account?.username) return account.username;
    if (account?.name && !/^\d+$/.test(account.name)) return account.name;
    return profileAttempts.get(mid) === "failed" ? "未命名账号" : "读取中…";
  }
  function accountFace(mid) {
    return mid === "browser" || mid === currentBrowserMid() ? safeAvatar(runtime.browserIdentity.face) : runtime.state.accounts.find((a) => a.mid === mid)?.face || "";
  }
  function saveProfile(mid, data) {
    const account = runtime.state.accounts.find((a) => a.mid === mid);
    if (!account) return;
    account.username = String(data.uname || "").slice(0, 80);
    account.face = safeAvatar(data.face);
    account.vip = Number(data.vipStatus ?? data.vip?.status) === 1;
  }
  function refreshAccountProfiles(force = false) {
    if (runtime.profileRefreshPromise) return runtime.profileRefreshPromise;
    const work = runtime.state.accounts.filter(
      (a) => force || !a.username && !profileAttempts.has(a.mid)
    );
    runtime.profileRefreshPromise = Promise.allSettled(
      work.map(async (account) => {
        profileAttempts.set(account.mid, "loading");
        try {
          const data = account.mid === currentBrowserMid() && runtime.browserIdentity.status === "loggedIn" ? {
            uname: runtime.browserIdentity.name,
            face: runtime.browserIdentity.face,
            vipStatus: runtime.browserIdentity.vip ? 1 : 0
          } : await verify(account);
          const current = runtime.state.accounts.find((a) => a.mid === account.mid);
          if (current && current.cookies.SESSDATA === account.cookies.SESSDATA)
            saveProfile(account.mid, data);
          profileAttempts.set(account.mid, "done");
        } catch (_) {
          profileAttempts.set(account.mid, "failed");
        } finally {
          runtime.refreshAccountChoices?.();
        }
      })
    ).then(() => {
      if (work.length) save();
      runtime.refreshAccountChoices?.();
    }).finally(() => {
      runtime.profileRefreshPromise = null;
    });
    return runtime.profileRefreshPromise;
  }
  function updateBrowserInfo() {
    runtime.refreshAccountChoices?.();
    for (const node of runtime.browserLabels) node.textContent = browserLabel();
  }
  function detectBrowserAccount() {
    if (runtime.browserReadPromise) return runtime.browserReadPromise;
    runtime.browserIdentity = {
      status: "loading",
      mid: currentBrowserMid(),
      name: runtime.browserIdentity.name
    };
    updateBrowserInfo();
    runtime.browserReadPromise = (async () => {
      const controller = new page.AbortController();
      const timer = setTimeout(() => controller.abort(), 1e4);
      try {
        const response = await nativeFetch.call(
          page,
          "https://api.bilibili.com/x/web-interface/nav",
          { credentials: "include", cache: "no-store", signal: controller.signal }
        );
        if (!response.ok) throw new Error("浏览器账号识别失败");
        const data = await response.json();
        if (data.code === -101 || data.code === 0 && data.data?.isLogin === false) {
          runtime.browserIdentity = { status: "loggedOut", mid: "", name: "" };
        } else if (data.code === 0 && data.data?.isLogin && /^\d+$/.test(String(data.data.mid))) {
          runtime.browserIdentity = {
            status: "loggedIn",
            mid: String(data.data.mid),
            name: String(data.data.uname || ""),
            face: safeAvatar(data.data.face),
            vip: Number(data.data.vipStatus ?? data.data.vip?.status) === 1
          };
        } else throw new Error("浏览器账号识别失败");
      } catch (_) {
        runtime.browserIdentity = { status: "error", mid: "", name: "" };
      } finally {
        clearTimeout(timer);
        updateBrowserInfo();
      }
      return runtime.browserIdentity;
    })().finally(() => {
      runtime.browserReadPromise = null;
    });
    return runtime.browserReadPromise;
  }

  // src/accounts/store.js
  function load() {
    try {
      const value = GM_getValue(KEY, null);
      return value ? validateState(value) : defaults();
    } catch (_) {
      return defaults();
    }
  }
  function cookiesFrom(input) {
    if (typeof input === "string") {
      const text = input.trim();
      if (text.startsWith("{") || text.startsWith("[")) return cookiesFrom(JSON.parse(text));
      input = Object.fromEntries(
        text.replace(/^cookie\s*:\s*/i, "").split(";").filter((s) => s.includes("=")).map((s) => {
          const i = s.indexOf("=");
          return [s.slice(0, i).trim(), s.slice(i + 1).trim()];
        })
      );
    }
    if (Array.isArray(input)) input = Object.fromEntries(input.map((c) => [c.name, c.value]));
    if (input && typeof input === "object" && input.cookies) return cookiesFrom(input.cookies);
    if (!input || typeof input !== "object")
      throw new Error("请输入 Cookie 或含 cookies 字段的 JSON");
    const result = /* @__PURE__ */ Object.create(null);
    for (const [name, raw] of Object.entries(input)) {
      if (!/^[A-Za-z0-9_\-]+$/.test(name) || /^(?:bili_ticket|access_key|refresh_token)$/.test(name))
        continue;
      if (typeof raw !== "string" || /[;\r\n\x00]/.test(raw)) continue;
      result[name] = raw;
    }
    if (!result.SESSDATA || !/^\d+$/.test(result.DedeUserID || "") || !result.bili_jct) {
      throw new Error("缺少 SESSDATA、DedeUserID 或 bili_jct。SESSDATA 若不可读取，请手动粘贴。");
    }
    return result;
  }
  function accountsFrom(raw, name = "") {
    let input = raw;
    if (typeof input === "string" && /^[\[{]/.test(input.trim())) input = JSON.parse(input.trim());
    const roles = {};
    const accounts = [];
    const roleKeys = Object.keys(ROLES);
    function append(entry, expectedMid) {
      const cookies = cookiesFrom(entry);
      const mid = cookies.DedeUserID;
      if (mid === "0" || expectedMid !== void 0 && String(expectedMid) !== mid) {
        throw new Error("导入的 UID 键与 Cookie 中的 DedeUserID 不一致");
      }
      if (accounts.some((a) => a.mid === mid)) throw new Error("导入内容含重复 UID");
      accounts.push({ mid, name: String(name.trim() || entry?.name || mid).slice(0, 80), cookies });
      if (entry && typeof entry === "object" && Object.hasOwn(entry, "type")) {
        if (!Array.isArray(entry.type)) throw new Error(`账号 ${mid} 的 type 必须是数组`);
        for (const type of entry.type) {
          if (!Number.isInteger(type) || type < 0 || type >= roleKeys.length)
            throw new Error(`账号 ${mid} 的 type 无效`);
          const role = roleKeys[type];
          if (roles[role] && roles[role] !== mid)
            throw new Error(`多个账号同时分配了“${ROLES[role]}”`);
          roles[role] = mid;
        }
      }
    }
    if (input && typeof input === "object" && !Array.isArray(input) && input.version === 1 && Array.isArray(input.accounts)) {
      const backup = validateState(input);
      return { accounts: backup.accounts, roles: backup.roles };
    }
    if (input && typeof input === "object" && !Array.isArray(input) && !input.cookies && !input.SESSDATA) {
      const entries = Object.entries(input);
      if (!entries.length || !entries.every(([key, value]) => /^\d+$/.test(key) && value?.cookies)) {
        throw new Error("JSON 应为单账号、Cookie 对象或以 UID 为键的多账号对象");
      }
      for (const [mid, entry] of entries) append(entry, mid);
    } else if (Array.isArray(input) && input.some((entry) => entry?.cookies)) {
      for (const entry of input) append(entry);
    } else append(input);
    return { accounts, roles };
  }
  function validateState(value) {
    if (!value || value.version !== 1 || !Array.isArray(value.accounts))
      throw new Error("备份格式不支持");
    const next = defaults();
    next.accounts = value.accounts.map((a) => {
      const cookies = cookiesFrom(a.cookies);
      const mid = cookies.DedeUserID;
      if (String(a.mid) !== mid || mid === "0") throw new Error("账号 UID 与 Cookie 不一致");
      return {
        mid,
        name: String(a.name || mid).slice(0, 80),
        cookies,
        username: typeof a.username === "string" ? a.username.slice(0, 80) : "",
        face: safeAvatar(a.face),
        vip: a.vip === true
      };
    });
    if (new Set(next.accounts.map((a) => a.mid)).size !== next.accounts.length)
      throw new Error("有重复 UID");
    for (const role of Object.keys(ROLES)) {
      const mid = String(value.roles?.[role] ?? "0");
      if (mid !== "0" && mid !== "browser" && !next.accounts.some((a) => a.mid === mid))
        throw new Error("用途引用了不存在的账号");
      next.roles[role] = mid;
    }
    return next;
  }
  function save() {
    GM_setValue(KEY, runtime.state);
  }

  // src/ui/components.js
  function el(tag, text, attrs = {}) {
    const node = document.createElement(tag);
    if (text != null) node.textContent = text;
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    return node;
  }
  function button(text, action, kind = "") {
    const b = el("button", text, { type: "button", class: kind });
    b.addEventListener("click", async () => {
      b.disabled = true;
      try {
        await action();
      } catch (error) {
        notice(error.message || "操作失败");
      } finally {
        b.disabled = false;
      }
    });
    return b;
  }
  function friendlyText(value) {
    let text = String(value || "");
    const names = new Map(runtime.state.accounts.map((a) => [a.mid, displayName(a.mid)]));
    const browserMid = currentBrowserMid();
    if (browserMid) names.set(browserMid, browserLabel());
    for (const [mid, name] of names) text = text.split(mid).join(name);
    return text.replace(/UID\s*\d+/g, "其他账号").replace(/UID\s*/g, "");
  }
  function clearNotice(box) {
    const boxes = box ? [box] : [.../* @__PURE__ */ new Set([runtime.statusBox, ...noticeTimers.keys()])];
    for (const item of boxes) {
      if (!item) continue;
      clearTimeout(noticeTimers.get(item));
      noticeTimers.delete(item);
      item.hidden = true;
      item.textContent = "";
      item.classList.remove("fading");
    }
  }
  function notice(message, box = runtime.statusBox) {
    if (!box || !message) return;
    clearNotice(box);
    box.textContent = friendlyText(message);
    box.hidden = false;
    noticeTimers.set(
      box,
      setTimeout(() => {
        box.classList.add("fading");
        noticeTimers.set(
          box,
          setTimeout(() => clearNotice(box), 600)
        );
      }, 2400)
    );
  }
  function icon(name, className = "") {
    if (name === "bilibili")
      return el("img", null, {
        class: `icon ${className}`,
        src: "data:image/x-icon;base64,AAABAAEAICAAAAEAIACoEAAAFgAAACgAAAAgAAAAQAAAAAEAIAAAAAAAABAAABMLAAATCwAAAAAAAAAAAAD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A1qEAANahAADWoQAG1qEAb9ahAMvWoQD01qEA/9ahAP/WoQD/1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQD01qEAy9ahAG/WoQAG1qEAANahAADWoQAA1qEAG9ahAM/WoQD/1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQD/1qEA/9ahANDWoQAb1qEAANahAAfWoQDQ1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQD/1qEA/9ahANHWoQAH1qEAbtahAP/WoQD/1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQD/1qEA/9ahAG7WoQDH1qEA/9ahAP/WoQD/1qEAtdahABjWoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAANahABvWoQC11qEA/9ahAP/WoQD/1qEAx9ahAPnWoQD/1qEA/9ahAP/WoQAZ1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAANahABjWoQD/1qEA/9ahAP/WoQDz1qEA/9ahAP/WoQD/1qEA/9ahAADWoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAANahAP/WoQD/1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQD/1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAANahAADWoQD/1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQD/1qEA/9ahAADWoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAANahAP/WoQD/1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQD/1qEAANahAADWoQAA1qEAANahAErWoQDn1qEA5NahAErWoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAANahAErWoQDn1qEA5NahAErWoQAA1qEAANahAADWoQAA1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQAA1qEAANahAADWoQAA1qEA5tahAP/WoQD/1qEA59ahAADWoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEA5tahAP/WoQD/1qEA59ahAADWoQAA1qEAANahAADWoQD/1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQD/1qEA/9ahAADWoQAA1qEAANahAADWoQD/1qEA/9ahAP/WoQD/1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAANahAADWoQD/1qEA/9ahAP/WoQD/1qEAANahAADWoQAA1qEAANahAP/WoQD/1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQD/1qEAANahAADWoQAA1qEAANahAP/WoQD/1qEA/9ahAP/WoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAANahAP/WoQD/1qEA/9ahAP/WoQAA1qEAANahAADWoQAA1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQAA1qEAANahAADWoQAA1qEA5tahAP/WoQD/1qEA5tahAADWoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEA5tahAP/WoQD/1qEA5tahAADWoQAA1qEAANahAADWoQD/1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQD/1qEA/9ahAADWoQAA1qEAANahAADWoQBJ1qEA5tahAObWoQBJ1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAANahAADWoQBJ1qEA5tahAObWoQBJ1qEAANahAADWoQAA1qEAANahAP/WoQD/1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQD/1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAANahAADWoQD/1qEA/9ahAP/WoQD/1qEA+dahAP/WoQD/1qEA/9ahABnWoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAGdahAP/WoQD/1qEA/9ahAPjWoQDH1qEA/9ahAP/WoQD/1qEAttahABnWoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAANahABnWoQC21qEA/9ahAP/WoQD/1qEAx9ahAG3WoQD/1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQBt1qEABtahAM/WoQD/1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQD/1qEA0NahAAfWoQAA1qEAG9ahAM/WoQD/1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQD/1qEA/9ahAM/WoQAb1qEAANahAADWoQAA1qEABtahAG7WoQDH1qEA89ahAP/WoQD/1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQD/1qEA/9ahAP/WoQD/1qEA89ahAMfWoQBu1qEABtahAADWoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEADtahAMXWoQD/1qEA/9ahAP/WoQD/1qEAxdahAA/WoQAA1qEAANahAADWoQAA1qEADtahAMXWoQD/1qEA/9ahAP/WoQD/1qEAxdahAA/WoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAANahAAbWoQDF1qEA/9ahAP/WoQD/1qEA/9ahAMXWoQAP1qEAANahAADWoQAA1qEAANahAADWoQAA1qEADtahAMXWoQD/1qEA/9ahAP/WoQD/1qEAxdahAAbWoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAYtahAP/WoQD/1qEA/9ahAP/WoQDF1qEADtahAADWoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEADtahAMXWoQD/1qEA/9ahAP/WoQD/1qEAY9ahAADWoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAANahAADWoQBf1qEA/9ahAP/WoQD/1qEAxdahAA7WoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEADtahAMXWoQD/1qEA/9ahAP/WoQBf1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAANahAATWoQCg1qEA6tahAKjWoQAO1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEAANahAADWoQAA1qEADtahAKjWoQDr1qEAoNahAATWoQAA1qEAANahAADWoQAA1qEAAP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A///////////AAAADgAAAAQAAAAAAAAAAA///wAf//+AP///wD///8A////AP///wDw/w8A8P8PAPD/DwDw/w8A8P8PAPD/DwD///8A////AH///gA///wAAAAAAAAAAAgAAAAcAAAAP8A8A/+AfgH/gP8B/4H/gf+D/8H/////8=",
        alt: "",
        "aria-hidden": "true"
      });
    const paths = {
      person: ["M20 21v-2a7 7 0 0 0-14 0v2", "M17 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0"],
      history: ["M3 11a9 9 0 1 1 2.7 7", "M3 4v7h7", "M12 7v5l3 2"],
      sparkle: ["m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6L12 3"],
      play: ["m9 6 10 6-10 6V6Z"],
      close: ["m6 6 12 12", "M18 6 6 18"],
      chevron: ["m9 5 7 7-7 7"],
      down: ["m7 10 5 5 5-5"],
      check: ["m5 12 4 4L19 6"],
      refresh: ["M20 11a8 8 0 0 0-14-5L3 9", "M3 3v6h6", "M4 13a8 8 0 0 0 14 5l3-3", "M21 21v-6h-6"],
      shield: ["m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z", "m8 12 3 3 5-6"],
      download: ["M12 3v12", "m7 10 5 5 5-5", "M4 17v4h16v-4"],
      upload: ["M12 16V4", "m7 9 5-5 5 5", "M4 17v4h16v-4"],
      plus: ["M12 5v14", "M5 12h14"],
      back: ["M19 12H5", "m12 19-7-7 7-7"],
      settings: ["M4 7h16", "M4 17h16", "M8 4v6", "M16 14v6"]
    };
    const node = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    for (const [key, value] of Object.entries({
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.7",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "aria-hidden": "true",
      class: `icon ${className}`
    }))
      node.setAttribute(key, value);
    for (const d of paths[name] || paths.person) {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", d);
      node.append(path);
    }
    return node;
  }
  function avatar(mid, size = "") {
    const box = el("span", null, { class: `avatar ${size}`, "aria-hidden": "true" });
    const face = accountFace(mid);
    if (face) {
      const img = el("img", null, { src: face, alt: "", referrerpolicy: "no-referrer" });
      img.addEventListener("error", () => box.replaceChildren(icon("person")), { once: true });
      box.append(img);
    } else box.append(icon(mid === "0" ? "shield" : "person"));
    return box;
  }
  function closeAccountMenu(restoreFocus = false) {
    if (!runtime.accountMenu) return false;
    const { menu, trigger } = runtime.accountMenu;
    runtime.accountMenu = null;
    menu.remove();
    trigger.setAttribute("aria-expanded", "false");
    if (restoreFocus) trigger.focus({ preventScroll: true });
    return true;
  }
  function openTransferMenu(trigger, items) {
    if (runtime.accountMenu?.trigger === trigger) {
      closeAccountMenu(true);
      return;
    }
    closeAccountMenu();
    const menu = el("div", null, {
      class: "account-menu transfer-menu",
      role: "menu",
      "aria-label": trigger.textContent
    });
    const position = () => {
      const bounds = runtime.dialog.getBoundingClientRect();
      const anchor = trigger.getBoundingClientRect();
      const width = runtime.dialog.clientWidth;
      const height = runtime.dialog.clientHeight;
      menu.style.width = `${Math.min(210, width - 16)}px`;
      const below = height - (anchor.bottom - bounds.top) - 12;
      const above = anchor.top - bounds.top - 12;
      const placeBelow = below >= Math.min(menu.scrollHeight, 160) || below >= above;
      menu.style.maxHeight = `${Math.max(0, placeBelow ? below : above)}px`;
      const left = anchor.left - bounds.left - runtime.dialog.clientLeft;
      const top = placeBelow ? anchor.bottom - bounds.top - runtime.dialog.clientTop + 6 : anchor.top - bounds.top - runtime.dialog.clientTop - menu.offsetHeight - 6;
      menu.style.left = `${Math.max(8, Math.min(left, width - menu.offsetWidth - 8))}px`;
      menu.style.top = `${Math.max(8, Math.min(top, height - menu.offsetHeight - 8))}px`;
      menu.style.transformOrigin = placeBelow ? "top left" : "bottom left";
    };
    for (const [label, symbol, action] of items) {
      const item = button(
        "",
        () => {
          closeAccountMenu(true);
          return action();
        },
        "transfer-option"
      );
      item.setAttribute("role", "menuitem");
      item.tabIndex = -1;
      item.append(icon(symbol), document.createTextNode(label));
      menu.append(item);
    }
    menu.addEventListener("keydown", (event) => {
      if (event.key === "Tab") {
        closeAccountMenu(true);
        return;
      }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const buttons = [...menu.children];
      const current = buttons.indexOf(runtime.shadow.activeElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    });
    runtime.accountMenu = { menu, trigger, update: position };
    runtime.dialog.append(menu);
    trigger.setAttribute("aria-expanded", "true");
    position();
    menu.firstElementChild?.focus();
  }

  // src/accounts/sync.js
  function installAccountSync() {
    GM_addValueChangeListener(KEY, (_key, _old, value, remote) => {
      if (remote) {
        try {
          runtime.state = validateState(value);
          notice("其他标签页已更新设置；刷新页面可更新首屏。");
        } catch (_) {
        }
      }
    });
  }

  // src/player/playback.js
  function separatePlayback() {
    return runtime.state.enabled && runtime.state.roles.video !== "browser";
  }
  function failureDetails(error, route, stage) {
    const clean = (value) => String(value || "").replace(/\?[^\s)"']*/g, "?…").slice(0, 500);
    let path = route?.path || "";
    try {
      if (!path && error?.config?.url) path = new URL(error.config.url, page.location.href).pathname;
    } catch (_) {
    }
    const info = {
      stage,
      path,
      name: clean(error?.name),
      message: clean(error?.message || error),
      status: error?.response?.status ?? error?.status ?? "",
      code: error?.response?.data?.code ?? "",
      stack: clean(error?.stack)
    };
    console.warn("[Bilibili Multi-Account]", JSON.stringify(info));
    return `${stage}：${info.message || info.name}${path ? `（${path}）` : ""}${info.status ? ` HTTP ${info.status}` : ""}`;
  }
  function readAssignedJSON(html, name) {
    const match = new RegExp(`(?:const|let|var|window\\.)?\\s*${name}\\s*=\\s*`).exec(html);
    if (!match) return null;
    const start = match.index + match[0].length;
    if (html[start] !== "{") return null;
    let depth = 0, quoted = false, escaped = false;
    for (let i = start; i < html.length; i++) {
      const char = html[i];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') quoted = false;
      } else if (char === '"') quoted = true;
      else if (char === "{" || char === "[") depth++;
      else if (char === "}" || char === "]") {
        if (--depth === 0) return JSON.parse(html.slice(start, i + 1));
      }
    }
    return null;
  }
  function playbackBootstrap(episode) {
    const match = /^\/(bangumi\/play)\/(ep|ss)(\d+)/.exec(page.location.pathname);
    if (!match) return Promise.reject(new Error("当前页面不支持番剧预载适配"));
    const path = episode ? `/bangumi/play/ep${episode}` : `/${match[1]}/${match[2]}${match[3]}`;
    const mid = runtime.state.roles.video;
    const account = mid === "0" ? null : runtime.state.accounts.find((a) => a.mid === mid);
    if (mid !== "0" && !account) return Promise.reject(new Error("请先配置有效的取流账号"));
    const key = `${mid}:${path}`;
    const cached = playbackBootstraps.get(key);
    if (cached && Date.now() - cached.time < 3e4) return cached.promise;
    const route = {
      url: new URL(`https://www.bilibili.com${path}`),
      path,
      role: "video",
      mid,
      account
    };
    const promise = (async () => {
      const result = await transport(route).promise;
      if (result.status !== 200) throw new Error(`取流账号的首屏预载请求失败：HTTP ${result.status}`);
      const html = new TextDecoder().decode(result.response);
      const preload = readAssignedJSON(html, "playurlSSRData");
      if (!preload?.data?.result) throw new Error("未找到取流账号的番剧预载数据，请查看接口诊断");
      trustedPlaybackData.add(preload.data);
      page.__PLAYURL_HYDRATE_DATA__ = preload.data;
      page.__playinfo__ = preload.data;
      return preload;
    })().catch((error) => {
      playbackBootstraps.delete(key);
      notice(error.message);
      throw error;
    });
    playbackBootstraps.set(key, { time: Date.now(), promise });
    return promise;
  }
  function installPlaybackHooks() {
    for (const name of ["__playinfo__", "__PLAYURL_HYDRATE_DATA__"]) {
      const descriptor2 = Object.getOwnPropertyDescriptor(page, name);
      if (descriptor2 && (!descriptor2.configurable || descriptor2.get || descriptor2.set)) continue;
      let value = descriptor2?.value;
      try {
        Object.defineProperty(page, name, {
          configurable: true,
          enumerable: true,
          get() {
            return separatePlayback() && (!value || !trustedPlaybackData.has(value)) ? void 0 : value;
          },
          set(next) {
            value = next;
          }
        });
      } catch (_) {
      }
    }
    const wrapped = /* @__PURE__ */ new WeakMap();
    function wrapNano(nano) {
      if (!nano || typeof nano !== "object") return nano;
      if (wrapped.has(nano)) return wrapped.get(nano);
      const factories = /* @__PURE__ */ new WeakMap();
      const proxy = new Proxy(nano, {
        get(object, key, receiver) {
          const value = Reflect.get(object, key, receiver);
          if (key !== "createPlayer" || typeof value !== "function") return value;
          if (!factories.has(value))
            factories.set(value, function(config, ...rest) {
              if (!separatePlayback() || !config)
                return Reflect.apply(value, object, [config, ...rest]);
              const next = { ...config };
              if (next.prefetch) {
                next.prefetch = { ...next.prefetch };
                delete next.prefetch.playUrl;
              }
              const callback = config.requestConfig?.reqHttpPlayUrlInfo;
              if (typeof callback === "function" && Function.prototype.toString.call(callback).includes("playurlSSRData")) {
                next.requestConfig = {
                  ...config.requestConfig,
                  reqHttpPlayUrlInfo: (params) => playbackBootstrap(params?.ep_id || config.episodeId)
                };
              }
              return Reflect.apply(value, object, [next, ...rest]);
            });
          return factories.get(value);
        }
      });
      wrapped.set(nano, proxy);
      wrapped.set(proxy, proxy);
      return proxy;
    }
    const descriptor = Object.getOwnPropertyDescriptor(page, "nano");
    if (!descriptor || descriptor.configurable && !descriptor.get && !descriptor.set) {
      let nano = wrapNano(descriptor?.value);
      try {
        Object.defineProperty(page, "nano", {
          configurable: true,
          enumerable: true,
          get: () => nano,
          set: (value) => {
            nano = wrapNano(value);
          }
        });
      } catch (_) {
      }
    }
    if (separatePlayback() && /^\/bangumi\/play\/(ep|ss)\d+/.test(page.location.pathname)) {
      void playbackBootstrap().catch(() => {
      });
    }
  }

  // src/network/interceptors.js
  function installNetworkHooks() {
    page.fetch = async function(input, init) {
      let route;
      try {
        const url = typeof input === "string" || input instanceof page.URL ? String(input) : input.url;
        route = target(url);
        if (!route) return nativeFetch.call(this, input, init);
        const request = new page.Request(input, init);
        if (request.signal.aborted) throw new DOMException("请求已取消", "AbortError");
        let body;
        if (!["GET", "HEAD"].includes(request.method)) {
          body = /multipart\/form-data/i.test(request.headers.get("Content-Type") || "") ? await request.clone().formData() : await request.clone().text();
        }
        const headers = new Headers(request.headers);
        if (body instanceof page.FormData || body instanceof FormData) headers.delete("Content-Type");
        const task = transport(route, { method: request.method, headers, body });
        const abort = () => task.abort();
        request.signal.addEventListener("abort", abort, { once: true });
        if (request.signal.aborted) abort();
        try {
          const r = await task.promise;
          const response = new page.Response(
            [101, 204, 205, 304].includes(r.status) || request.method === "HEAD" ? null : r.response,
            {
              status: r.status,
              statusText: r.statusText || "",
              headers: responseHeaders(r.responseHeaders)
            }
          );
          Object.defineProperties(response, {
            url: { value: r.finalUrl || route.url.href },
            redirected: { value: false },
            type: { value: "basic" }
          });
          return response;
        } finally {
          request.signal.removeEventListener("abort", abort);
        }
      } catch (error) {
        failureDetails(error, route, "fetch");
        throw error;
      }
    };
    const NativeXHR = page.XMLHttpRequest;
    const xhrPrototype = NativeXHR.prototype;
    const xhrOriginal = Object.fromEntries(
      [
        "open",
        "send",
        "abort",
        "setRequestHeader",
        "getResponseHeader",
        "getAllResponseHeaders",
        "overrideMimeType"
      ].map((k) => [k, xhrPrototype[k]])
    );
    const instrumentedXHR = /* @__PURE__ */ new WeakSet();
    function instrumentXHR(xhr) {
      if (instrumentedXHR.has(xhr)) return xhr;
      instrumentedXHR.add(xhr);
      const original = xhrOriginal;
      let route, method, async, routed = false, task, generation = 0, mime = "";
      let headers = new Headers(), result = null, ready = 0, decoded;
      const event = (name, progress = false) => xhr.dispatchEvent(
        progress ? new page.ProgressEvent(name, { lengthComputable: false }) : new page.Event(name)
      );
      const change = (value) => {
        ready = value;
        event("readystatechange");
      };
      const text = () => {
        if (decoded === void 0) {
          const type = mime || responseHeaders(result?.responseHeaders).get("Content-Type") || "";
          const encoding = /charset=([^;\s]+)/i.exec(type)?.[1] || "utf-8";
          try {
            decoded = new TextDecoder(encoding).decode(result?.response || new ArrayBuffer(0));
          } catch (_) {
            decoded = new TextDecoder().decode(result?.response || new ArrayBuffer(0));
          }
        }
        return decoded;
      };
      const nativeGet = (name) => {
        let prototype = xhrPrototype;
        while (prototype) {
          const getter = Object.getOwnPropertyDescriptor(prototype, name)?.get;
          if (getter) return getter.call(xhr);
          prototype = Object.getPrototypeOf(prototype);
        }
        return void 0;
      };
      for (const name of [
        "readyState",
        "status",
        "statusText",
        "responseURL",
        "response",
        "responseText",
        "responseXML"
      ]) {
        Object.defineProperty(xhr, name, {
          configurable: true,
          get() {
            if (!routed) return nativeGet(name);
            if (name === "readyState") return ready;
            if (name === "status") return ready >= 2 ? result?.status || 0 : 0;
            if (name === "statusText") return ready >= 2 ? result?.statusText || "" : "";
            if (name === "responseURL") return ready >= 2 ? result?.finalUrl || route.url.href : "";
            const type = xhr.responseType;
            if (name === "responseText" && type && type !== "text")
              throw new DOMException("responseType 非文本", "InvalidStateError");
            if (name === "responseText") return ready >= 3 ? text() : "";
            if (name === "responseXML" || name === "response" && type === "document") {
              if (ready !== 4 || !result) return null;
              const ct = mime || responseHeaders(result.responseHeaders).get("Content-Type") || "";
              if (!/xml|html/i.test(ct)) return null;
              return new page.DOMParser().parseFromString(
                text(),
                /html/i.test(ct) ? "text/html" : "application/xml"
              );
            }
            if (ready !== 4 || !result) return type && type !== "text" ? null : "";
            if (type === "arraybuffer") return result.response;
            if (type === "blob")
              return new page.Blob([result.response], {
                type: mime || responseHeaders(result.responseHeaders).get("Content-Type") || ""
              });
            if (type === "json") {
              try {
                return JSON.parse(text());
              } catch (_) {
                return null;
              }
            }
            return text();
          }
        });
      }
      xhr.open = function(m, url, isAsync = true, user, password) {
        ++generation;
        task?.abort();
        task = null;
        routed = false;
        result = null;
        decoded = void 0;
        ready = 0;
        mime = "";
        method = String(m).toUpperCase();
        async = isAsync !== false;
        route = target(url);
        headers = new Headers();
        return original.open.call(xhr, m, url, isAsync, user, password);
      };
      xhr.setRequestHeader = function(k, v) {
        original.setRequestHeader.call(xhr, k, v);
        headers.append(k, v);
      };
      xhr.getAllResponseHeaders = function() {
        if (!routed) return original.getAllResponseHeaders.call(xhr);
        return ready < 2 ? "" : [...responseHeaders(result?.responseHeaders)].map(([k, v]) => `${k}: ${v}\r
`).join("");
      };
      xhr.getResponseHeader = function(k) {
        return routed ? ready < 2 ? null : responseHeaders(result?.responseHeaders).get(k) : original.getResponseHeader.call(xhr, k);
      };
      const originalOverride = original.overrideMimeType;
      xhr.overrideMimeType = function(value) {
        mime = String(value);
        return originalOverride.call(xhr, value);
      };
      xhr.send = function(body) {
        if (!route) return original.send.call(xhr, body);
        if (routed || xhr.readyState !== 1)
          throw new DOMException("请求状态不允许发送", "InvalidStateError");
        if (!async)
          throw new DOMException("多账号模式不支持同步 XHR，请停用脚本后重试", "NotSupportedError");
        routed = true;
        ready = 1;
        const mine = generation;
        event("loadstart", true);
        task = transport(route, {
          method,
          headers,
          body: /^(GET|HEAD)$/.test(method) ? null : body,
          timeout: xhr.timeout
        });
        task.promise.then(
          (r) => {
            if (mine !== generation) return;
            result = r;
            change(2);
            if (mine !== generation) return;
            change(3);
            if (mine !== generation) return;
            event("progress", true);
            if (mine !== generation) return;
            change(4);
            if (mine !== generation) return;
            event("load", true);
            event("loadend", true);
          },
          (error) => {
            if (mine !== generation) return;
            result = null;
            change(4);
            event(
              error.name === "TimeoutError" ? "timeout" : error.name === "AbortError" ? "abort" : "error",
              true
            );
            event("loadend", true);
          }
        );
      };
      xhr.abort = function() {
        if (!routed) return original.abort.call(xhr);
        ++generation;
        task?.abort();
        result = null;
        decoded = void 0;
        if (ready > 0 && ready < 4) {
          change(4);
          event("abort", true);
          event("loadend", true);
        }
        ready = 0;
      };
      return xhr;
    }
    xhrPrototype.open = function(...args) {
      const xhr = instrumentXHR(this);
      return xhr.open(...args);
    };
    if (nativeBeacon)
      page.navigator.sendBeacon = function(url, data) {
        const route = target(url);
        if (!route) return nativeBeacon.call(this, url, data);
        const headers = new Headers();
        if (typeof data === "string") headers.set("Content-Type", "text/plain;charset=UTF-8");
        const send = (body) => transport(route, { method: "POST", headers, body }).promise.catch(() => {
        });
        if (data instanceof page.Blob && /json|x-www-form-urlencoded/i.test(data.type)) {
          headers.set("Content-Type", data.type);
          data.text().then(send).catch(() => {
          });
        } else send(data);
        return true;
      };
  }

  // src/vendor/qrcode.js
  /*!
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
    const module = { exports: {} };
    const exports = module.exports;
    const define = void 0;
    var qrcode = (function() {
      var qrcode2 = function(typeNumber, errorCorrectionLevel) {
        var PAD0 = 236;
        var PAD1 = 17;
        var _typeNumber = typeNumber;
        var _errorCorrectionLevel = QRErrorCorrectionLevel[errorCorrectionLevel];
        var _modules = null;
        var _moduleCount = 0;
        var _dataCache = null;
        var _dataList = [];
        var _this = {};
        var makeImpl = function(test, maskPattern) {
          _moduleCount = _typeNumber * 4 + 17;
          _modules = (function(moduleCount) {
            var modules = new Array(moduleCount);
            for (var row = 0; row < moduleCount; row += 1) {
              modules[row] = new Array(moduleCount);
              for (var col = 0; col < moduleCount; col += 1) {
                modules[row][col] = null;
              }
            }
            return modules;
          })(_moduleCount);
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
              if (0 <= r && r <= 6 && (c == 0 || c == 6) || 0 <= c && c <= 6 && (r == 0 || r == 6) || 2 <= r && r <= 4 && 2 <= c && c <= 4) {
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
            _modules[r][6] = r % 2 == 0;
          }
          for (var c = 8; c < _moduleCount - 8; c += 1) {
            if (_modules[6][c] != null) {
              continue;
            }
            _modules[6][c] = c % 2 == 0;
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
                  if (r == -2 || r == 2 || c == -2 || c == 2 || r == 0 && c == 0) {
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
            var mod = !test && (bits >> i & 1) == 1;
            _modules[Math.floor(i / 3)][i % 3 + _moduleCount - 8 - 3] = mod;
          }
          for (var i = 0; i < 18; i += 1) {
            var mod = !test && (bits >> i & 1) == 1;
            _modules[i % 3 + _moduleCount - 8 - 3][Math.floor(i / 3)] = mod;
          }
        };
        var setupTypeInfo = function(test, maskPattern) {
          var data = _errorCorrectionLevel << 3 | maskPattern;
          var bits = QRUtil.getBCHTypeInfo(data);
          for (var i = 0; i < 15; i += 1) {
            var mod = !test && (bits >> i & 1) == 1;
            if (i < 6) {
              _modules[i][8] = mod;
            } else if (i < 8) {
              _modules[i + 1][8] = mod;
            } else {
              _modules[_moduleCount - 15 + i][8] = mod;
            }
          }
          for (var i = 0; i < 15; i += 1) {
            var mod = !test && (bits >> i & 1) == 1;
            if (i < 8) {
              _modules[8][_moduleCount - i - 1] = mod;
            } else if (i < 9) {
              _modules[8][15 - i - 1 + 1] = mod;
            } else {
              _modules[8][15 - i - 1] = mod;
            }
          }
          _modules[_moduleCount - 8][8] = !test;
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
                    dark = (data[byteIndex] >>> bitIndex & 1) == 1;
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
              dcdata[r][i] = 255 & buffer.getBuffer()[i + offset];
            }
            offset += dcCount;
            var rsPoly = QRUtil.getErrorCorrectPolynomial(ecCount);
            var rawPoly = qrPolynomial(dcdata[r], rsPoly.getLength() - 1);
            var modPoly = rawPoly.mod(rsPoly);
            ecdata[r] = new Array(rsPoly.getLength() - 1);
            for (var i = 0; i < ecdata[r].length; i += 1) {
              var modIndex = i + modPoly.getLength() - ecdata[r].length;
              ecdata[r][i] = modIndex >= 0 ? modPoly.getAt(modIndex) : 0;
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
        var createData = function(typeNumber2, errorCorrectionLevel2, dataList) {
          var rsBlocks = QRRSBlock.getRSBlocks(typeNumber2, errorCorrectionLevel2);
          var buffer = qrBitBuffer();
          for (var i = 0; i < dataList.length; i += 1) {
            var data = dataList[i];
            buffer.put(data.getMode(), 4);
            buffer.put(data.getLength(), QRUtil.getLengthInBits(data.getMode(), typeNumber2));
            data.write(buffer);
          }
          var totalDataCount = 0;
          for (var i = 0; i < rsBlocks.length; i += 1) {
            totalDataCount += rsBlocks[i].dataCount;
          }
          if (buffer.getLengthInBits() > totalDataCount * 8) {
            throw "code length overflow. (" + buffer.getLengthInBits() + ">" + totalDataCount * 8 + ")";
          }
          if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) {
            buffer.put(0, 4);
          }
          while (buffer.getLengthInBits() % 8 != 0) {
            buffer.putBit(false);
          }
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
          mode = mode || "Byte";
          var newData = null;
          switch (mode) {
            case "Numeric":
              newData = qrNumber(data);
              break;
            case "Alphanumeric":
              newData = qrAlphaNum(data);
              break;
            case "Byte":
              newData = qr8BitByte(data);
              break;
            case "Kanji":
              newData = qrKanji(data);
              break;
            default:
              throw "mode:" + mode;
          }
          _dataList.push(newData);
          _dataCache = null;
        };
        _this.isDark = function(row, col) {
          if (row < 0 || _moduleCount <= row || col < 0 || _moduleCount <= col) {
            throw row + "," + col;
          }
          return _modules[row][col];
        };
        _this.getModuleCount = function() {
          return _moduleCount;
        };
        _this.make = function() {
          if (_typeNumber < 1) {
            var typeNumber2 = 1;
            for (; typeNumber2 < 40; typeNumber2++) {
              var rsBlocks = QRRSBlock.getRSBlocks(typeNumber2, _errorCorrectionLevel);
              var buffer = qrBitBuffer();
              for (var i = 0; i < _dataList.length; i++) {
                var data = _dataList[i];
                buffer.put(data.getMode(), 4);
                buffer.put(data.getLength(), QRUtil.getLengthInBits(data.getMode(), typeNumber2));
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
            _typeNumber = typeNumber2;
          }
          makeImpl(false, getBestMaskPattern());
        };
        _this.createTableTag = function(cellSize, margin) {
          cellSize = cellSize || 2;
          margin = typeof margin == "undefined" ? cellSize * 4 : margin;
          var qrHtml = "";
          qrHtml += '<table style="';
          qrHtml += " border-width: 0px; border-style: none;";
          qrHtml += " border-collapse: collapse;";
          qrHtml += " padding: 0px; margin: " + margin + "px;";
          qrHtml += '">';
          qrHtml += "<tbody>";
          for (var r = 0; r < _this.getModuleCount(); r += 1) {
            qrHtml += "<tr>";
            for (var c = 0; c < _this.getModuleCount(); c += 1) {
              qrHtml += '<td style="';
              qrHtml += " border-width: 0px; border-style: none;";
              qrHtml += " border-collapse: collapse;";
              qrHtml += " padding: 0px; margin: 0px;";
              qrHtml += " width: " + cellSize + "px;";
              qrHtml += " height: " + cellSize + "px;";
              qrHtml += " background-color: ";
              qrHtml += _this.isDark(r, c) ? "#000000" : "#ffffff";
              qrHtml += ";";
              qrHtml += '"/>';
            }
            qrHtml += "</tr>";
          }
          qrHtml += "</tbody>";
          qrHtml += "</table>";
          return qrHtml;
        };
        _this.createSvgTag = function(cellSize, margin, alt, title) {
          var opts = {};
          if (typeof arguments[0] == "object") {
            opts = arguments[0];
            cellSize = opts.cellSize;
            margin = opts.margin;
            alt = opts.alt;
            title = opts.title;
          }
          cellSize = cellSize || 2;
          margin = typeof margin == "undefined" ? cellSize * 4 : margin;
          alt = typeof alt === "string" ? { text: alt } : alt || {};
          alt.text = alt.text || null;
          alt.id = alt.text ? alt.id || "qrcode-description" : null;
          title = typeof title === "string" ? { text: title } : title || {};
          title.text = title.text || null;
          title.id = title.text ? title.id || "qrcode-title" : null;
          var size = _this.getModuleCount() * cellSize + margin * 2;
          var c, mc, r, mr, qrSvg = "", rect;
          rect = "l" + cellSize + ",0 0," + cellSize + " -" + cellSize + ",0 0,-" + cellSize + "z ";
          qrSvg += '<svg version="1.1" xmlns="http://www.w3.org/2000/svg"';
          qrSvg += !opts.scalable ? ' width="' + size + 'px" height="' + size + 'px"' : "";
          qrSvg += ' viewBox="0 0 ' + size + " " + size + '" ';
          qrSvg += ' preserveAspectRatio="xMinYMin meet"';
          qrSvg += title.text || alt.text ? ' role="img" aria-labelledby="' + escapeXml([title.id, alt.id].join(" ").trim()) + '"' : "";
          qrSvg += ">";
          qrSvg += title.text ? '<title id="' + escapeXml(title.id) + '">' + escapeXml(title.text) + "</title>" : "";
          qrSvg += alt.text ? '<description id="' + escapeXml(alt.id) + '">' + escapeXml(alt.text) + "</description>" : "";
          qrSvg += '<rect width="100%" height="100%" fill="white" cx="0" cy="0"/>';
          qrSvg += '<path d="';
          for (r = 0; r < _this.getModuleCount(); r += 1) {
            mr = r * cellSize + margin;
            for (c = 0; c < _this.getModuleCount(); c += 1) {
              if (_this.isDark(r, c)) {
                mc = c * cellSize + margin;
                qrSvg += "M" + mc + "," + mr + rect;
              }
            }
          }
          qrSvg += '" stroke="transparent" fill="black"/>';
          qrSvg += "</svg>";
          return qrSvg;
        };
        _this.createDataURL = function(cellSize, margin) {
          cellSize = cellSize || 2;
          margin = typeof margin == "undefined" ? cellSize * 4 : margin;
          var size = _this.getModuleCount() * cellSize + margin * 2;
          var min = margin;
          var max = size - margin;
          return createDataURL(size, size, function(x, y) {
            if (min <= x && x < max && min <= y && y < max) {
              var c = Math.floor((x - min) / cellSize);
              var r = Math.floor((y - min) / cellSize);
              return _this.isDark(r, c) ? 0 : 1;
            } else {
              return 1;
            }
          });
        };
        _this.createImgTag = function(cellSize, margin, alt) {
          cellSize = cellSize || 2;
          margin = typeof margin == "undefined" ? cellSize * 4 : margin;
          var size = _this.getModuleCount() * cellSize + margin * 2;
          var img = "";
          img += "<img";
          img += ' src="';
          img += _this.createDataURL(cellSize, margin);
          img += '"';
          img += ' width="';
          img += size;
          img += '"';
          img += ' height="';
          img += size;
          img += '"';
          if (alt) {
            img += ' alt="';
            img += escapeXml(alt);
            img += '"';
          }
          img += "/>";
          return img;
        };
        var escapeXml = function(s) {
          var escaped = "";
          for (var i = 0; i < s.length; i += 1) {
            var c = s.charAt(i);
            switch (c) {
              case "<":
                escaped += "&lt;";
                break;
              case ">":
                escaped += "&gt;";
                break;
              case "&":
                escaped += "&amp;";
                break;
              case '"':
                escaped += "&quot;";
                break;
              default:
                escaped += c;
                break;
            }
          }
          return escaped;
        };
        var _createHalfASCII = function(margin) {
          var cellSize = 1;
          margin = typeof margin == "undefined" ? cellSize * 2 : margin;
          var size = _this.getModuleCount() * cellSize + margin * 2;
          var min = margin;
          var max = size - margin;
          var y, x, r1, r2, p;
          var blocks = {
            "██": "█",
            "█ ": "▀",
            " █": "▄",
            "  ": " "
          };
          var blocksLastLineNoMargin = {
            "██": "▀",
            "█ ": "▀",
            " █": " ",
            "  ": " "
          };
          var ascii = "";
          for (y = 0; y < size; y += 2) {
            r1 = Math.floor((y - min) / cellSize);
            r2 = Math.floor((y + 1 - min) / cellSize);
            for (x = 0; x < size; x += 1) {
              p = "█";
              if (min <= x && x < max && min <= y && y < max && _this.isDark(r1, Math.floor((x - min) / cellSize))) {
                p = " ";
              }
              if (min <= x && x < max && min <= y + 1 && y + 1 < max && _this.isDark(r2, Math.floor((x - min) / cellSize))) {
                p += " ";
              } else {
                p += "█";
              }
              ascii += margin < 1 && y + 1 >= max ? blocksLastLineNoMargin[p] : blocks[p];
            }
            ascii += "\n";
          }
          if (size % 2 && margin > 0) {
            return ascii.substring(0, ascii.length - size - 1) + Array(size + 1).join("▀");
          }
          return ascii.substring(0, ascii.length - 1);
        };
        _this.createASCII = function(cellSize, margin) {
          cellSize = cellSize || 1;
          if (cellSize < 2) {
            return _createHalfASCII(margin);
          }
          cellSize -= 1;
          margin = typeof margin == "undefined" ? cellSize * 2 : margin;
          var size = _this.getModuleCount() * cellSize + margin * 2;
          var min = margin;
          var max = size - margin;
          var y, x, r, p;
          var white = Array(cellSize + 1).join("██");
          var black = Array(cellSize + 1).join("  ");
          var ascii = "";
          var line = "";
          for (y = 0; y < size; y += 1) {
            r = Math.floor((y - min) / cellSize);
            line = "";
            for (x = 0; x < size; x += 1) {
              p = 1;
              if (min <= x && x < max && min <= y && y < max && _this.isDark(r, Math.floor((x - min) / cellSize))) {
                p = 0;
              }
              line += p ? white : black;
            }
            for (r = 0; r < cellSize; r += 1) {
              ascii += line + "\n";
            }
          }
          return ascii.substring(0, ascii.length - 1);
        };
        _this.renderTo2dContext = function(context, cellSize) {
          cellSize = cellSize || 2;
          var length = _this.getModuleCount();
          for (var row = 0; row < length; row++) {
            for (var col = 0; col < length; col++) {
              context.fillStyle = _this.isDark(row, col) ? "black" : "white";
              context.fillRect(row * cellSize, col * cellSize, cellSize, cellSize);
            }
          }
        };
        return _this;
      };
      qrcode2.stringToBytesFuncs = {
        "default": function(s) {
          var bytes = [];
          for (var i = 0; i < s.length; i += 1) {
            var c = s.charCodeAt(i);
            bytes.push(c & 255);
          }
          return bytes;
        }
      };
      qrcode2.stringToBytes = qrcode2.stringToBytesFuncs["default"];
      qrcode2.createStringToBytes = function(unicodeData, numChars) {
        var unicodeMap = (function() {
          var bin = base64DecodeInputStream(unicodeData);
          var read = function() {
            var b = bin.read();
            if (b == -1) throw "eof";
            return b;
          };
          var count = 0;
          var unicodeMap2 = {};
          while (true) {
            var b0 = bin.read();
            if (b0 == -1) break;
            var b1 = read();
            var b2 = read();
            var b3 = read();
            var k = String.fromCharCode(b0 << 8 | b1);
            var v = b2 << 8 | b3;
            unicodeMap2[k] = v;
            count += 1;
          }
          if (count != numChars) {
            throw count + " != " + numChars;
          }
          return unicodeMap2;
        })();
        var unknownChar = "?".charCodeAt(0);
        return function(s) {
          var bytes = [];
          for (var i = 0; i < s.length; i += 1) {
            var c = s.charCodeAt(i);
            if (c < 128) {
              bytes.push(c);
            } else {
              var b = unicodeMap[s.charAt(i)];
              if (typeof b == "number") {
                if ((b & 255) == b) {
                  bytes.push(b);
                } else {
                  bytes.push(b >>> 8);
                  bytes.push(b & 255);
                }
              } else {
                bytes.push(unknownChar);
              }
            }
          }
          return bytes;
        };
      };
      var QRMode = {
        MODE_NUMBER: 1 << 0,
        MODE_ALPHA_NUM: 1 << 1,
        MODE_8BIT_BYTE: 1 << 2,
        MODE_KANJI: 1 << 3
      };
      var QRErrorCorrectionLevel = {
        L: 1,
        M: 0,
        Q: 3,
        H: 2
      };
      var QRMaskPattern = {
        PATTERN000: 0,
        PATTERN001: 1,
        PATTERN010: 2,
        PATTERN011: 3,
        PATTERN100: 4,
        PATTERN101: 5,
        PATTERN110: 6,
        PATTERN111: 7
      };
      var QRUtil = (function() {
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
        var G15 = 1 << 10 | 1 << 8 | 1 << 5 | 1 << 4 | 1 << 2 | 1 << 1 | 1 << 0;
        var G18 = 1 << 12 | 1 << 11 | 1 << 10 | 1 << 9 | 1 << 8 | 1 << 5 | 1 << 2 | 1 << 0;
        var G15_MASK = 1 << 14 | 1 << 12 | 1 << 10 | 1 << 4 | 1 << 1;
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
            d ^= G15 << getBCHDigit(d) - getBCHDigit(G15);
          }
          return (data << 10 | d) ^ G15_MASK;
        };
        _this.getBCHTypeNumber = function(data) {
          var d = data << 12;
          while (getBCHDigit(d) - getBCHDigit(G18) >= 0) {
            d ^= G18 << getBCHDigit(d) - getBCHDigit(G18);
          }
          return data << 12 | d;
        };
        _this.getPatternPosition = function(typeNumber) {
          return PATTERN_POSITION_TABLE[typeNumber - 1];
        };
        _this.getMaskFunction = function(maskPattern) {
          switch (maskPattern) {
            case QRMaskPattern.PATTERN000:
              return function(i, j) {
                return (i + j) % 2 == 0;
              };
            case QRMaskPattern.PATTERN001:
              return function(i, j) {
                return i % 2 == 0;
              };
            case QRMaskPattern.PATTERN010:
              return function(i, j) {
                return j % 3 == 0;
              };
            case QRMaskPattern.PATTERN011:
              return function(i, j) {
                return (i + j) % 3 == 0;
              };
            case QRMaskPattern.PATTERN100:
              return function(i, j) {
                return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 == 0;
              };
            case QRMaskPattern.PATTERN101:
              return function(i, j) {
                return i * j % 2 + i * j % 3 == 0;
              };
            case QRMaskPattern.PATTERN110:
              return function(i, j) {
                return (i * j % 2 + i * j % 3) % 2 == 0;
              };
            case QRMaskPattern.PATTERN111:
              return function(i, j) {
                return (i * j % 3 + (i + j) % 2) % 2 == 0;
              };
            default:
              throw "bad maskPattern:" + maskPattern;
          }
        };
        _this.getErrorCorrectPolynomial = function(errorCorrectLength) {
          var a = qrPolynomial([1], 0);
          for (var i = 0; i < errorCorrectLength; i += 1) {
            a = a.multiply(qrPolynomial([1, QRMath.gexp(i)], 0));
          }
          return a;
        };
        _this.getLengthInBits = function(mode, type) {
          if (1 <= type && type < 10) {
            switch (mode) {
              case QRMode.MODE_NUMBER:
                return 10;
              case QRMode.MODE_ALPHA_NUM:
                return 9;
              case QRMode.MODE_8BIT_BYTE:
                return 8;
              case QRMode.MODE_KANJI:
                return 8;
              default:
                throw "mode:" + mode;
            }
          } else if (type < 27) {
            switch (mode) {
              case QRMode.MODE_NUMBER:
                return 12;
              case QRMode.MODE_ALPHA_NUM:
                return 11;
              case QRMode.MODE_8BIT_BYTE:
                return 16;
              case QRMode.MODE_KANJI:
                return 10;
              default:
                throw "mode:" + mode;
            }
          } else if (type < 41) {
            switch (mode) {
              case QRMode.MODE_NUMBER:
                return 14;
              case QRMode.MODE_ALPHA_NUM:
                return 13;
              case QRMode.MODE_8BIT_BYTE:
                return 16;
              case QRMode.MODE_KANJI:
                return 12;
              default:
                throw "mode:" + mode;
            }
          } else {
            throw "type:" + type;
          }
        };
        _this.getLostPoint = function(qrcode3) {
          var moduleCount = qrcode3.getModuleCount();
          var lostPoint = 0;
          for (var row = 0; row < moduleCount; row += 1) {
            for (var col = 0; col < moduleCount; col += 1) {
              var sameCount = 0;
              var dark = qrcode3.isDark(row, col);
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
                  if (dark == qrcode3.isDark(row + r, col + c)) {
                    sameCount += 1;
                  }
                }
              }
              if (sameCount > 5) {
                lostPoint += 3 + sameCount - 5;
              }
            }
          }
          ;
          for (var row = 0; row < moduleCount - 1; row += 1) {
            for (var col = 0; col < moduleCount - 1; col += 1) {
              var count = 0;
              if (qrcode3.isDark(row, col)) count += 1;
              if (qrcode3.isDark(row + 1, col)) count += 1;
              if (qrcode3.isDark(row, col + 1)) count += 1;
              if (qrcode3.isDark(row + 1, col + 1)) count += 1;
              if (count == 0 || count == 4) {
                lostPoint += 3;
              }
            }
          }
          for (var row = 0; row < moduleCount; row += 1) {
            for (var col = 0; col < moduleCount - 6; col += 1) {
              if (qrcode3.isDark(row, col) && !qrcode3.isDark(row, col + 1) && qrcode3.isDark(row, col + 2) && qrcode3.isDark(row, col + 3) && qrcode3.isDark(row, col + 4) && !qrcode3.isDark(row, col + 5) && qrcode3.isDark(row, col + 6)) {
                lostPoint += 40;
              }
            }
          }
          for (var col = 0; col < moduleCount; col += 1) {
            for (var row = 0; row < moduleCount - 6; row += 1) {
              if (qrcode3.isDark(row, col) && !qrcode3.isDark(row + 1, col) && qrcode3.isDark(row + 2, col) && qrcode3.isDark(row + 3, col) && qrcode3.isDark(row + 4, col) && !qrcode3.isDark(row + 5, col) && qrcode3.isDark(row + 6, col)) {
                lostPoint += 40;
              }
            }
          }
          var darkCount = 0;
          for (var col = 0; col < moduleCount; col += 1) {
            for (var row = 0; row < moduleCount; row += 1) {
              if (qrcode3.isDark(row, col)) {
                darkCount += 1;
              }
            }
          }
          var ratio = Math.abs(100 * darkCount / moduleCount / moduleCount - 50) / 5;
          lostPoint += ratio * 10;
          return lostPoint;
        };
        return _this;
      })();
      var QRMath = (function() {
        var EXP_TABLE = new Array(256);
        var LOG_TABLE = new Array(256);
        for (var i = 0; i < 8; i += 1) {
          EXP_TABLE[i] = 1 << i;
        }
        for (var i = 8; i < 256; i += 1) {
          EXP_TABLE[i] = EXP_TABLE[i - 4] ^ EXP_TABLE[i - 5] ^ EXP_TABLE[i - 6] ^ EXP_TABLE[i - 8];
        }
        for (var i = 0; i < 255; i += 1) {
          LOG_TABLE[EXP_TABLE[i]] = i;
        }
        var _this = {};
        _this.glog = function(n) {
          if (n < 1) {
            throw "glog(" + n + ")";
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
      })();
      function qrPolynomial(num, shift) {
        if (typeof num.length == "undefined") {
          throw num.length + "/" + shift;
        }
        var _num = (function() {
          var offset = 0;
          while (offset < num.length && num[offset] == 0) {
            offset += 1;
          }
          var _num2 = new Array(num.length - offset + shift);
          for (var i = 0; i < num.length - offset; i += 1) {
            _num2[i] = num[i + offset];
          }
          return _num2;
        })();
        var _this = {};
        _this.getAt = function(index) {
          return _num[index];
        };
        _this.getLength = function() {
          return _num.length;
        };
        _this.multiply = function(e) {
          var num2 = new Array(_this.getLength() + e.getLength() - 1);
          for (var i = 0; i < _this.getLength(); i += 1) {
            for (var j = 0; j < e.getLength(); j += 1) {
              num2[i + j] ^= QRMath.gexp(QRMath.glog(_this.getAt(i)) + QRMath.glog(e.getAt(j)));
            }
          }
          return qrPolynomial(num2, 0);
        };
        _this.mod = function(e) {
          if (_this.getLength() - e.getLength() < 0) {
            return _this;
          }
          var ratio = QRMath.glog(_this.getAt(0)) - QRMath.glog(e.getAt(0));
          var num2 = new Array(_this.getLength());
          for (var i = 0; i < _this.getLength(); i += 1) {
            num2[i] = _this.getAt(i);
          }
          for (var i = 0; i < e.getLength(); i += 1) {
            num2[i] ^= QRMath.gexp(QRMath.glog(e.getAt(i)) + ratio);
          }
          return qrPolynomial(num2, 0).mod(e);
        };
        return _this;
      }
      ;
      var QRRSBlock = (function() {
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
          var _this2 = {};
          _this2.totalCount = totalCount;
          _this2.dataCount = dataCount;
          return _this2;
        };
        var _this = {};
        var getRsBlockTable = function(typeNumber, errorCorrectionLevel) {
          switch (errorCorrectionLevel) {
            case QRErrorCorrectionLevel.L:
              return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 0];
            case QRErrorCorrectionLevel.M:
              return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 1];
            case QRErrorCorrectionLevel.Q:
              return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 2];
            case QRErrorCorrectionLevel.H:
              return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 3];
            default:
              return void 0;
          }
        };
        _this.getRSBlocks = function(typeNumber, errorCorrectionLevel) {
          var rsBlock = getRsBlockTable(typeNumber, errorCorrectionLevel);
          if (typeof rsBlock == "undefined") {
            throw "bad rs block @ typeNumber:" + typeNumber + "/errorCorrectionLevel:" + errorCorrectionLevel;
          }
          var length = rsBlock.length / 3;
          var list = [];
          for (var i = 0; i < length; i += 1) {
            var count = rsBlock[i * 3 + 0];
            var totalCount = rsBlock[i * 3 + 1];
            var dataCount = rsBlock[i * 3 + 2];
            for (var j = 0; j < count; j += 1) {
              list.push(qrRSBlock(totalCount, dataCount));
            }
          }
          return list;
        };
        return _this;
      })();
      var qrBitBuffer = function() {
        var _buffer = [];
        var _length = 0;
        var _this = {};
        _this.getBuffer = function() {
          return _buffer;
        };
        _this.getAt = function(index) {
          var bufIndex = Math.floor(index / 8);
          return (_buffer[bufIndex] >>> 7 - index % 8 & 1) == 1;
        };
        _this.put = function(num, length) {
          for (var i = 0; i < length; i += 1) {
            _this.putBit((num >>> length - i - 1 & 1) == 1);
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
            _buffer[bufIndex] |= 128 >>> _length % 8;
          }
          _length += 1;
        };
        return _this;
      };
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
          var data2 = _data;
          var i = 0;
          while (i + 2 < data2.length) {
            buffer.put(strToNum(data2.substring(i, i + 3)), 10);
            i += 3;
          }
          if (i < data2.length) {
            if (data2.length - i == 1) {
              buffer.put(strToNum(data2.substring(i, i + 1)), 4);
            } else if (data2.length - i == 2) {
              buffer.put(strToNum(data2.substring(i, i + 2)), 7);
            }
          }
        };
        var strToNum = function(s) {
          var num = 0;
          for (var i = 0; i < s.length; i += 1) {
            num = num * 10 + chatToNum(s.charAt(i));
          }
          return num;
        };
        var chatToNum = function(c) {
          if ("0" <= c && c <= "9") {
            return c.charCodeAt(0) - "0".charCodeAt(0);
          }
          throw "illegal char :" + c;
        };
        return _this;
      };
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
              getCode(s.charAt(i)) * 45 + getCode(s.charAt(i + 1)),
              11
            );
            i += 2;
          }
          if (i < s.length) {
            buffer.put(getCode(s.charAt(i)), 6);
          }
        };
        var getCode = function(c) {
          if ("0" <= c && c <= "9") {
            return c.charCodeAt(0) - "0".charCodeAt(0);
          } else if ("A" <= c && c <= "Z") {
            return c.charCodeAt(0) - "A".charCodeAt(0) + 10;
          } else {
            switch (c) {
              case " ":
                return 36;
              case "$":
                return 37;
              case "%":
                return 38;
              case "*":
                return 39;
              case "+":
                return 40;
              case "-":
                return 41;
              case ".":
                return 42;
              case "/":
                return 43;
              case ":":
                return 44;
              default:
                throw "illegal char :" + c;
            }
          }
        };
        return _this;
      };
      var qr8BitByte = function(data) {
        var _mode = QRMode.MODE_8BIT_BYTE;
        var _data = data;
        var _bytes = qrcode2.stringToBytes(data);
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
      var qrKanji = function(data) {
        var _mode = QRMode.MODE_KANJI;
        var _data = data;
        var stringToBytes = qrcode2.stringToBytesFuncs["SJIS"];
        if (!stringToBytes) {
          throw "sjis not supported.";
        }
        !(function(c, code) {
          var test = stringToBytes(c);
          if (test.length != 2 || (test[0] << 8 | test[1]) != code) {
            throw "sjis not supported.";
          }
        })("友", 38726);
        var _bytes = stringToBytes(data);
        var _this = {};
        _this.getMode = function() {
          return _mode;
        };
        _this.getLength = function(buffer) {
          return ~~(_bytes.length / 2);
        };
        _this.write = function(buffer) {
          var data2 = _bytes;
          var i = 0;
          while (i + 1 < data2.length) {
            var c = (255 & data2[i]) << 8 | 255 & data2[i + 1];
            if (33088 <= c && c <= 40956) {
              c -= 33088;
            } else if (57408 <= c && c <= 60351) {
              c -= 49472;
            } else {
              throw "illegal char at " + (i + 1) + "/" + c;
            }
            c = (c >>> 8 & 255) * 192 + (c & 255);
            buffer.put(c, 13);
            i += 2;
          }
          if (i < data2.length) {
            throw "illegal char at " + (i + 1);
          }
        };
        return _this;
      };
      var byteArrayOutputStream = function() {
        var _bytes = [];
        var _this = {};
        _this.writeByte = function(b) {
          _bytes.push(b & 255);
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
            _this.writeByte(s.charCodeAt(i));
          }
        };
        _this.toByteArray = function() {
          return _bytes;
        };
        _this.toString = function() {
          var s = "";
          s += "[";
          for (var i = 0; i < _bytes.length; i += 1) {
            if (i > 0) {
              s += ",";
            }
            s += _bytes[i];
          }
          s += "]";
          return s;
        };
        return _this;
      };
      var base64EncodeOutputStream = function() {
        var _buffer = 0;
        var _buflen = 0;
        var _length = 0;
        var _base64 = "";
        var _this = {};
        var writeEncoded = function(b) {
          _base64 += String.fromCharCode(encode(b & 63));
        };
        var encode = function(n) {
          if (n < 0) {
          } else if (n < 26) {
            return 65 + n;
          } else if (n < 52) {
            return 97 + (n - 26);
          } else if (n < 62) {
            return 48 + (n - 52);
          } else if (n == 62) {
            return 43;
          } else if (n == 63) {
            return 47;
          }
          throw "n:" + n;
        };
        _this.writeByte = function(n) {
          _buffer = _buffer << 8 | n & 255;
          _buflen += 8;
          _length += 1;
          while (_buflen >= 6) {
            writeEncoded(_buffer >>> _buflen - 6);
            _buflen -= 6;
          }
        };
        _this.flush = function() {
          if (_buflen > 0) {
            writeEncoded(_buffer << 6 - _buflen);
            _buffer = 0;
            _buflen = 0;
          }
          if (_length % 3 != 0) {
            var padlen = 3 - _length % 3;
            for (var i = 0; i < padlen; i += 1) {
              _base64 += "=";
            }
          }
        };
        _this.toString = function() {
          return _base64;
        };
        return _this;
      };
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
              throw "unexpected end of file./" + _buflen;
            }
            var c = _str.charAt(_pos);
            _pos += 1;
            if (c == "=") {
              _buflen = 0;
              return -1;
            } else if (c.match(/^\s$/)) {
              continue;
            }
            _buffer = _buffer << 6 | decode(c.charCodeAt(0));
            _buflen += 6;
          }
          var n = _buffer >>> _buflen - 8 & 255;
          _buflen -= 8;
          return n;
        };
        var decode = function(c) {
          if (65 <= c && c <= 90) {
            return c - 65;
          } else if (97 <= c && c <= 122) {
            return c - 97 + 26;
          } else if (48 <= c && c <= 57) {
            return c - 48 + 52;
          } else if (c == 43) {
            return 62;
          } else if (c == 47) {
            return 63;
          } else {
            throw "c:" + c;
          }
        };
        return _this;
      };
      var gifImage = function(width, height) {
        var _width = width;
        var _height = height;
        var _data = new Array(width * height);
        var _this = {};
        _this.setPixel = function(x, y, pixel) {
          _data[y * _width + x] = pixel;
        };
        _this.write = function(out) {
          out.writeString("GIF87a");
          out.writeShort(_width);
          out.writeShort(_height);
          out.writeByte(128);
          out.writeByte(0);
          out.writeByte(0);
          out.writeByte(0);
          out.writeByte(0);
          out.writeByte(0);
          out.writeByte(255);
          out.writeByte(255);
          out.writeByte(255);
          out.writeString(",");
          out.writeShort(0);
          out.writeShort(0);
          out.writeShort(_width);
          out.writeShort(_height);
          out.writeByte(0);
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
          out.writeByte(0);
          out.writeString(";");
        };
        var bitOutputStream = function(out) {
          var _out = out;
          var _bitLength = 0;
          var _bitBuffer = 0;
          var _this2 = {};
          _this2.write = function(data, length) {
            if (data >>> length != 0) {
              throw "length over";
            }
            while (_bitLength + length >= 8) {
              _out.writeByte(255 & (data << _bitLength | _bitBuffer));
              length -= 8 - _bitLength;
              data >>>= 8 - _bitLength;
              _bitBuffer = 0;
              _bitLength = 0;
            }
            _bitBuffer = data << _bitLength | _bitBuffer;
            _bitLength = _bitLength + length;
          };
          _this2.flush = function() {
            if (_bitLength > 0) {
              _out.writeByte(_bitBuffer);
            }
          };
          return _this2;
        };
        var getLZWRaster = function(lzwMinCodeSize) {
          var clearCode = 1 << lzwMinCodeSize;
          var endCode = (1 << lzwMinCodeSize) + 1;
          var bitLength = lzwMinCodeSize + 1;
          var table = lzwTable();
          for (var i = 0; i < clearCode; i += 1) {
            table.add(String.fromCharCode(i));
          }
          table.add(String.fromCharCode(clearCode));
          table.add(String.fromCharCode(endCode));
          var byteOut = byteArrayOutputStream();
          var bitOut = bitOutputStream(byteOut);
          bitOut.write(clearCode, bitLength);
          var dataIndex = 0;
          var s = String.fromCharCode(_data[dataIndex]);
          dataIndex += 1;
          while (dataIndex < _data.length) {
            var c = String.fromCharCode(_data[dataIndex]);
            dataIndex += 1;
            if (table.contains(s + c)) {
              s = s + c;
            } else {
              bitOut.write(table.indexOf(s), bitLength);
              if (table.size() < 4095) {
                if (table.size() == 1 << bitLength) {
                  bitLength += 1;
                }
                table.add(s + c);
              }
              s = c;
            }
          }
          bitOut.write(table.indexOf(s), bitLength);
          bitOut.write(endCode, bitLength);
          bitOut.flush();
          return byteOut.toByteArray();
        };
        var lzwTable = function() {
          var _map = {};
          var _size = 0;
          var _this2 = {};
          _this2.add = function(key) {
            if (_this2.contains(key)) {
              throw "dup key:" + key;
            }
            _map[key] = _size;
            _size += 1;
          };
          _this2.size = function() {
            return _size;
          };
          _this2.indexOf = function(key) {
            return _map[key];
          };
          _this2.contains = function(key) {
            return typeof _map[key] != "undefined";
          };
          return _this2;
        };
        return _this;
      };
      var createDataURL = function(width, height, getPixel) {
        var gif = gifImage(width, height);
        for (var y = 0; y < height; y += 1) {
          for (var x = 0; x < width; x += 1) {
            gif.setPixel(x, y, getPixel(x, y));
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
        return "data:image/gif;base64," + base64;
      };
      return qrcode2;
    })();
    !(function() {
      qrcode.stringToBytesFuncs["UTF-8"] = function(s) {
        function toUTF8Array(str) {
          var utf8 = [];
          for (var i = 0; i < str.length; i++) {
            var charcode = str.charCodeAt(i);
            if (charcode < 128) utf8.push(charcode);
            else if (charcode < 2048) {
              utf8.push(
                192 | charcode >> 6,
                128 | charcode & 63
              );
            } else if (charcode < 55296 || charcode >= 57344) {
              utf8.push(
                224 | charcode >> 12,
                128 | charcode >> 6 & 63,
                128 | charcode & 63
              );
            } else {
              i++;
              charcode = 65536 + ((charcode & 1023) << 10 | str.charCodeAt(i) & 1023);
              utf8.push(
                240 | charcode >> 18,
                128 | charcode >> 12 & 63,
                128 | charcode >> 6 & 63,
                128 | charcode & 63
              );
            }
          }
          return utf8;
        }
        return toUTF8Array(s);
      };
    })();
    (function(factory) {
      if (typeof define === "function" && define.amd) {
        define([], factory);
      } else if (typeof exports === "object") {
        module.exports = factory();
      }
    })(function() {
      return qrcode;
    });
    return module.exports;
  }

  // src/vendor/jsencrypt.js
  /*!
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
    const module = { exports: {} };
    const exports = module.exports;
    const define = void 0;
    !(function(t, e) {
      "object" == typeof exports && "object" == typeof module ? module.exports = e() : "function" == typeof define && define.amd ? define([], e) : "object" == typeof exports ? exports.JSEncrypt = e() : t.JSEncrypt = e();
    })(this, function() {
      return (function() {
        var t = { 606: function(t2) {
          var e2, r2, i2 = t2.exports = {};
          function n() {
            throw new Error("setTimeout has not been defined");
          }
          function s() {
            throw new Error("clearTimeout has not been defined");
          }
          function o(t3) {
            if (e2 === setTimeout) return setTimeout(t3, 0);
            if ((e2 === n || !e2) && setTimeout) return e2 = setTimeout, setTimeout(t3, 0);
            try {
              return e2(t3, 0);
            } catch (r3) {
              try {
                return e2.call(null, t3, 0);
              } catch (r4) {
                return e2.call(this, t3, 0);
              }
            }
          }
          !(function() {
            try {
              e2 = "function" == typeof setTimeout ? setTimeout : n;
            } catch (t3) {
              e2 = n;
            }
            try {
              r2 = "function" == typeof clearTimeout ? clearTimeout : s;
            } catch (t3) {
              r2 = s;
            }
          })();
          var h, a = [], u = false, c = -1;
          function f() {
            u && h && (u = false, h.length ? a = h.concat(a) : c = -1, a.length && l());
          }
          function l() {
            if (!u) {
              var t3 = o(f);
              u = true;
              for (var e3 = a.length; e3; ) {
                for (h = a, a = []; ++c < e3; ) h && h[c].run();
                c = -1, e3 = a.length;
              }
              h = null, u = false, (function(t4) {
                if (r2 === clearTimeout) return clearTimeout(t4);
                if ((r2 === s || !r2) && clearTimeout) return r2 = clearTimeout, clearTimeout(t4);
                try {
                  return r2(t4);
                } catch (e4) {
                  try {
                    return r2.call(null, t4);
                  } catch (e5) {
                    return r2.call(this, t4);
                  }
                }
              })(t3);
            }
          }
          function p(t3, e3) {
            this.fun = t3, this.array = e3;
          }
          function g() {
          }
          i2.nextTick = function(t3) {
            var e3 = new Array(arguments.length - 1);
            if (arguments.length > 1) for (var r3 = 1; r3 < arguments.length; r3++) e3[r3 - 1] = arguments[r3];
            a.push(new p(t3, e3)), 1 !== a.length || u || o(l);
          }, p.prototype.run = function() {
            this.fun.apply(null, this.array);
          }, i2.title = "browser", i2.browser = true, i2.env = {}, i2.argv = [], i2.version = "", i2.versions = {}, i2.on = g, i2.addListener = g, i2.once = g, i2.off = g, i2.removeListener = g, i2.removeAllListeners = g, i2.emit = g, i2.prependListener = g, i2.prependOnceListener = g, i2.listeners = function(t3) {
            return [];
          }, i2.binding = function(t3) {
            throw new Error("process.binding is not supported");
          }, i2.cwd = function() {
            return "/";
          }, i2.chdir = function(t3) {
            throw new Error("process.chdir is not supported");
          }, i2.umask = function() {
            return 0;
          };
        } }, e = {};
        function r(i2) {
          var n = e[i2];
          if (void 0 !== n) return n.exports;
          var s = e[i2] = { exports: {} };
          return t[i2](s, s.exports, r), s.exports;
        }
        r.d = function(t2, e2) {
          for (var i2 in e2) r.o(e2, i2) && !r.o(t2, i2) && Object.defineProperty(t2, i2, { enumerable: true, get: e2[i2] });
        }, r.o = function(t2, e2) {
          return Object.prototype.hasOwnProperty.call(t2, e2);
        };
        var i = {};
        return (function() {
          "use strict";
          r.d(i, { default: function() {
            return Et;
          } });
          function t2(t3) {
            return "0123456789abcdefghijklmnopqrstuvwxyz".charAt(t3);
          }
          function e2(t3, e3) {
            return t3 & e3;
          }
          function n(t3, e3) {
            return t3 | e3;
          }
          function s(t3, e3) {
            return t3 ^ e3;
          }
          function o(t3, e3) {
            return t3 & ~e3;
          }
          function h(t3) {
            if (0 == t3) return -1;
            var e3 = 0;
            return 65535 & t3 || (t3 >>= 16, e3 += 16), 255 & t3 || (t3 >>= 8, e3 += 8), 15 & t3 || (t3 >>= 4, e3 += 4), 3 & t3 || (t3 >>= 2, e3 += 2), 1 & t3 || ++e3, e3;
          }
          function a(t3) {
            for (var e3 = 0; 0 != t3; ) t3 &= t3 - 1, ++e3;
            return e3;
          }
          var u, c = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
          function f(t3) {
            var e3, r2, i2 = "";
            for (e3 = 0; e3 + 3 <= t3.length; e3 += 3) r2 = parseInt(t3.substring(e3, e3 + 3), 16), i2 += c.charAt(r2 >> 6) + c.charAt(63 & r2);
            for (e3 + 1 == t3.length ? (r2 = parseInt(t3.substring(e3, e3 + 1), 16), i2 += c.charAt(r2 << 2)) : e3 + 2 == t3.length && (r2 = parseInt(t3.substring(e3, e3 + 2), 16), i2 += c.charAt(r2 >> 2) + c.charAt((3 & r2) << 4)); (3 & i2.length) > 0; ) i2 += "=";
            return i2;
          }
          function l(e3) {
            var r2, i2 = "", n2 = 0, s2 = 0;
            for (r2 = 0; r2 < e3.length && "=" != e3.charAt(r2); ++r2) {
              var o2 = c.indexOf(e3.charAt(r2));
              o2 < 0 || (0 == n2 ? (i2 += t2(o2 >> 2), s2 = 3 & o2, n2 = 1) : 1 == n2 ? (i2 += t2(s2 << 2 | o2 >> 4), s2 = 15 & o2, n2 = 2) : 2 == n2 ? (i2 += t2(s2), i2 += t2(o2 >> 2), s2 = 3 & o2, n2 = 3) : (i2 += t2(s2 << 2 | o2 >> 4), i2 += t2(15 & o2), n2 = 0));
            }
            return 1 == n2 && (i2 += t2(s2 << 2)), i2;
          }
          var p, g = function(t3) {
            var e3;
            if (void 0 === u) {
              var r2 = "0123456789ABCDEF", i2 = " \f\n\r	 \u2028\u2029";
              for (u = {}, e3 = 0; e3 < 16; ++e3) u[r2.charAt(e3)] = e3;
              for (r2 = r2.toLowerCase(), e3 = 10; e3 < 16; ++e3) u[r2.charAt(e3)] = e3;
              for (e3 = 0; e3 < 8; ++e3) u[i2.charAt(e3)] = -1;
            }
            var n2 = [], s2 = 0, o2 = 0;
            for (e3 = 0; e3 < t3.length; ++e3) {
              var h2 = t3.charAt(e3);
              if ("=" == h2) break;
              if (-1 != (h2 = u[h2])) {
                if (void 0 === h2) throw new Error("Illegal character at offset " + e3);
                s2 |= h2, ++o2 >= 2 ? (n2[n2.length] = s2, s2 = 0, o2 = 0) : s2 <<= 4;
              }
            }
            if (o2) throw new Error("Hex encoding incomplete: 4 bits missing");
            return n2;
          }, d = { decode: function(t3) {
            var e3;
            if (void 0 === p) {
              var r2 = "= \f\n\r	 \u2028\u2029";
              for (p = /* @__PURE__ */ Object.create(null), e3 = 0; e3 < 64; ++e3) p["ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".charAt(e3)] = e3;
              for (p["-"] = 62, p._ = 63, e3 = 0; e3 < 9; ++e3) p[r2.charAt(e3)] = -1;
            }
            var i2 = [], n2 = 0, s2 = 0;
            for (e3 = 0; e3 < t3.length; ++e3) {
              var o2 = t3.charAt(e3);
              if ("=" == o2) break;
              if (-1 != (o2 = p[o2])) {
                if (void 0 === o2) throw new Error("Illegal character at offset " + e3);
                n2 |= o2, ++s2 >= 4 ? (i2[i2.length] = n2 >> 16, i2[i2.length] = n2 >> 8 & 255, i2[i2.length] = 255 & n2, n2 = 0, s2 = 0) : n2 <<= 6;
              }
            }
            switch (s2) {
              case 1:
                throw new Error("Base64 encoding incomplete: at least 2 bits missing");
              case 2:
                i2[i2.length] = n2 >> 10;
                break;
              case 3:
                i2[i2.length] = n2 >> 16, i2[i2.length] = n2 >> 8 & 255;
            }
            return i2;
          }, re: /-----BEGIN [^-]+-----([A-Za-z0-9+\/=\s]+)-----END [^-]+-----|begin-base64[^\n]+\n([A-Za-z0-9+\/=\s]+)====/, unarmor: function(t3) {
            var e3 = d.re.exec(t3);
            if (e3) if (e3[1]) t3 = e3[1];
            else {
              if (!e3[2]) throw new Error("RegExp out of sync");
              t3 = e3[2];
            }
            return d.decode(t3);
          } }, v = 1e13, y = (function() {
            function t3(t4) {
              this.buf = [+t4 || 0];
            }
            return t3.prototype.mulAdd = function(t4, e3) {
              var r2, i2, n2 = this.buf, s2 = n2.length;
              for (r2 = 0; r2 < s2; ++r2) (i2 = n2[r2] * t4 + e3) < v ? e3 = 0 : i2 -= (e3 = 0 | i2 / v) * v, n2[r2] = i2;
              e3 > 0 && (n2[r2] = e3);
            }, t3.prototype.sub = function(t4) {
              var e3, r2, i2 = this.buf, n2 = i2.length;
              for (e3 = 0; e3 < n2; ++e3) (r2 = i2[e3] - t4) < 0 ? (r2 += v, t4 = 1) : t4 = 0, i2[e3] = r2;
              for (; 0 === i2[i2.length - 1]; ) i2.pop();
            }, t3.prototype.toString = function(t4) {
              if (10 != (t4 || 10)) throw new Error("only base 10 is supported");
              for (var e3 = this.buf, r2 = e3[e3.length - 1].toString(), i2 = e3.length - 2; i2 >= 0; --i2) r2 += (v + e3[i2]).toString().substring(1);
              return r2;
            }, t3.prototype.valueOf = function() {
              for (var t4 = this.buf, e3 = 0, r2 = t4.length - 1; r2 >= 0; --r2) e3 = e3 * v + t4[r2];
              return e3;
            }, t3.prototype.simplify = function() {
              var t4 = this.buf;
              return 1 == t4.length ? t4[0] : this;
            }, t3;
          })(), m = /^(\d\d)(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])([01]\d|2[0-3])(?:([0-5]\d)(?:([0-5]\d)(?:[.,](\d{1,3}))?)?)?(Z|[-+](?:[0]\d|1[0-2])([0-5]\d)?)?$/, b = /^(\d\d\d\d)(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])([01]\d|2[0-3])(?:([0-5]\d)(?:([0-5]\d)(?:[.,](\d{1,3}))?)?)?(Z|[-+](?:[0]\d|1[0-2])([0-5]\d)?)?$/;
          function T(t3, e3) {
            return t3.length > e3 && (t3 = t3.substring(0, e3) + "…"), t3;
          }
          var S, E = (function() {
            function t3(e3, r2) {
              this.hexDigits = "0123456789ABCDEF", e3 instanceof t3 ? (this.enc = e3.enc, this.pos = e3.pos) : (this.enc = e3, this.pos = r2);
            }
            return t3.prototype.get = function(t4) {
              if (void 0 === t4 && (t4 = this.pos++), t4 >= this.enc.length) throw new Error("Requesting byte offset ".concat(t4, " on a stream of length ").concat(this.enc.length));
              return "string" == typeof this.enc ? this.enc.charCodeAt(t4) : this.enc[t4];
            }, t3.prototype.hexByte = function(t4) {
              return this.hexDigits.charAt(t4 >> 4 & 15) + this.hexDigits.charAt(15 & t4);
            }, t3.prototype.hexDump = function(t4, e3, r2) {
              for (var i2 = "", n2 = t4; n2 < e3; ++n2) if (i2 += this.hexByte(this.get(n2)), true !== r2) switch (15 & n2) {
                case 7:
                  i2 += "  ";
                  break;
                case 15:
                  i2 += "\n";
                  break;
                default:
                  i2 += " ";
              }
              return i2;
            }, t3.prototype.isASCII = function(t4, e3) {
              for (var r2 = t4; r2 < e3; ++r2) {
                var i2 = this.get(r2);
                if (i2 < 32 || i2 > 176) return false;
              }
              return true;
            }, t3.prototype.parseStringISO = function(t4, e3) {
              for (var r2 = "", i2 = t4; i2 < e3; ++i2) r2 += String.fromCharCode(this.get(i2));
              return r2;
            }, t3.prototype.parseStringUTF = function(t4, e3) {
              for (var r2 = "", i2 = t4; i2 < e3; ) {
                var n2 = this.get(i2++);
                r2 += n2 < 128 ? String.fromCharCode(n2) : n2 > 191 && n2 < 224 ? String.fromCharCode((31 & n2) << 6 | 63 & this.get(i2++)) : String.fromCharCode((15 & n2) << 12 | (63 & this.get(i2++)) << 6 | 63 & this.get(i2++));
              }
              return r2;
            }, t3.prototype.parseStringBMP = function(t4, e3) {
              for (var r2, i2, n2 = "", s2 = t4; s2 < e3; ) r2 = this.get(s2++), i2 = this.get(s2++), n2 += String.fromCharCode(r2 << 8 | i2);
              return n2;
            }, t3.prototype.parseTime = function(t4, e3, r2) {
              var i2 = this.parseStringISO(t4, e3), n2 = (r2 ? m : b).exec(i2);
              return n2 ? (r2 && (n2[1] = +n2[1], n2[1] += +n2[1] < 70 ? 2e3 : 1900), i2 = n2[1] + "-" + n2[2] + "-" + n2[3] + " " + n2[4], n2[5] && (i2 += ":" + n2[5], n2[6] && (i2 += ":" + n2[6], n2[7] && (i2 += "." + n2[7]))), n2[8] && (i2 += " UTC", "Z" != n2[8] && (i2 += n2[8], n2[9] && (i2 += ":" + n2[9]))), i2) : "Unrecognized time: " + i2;
            }, t3.prototype.parseInteger = function(t4, e3) {
              for (var r2, i2 = this.get(t4), n2 = i2 > 127, s2 = n2 ? 255 : 0, o2 = ""; i2 == s2 && ++t4 < e3; ) i2 = this.get(t4);
              if (0 === (r2 = e3 - t4)) return n2 ? -1 : 0;
              if (r2 > 4) {
                for (o2 = i2, r2 <<= 3; !(128 & (+o2 ^ s2)); ) o2 = +o2 << 1, --r2;
                o2 = "(" + r2 + " bit)\n";
              }
              n2 && (i2 -= 256);
              for (var h2 = new y(i2), a2 = t4 + 1; a2 < e3; ++a2) h2.mulAdd(256, this.get(a2));
              return o2 + h2.toString();
            }, t3.prototype.parseBitString = function(t4, e3, r2) {
              for (var i2 = this.get(t4), n2 = "(" + ((e3 - t4 - 1 << 3) - i2) + " bit)\n", s2 = "", o2 = t4 + 1; o2 < e3; ++o2) {
                for (var h2 = this.get(o2), a2 = o2 == e3 - 1 ? i2 : 0, u2 = 7; u2 >= a2; --u2) s2 += h2 >> u2 & 1 ? "1" : "0";
                if (s2.length > r2) return n2 + T(s2, r2);
              }
              return n2 + s2;
            }, t3.prototype.parseOctetString = function(t4, e3, r2) {
              if (this.isASCII(t4, e3)) return T(this.parseStringISO(t4, e3), r2);
              var i2 = e3 - t4, n2 = "(" + i2 + " byte)\n";
              i2 > (r2 /= 2) && (e3 = t4 + r2);
              for (var s2 = t4; s2 < e3; ++s2) n2 += this.hexByte(this.get(s2));
              return i2 > r2 && (n2 += "…"), n2;
            }, t3.prototype.parseOID = function(t4, e3, r2) {
              for (var i2 = "", n2 = new y(), s2 = 0, o2 = t4; o2 < e3; ++o2) {
                var h2 = this.get(o2);
                if (n2.mulAdd(128, 127 & h2), s2 += 7, !(128 & h2)) {
                  if ("" === i2) if ((n2 = n2.simplify()) instanceof y) n2.sub(80), i2 = "2." + n2.toString();
                  else {
                    var a2 = n2 < 80 ? n2 < 40 ? 0 : 1 : 2;
                    i2 = a2 + "." + (n2 - 40 * a2);
                  }
                  else i2 += "." + n2.toString();
                  if (i2.length > r2) return T(i2, r2);
                  n2 = new y(), s2 = 0;
                }
              }
              return s2 > 0 && (i2 += ".incomplete"), i2;
            }, t3;
          })(), w = (function() {
            function t3(t4, e3, r2, i2, n2) {
              if (!(i2 instanceof D)) throw new Error("Invalid tag value.");
              this.stream = t4, this.header = e3, this.length = r2, this.tag = i2, this.sub = n2;
            }
            return t3.prototype.typeName = function() {
              switch (this.tag.tagClass) {
                case 0:
                  switch (this.tag.tagNumber) {
                    case 0:
                      return "EOC";
                    case 1:
                      return "BOOLEAN";
                    case 2:
                      return "INTEGER";
                    case 3:
                      return "BIT_STRING";
                    case 4:
                      return "OCTET_STRING";
                    case 5:
                      return "NULL";
                    case 6:
                      return "OBJECT_IDENTIFIER";
                    case 7:
                      return "ObjectDescriptor";
                    case 8:
                      return "EXTERNAL";
                    case 9:
                      return "REAL";
                    case 10:
                      return "ENUMERATED";
                    case 11:
                      return "EMBEDDED_PDV";
                    case 12:
                      return "UTF8String";
                    case 16:
                      return "SEQUENCE";
                    case 17:
                      return "SET";
                    case 18:
                      return "NumericString";
                    case 19:
                      return "PrintableString";
                    case 20:
                      return "TeletexString";
                    case 21:
                      return "VideotexString";
                    case 22:
                      return "IA5String";
                    case 23:
                      return "UTCTime";
                    case 24:
                      return "GeneralizedTime";
                    case 25:
                      return "GraphicString";
                    case 26:
                      return "VisibleString";
                    case 27:
                      return "GeneralString";
                    case 28:
                      return "UniversalString";
                    case 30:
                      return "BMPString";
                  }
                  return "Universal_" + this.tag.tagNumber.toString();
                case 1:
                  return "Application_" + this.tag.tagNumber.toString();
                case 2:
                  return "[" + this.tag.tagNumber.toString() + "]";
                case 3:
                  return "Private_" + this.tag.tagNumber.toString();
              }
            }, t3.prototype.content = function(t4) {
              if (void 0 === this.tag) return null;
              void 0 === t4 && (t4 = 1 / 0);
              var e3 = this.posContent(), r2 = Math.abs(this.length);
              if (!this.tag.isUniversal()) return null !== this.sub ? "(" + this.sub.length + " elem)" : this.stream.parseOctetString(e3, e3 + r2, t4);
              switch (this.tag.tagNumber) {
                case 1:
                  return 0 === this.stream.get(e3) ? "false" : "true";
                case 2:
                  return this.stream.parseInteger(e3, e3 + r2);
                case 3:
                  return this.sub ? "(" + this.sub.length + " elem)" : this.stream.parseBitString(e3, e3 + r2, t4);
                case 4:
                  return this.sub ? "(" + this.sub.length + " elem)" : this.stream.parseOctetString(e3, e3 + r2, t4);
                case 6:
                  return this.stream.parseOID(e3, e3 + r2, t4);
                case 16:
                case 17:
                  return null !== this.sub ? "(" + this.sub.length + " elem)" : "(no elem)";
                case 12:
                  return T(this.stream.parseStringUTF(e3, e3 + r2), t4);
                case 18:
                case 19:
                case 20:
                case 21:
                case 22:
                case 26:
                  return T(this.stream.parseStringISO(e3, e3 + r2), t4);
                case 30:
                  return T(this.stream.parseStringBMP(e3, e3 + r2), t4);
                case 23:
                case 24:
                  return this.stream.parseTime(e3, e3 + r2, 23 == this.tag.tagNumber);
              }
              return null;
            }, t3.prototype.toString = function() {
              return this.typeName() + "@" + this.stream.pos + "[header:" + this.header + ",length:" + this.length + ",sub:" + (null === this.sub ? "null" : this.sub.length) + "]";
            }, t3.prototype.toPrettyString = function(t4) {
              void 0 === t4 && (t4 = "");
              var e3 = t4 + this.typeName() + " @" + this.stream.pos;
              if (this.length >= 0 && (e3 += "+"), e3 += this.length, this.tag.tagConstructed ? e3 += " (constructed)" : !this.tag.isUniversal() || 3 != this.tag.tagNumber && 4 != this.tag.tagNumber || null === this.sub || (e3 += " (encapsulates)"), e3 += "\n", null !== this.sub) {
                t4 += "  ";
                for (var r2 = 0, i2 = this.sub.length; r2 < i2; ++r2) e3 += this.sub[r2].toPrettyString(t4);
              }
              return e3;
            }, t3.prototype.posStart = function() {
              return this.stream.pos;
            }, t3.prototype.posContent = function() {
              return this.stream.pos + this.header;
            }, t3.prototype.posEnd = function() {
              return this.stream.pos + this.header + Math.abs(this.length);
            }, t3.prototype.toHexString = function() {
              return this.stream.hexDump(this.posStart(), this.posEnd(), true);
            }, t3.decodeLength = function(t4) {
              var e3 = t4.get(), r2 = 127 & e3;
              if (r2 == e3) return r2;
              if (r2 > 6) throw new Error("Length over 48 bits not supported at position " + (t4.pos - 1));
              if (0 === r2) return null;
              e3 = 0;
              for (var i2 = 0; i2 < r2; ++i2) e3 = 256 * e3 + t4.get();
              return e3;
            }, t3.prototype.getHexStringValue = function() {
              var t4 = this.toHexString(), e3 = 2 * this.header, r2 = 2 * this.length;
              return t4.substring(e3, e3 + r2);
            }, t3.decode = function(e3) {
              var r2;
              r2 = e3 instanceof E ? e3 : new E(e3, 0);
              var i2 = new E(r2), n2 = new D(r2), s2 = t3.decodeLength(r2), o2 = r2.pos, h2 = o2 - i2.pos, a2 = null, u2 = function() {
                var e4 = [];
                if (null !== s2) {
                  for (var i3 = o2 + s2; r2.pos < i3; ) e4[e4.length] = t3.decode(r2);
                  if (r2.pos != i3) throw new Error("Content size is not correct for container starting at offset " + o2);
                } else try {
                  for (; ; ) {
                    var n3 = t3.decode(r2);
                    if (n3.tag.isEOC()) break;
                    e4[e4.length] = n3;
                  }
                  s2 = o2 - r2.pos;
                } catch (t4) {
                  throw new Error("Exception while decoding undefined length content: " + t4);
                }
                return e4;
              };
              if (n2.tagConstructed) a2 = u2();
              else if (n2.isUniversal() && (3 == n2.tagNumber || 4 == n2.tagNumber)) try {
                if (3 == n2.tagNumber && 0 != r2.get()) throw new Error("BIT STRINGs with unused bits cannot encapsulate.");
                a2 = u2();
                for (var c2 = 0; c2 < a2.length; ++c2) if (a2[c2].tag.isEOC()) throw new Error("EOC is not supposed to be actual content.");
              } catch (t4) {
                a2 = null;
              }
              if (null === a2) {
                if (null === s2) throw new Error("We can't skip over an invalid tag with undefined length at offset " + o2);
                r2.pos = o2 + Math.abs(s2);
              }
              return new t3(i2, h2, s2, n2, a2);
            }, t3;
          })(), D = (function() {
            function t3(t4) {
              var e3 = t4.get();
              if (this.tagClass = e3 >> 6, this.tagConstructed = !!(32 & e3), this.tagNumber = 31 & e3, 31 == this.tagNumber) {
                var r2 = new y();
                do {
                  e3 = t4.get(), r2.mulAdd(128, 127 & e3);
                } while (128 & e3);
                this.tagNumber = r2.simplify();
              }
            }
            return t3.prototype.isUniversal = function() {
              return 0 === this.tagClass;
            }, t3.prototype.isEOC = function() {
              return 0 === this.tagClass && 0 === this.tagNumber;
            }, t3;
          })(), x = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97, 101, 103, 107, 109, 113, 127, 131, 137, 139, 149, 151, 157, 163, 167, 173, 179, 181, 191, 193, 197, 199, 211, 223, 227, 229, 233, 239, 241, 251, 257, 263, 269, 271, 277, 281, 283, 293, 307, 311, 313, 317, 331, 337, 347, 349, 353, 359, 367, 373, 379, 383, 389, 397, 401, 409, 419, 421, 431, 433, 439, 443, 449, 457, 461, 463, 467, 479, 487, 491, 499, 503, 509, 521, 523, 541, 547, 557, 563, 569, 571, 577, 587, 593, 599, 601, 607, 613, 617, 619, 631, 641, 643, 647, 653, 659, 661, 673, 677, 683, 691, 701, 709, 719, 727, 733, 739, 743, 751, 757, 761, 769, 773, 787, 797, 809, 811, 821, 823, 827, 829, 839, 853, 857, 859, 863, 877, 881, 883, 887, 907, 911, 919, 929, 937, 941, 947, 953, 967, 971, 977, 983, 991, 997], R = (1 << 26) / x[x.length - 1], A = (function() {
            function r2(t3, e3, r3) {
              null != t3 && ("number" == typeof t3 ? this.fromNumber(t3, e3, r3) : null == e3 && "string" != typeof t3 ? this.fromString(t3, 256) : this.fromString(t3, e3));
            }
            return r2.prototype.toString = function(e3) {
              if (this.s < 0) return "-" + this.negate().toString(e3);
              var r3;
              if (16 == e3) r3 = 4;
              else if (8 == e3) r3 = 3;
              else if (2 == e3) r3 = 1;
              else if (32 == e3) r3 = 5;
              else {
                if (4 != e3) return this.toRadix(e3);
                r3 = 2;
              }
              var i2, n2 = (1 << r3) - 1, s2 = false, o2 = "", h2 = this.t, a2 = this.DB - h2 * this.DB % r3;
              if (h2-- > 0) for (a2 < this.DB && (i2 = this[h2] >> a2) > 0 && (s2 = true, o2 = t2(i2)); h2 >= 0; ) a2 < r3 ? (i2 = (this[h2] & (1 << a2) - 1) << r3 - a2, i2 |= this[--h2] >> (a2 += this.DB - r3)) : (i2 = this[h2] >> (a2 -= r3) & n2, a2 <= 0 && (a2 += this.DB, --h2)), i2 > 0 && (s2 = true), s2 && (o2 += t2(i2));
              return s2 ? o2 : "0";
            }, r2.prototype.negate = function() {
              var t3 = N();
              return r2.ZERO.subTo(this, t3), t3;
            }, r2.prototype.abs = function() {
              return this.s < 0 ? this.negate() : this;
            }, r2.prototype.compareTo = function(t3) {
              var e3 = this.s - t3.s;
              if (0 != e3) return e3;
              var r3 = this.t;
              if (0 != (e3 = r3 - t3.t)) return this.s < 0 ? -e3 : e3;
              for (; --r3 >= 0; ) if (0 != (e3 = this[r3] - t3[r3])) return e3;
              return 0;
            }, r2.prototype.bitLength = function() {
              return this.t <= 0 ? 0 : this.DB * (this.t - 1) + F(this[this.t - 1] ^ this.s & this.DM);
            }, r2.prototype.mod = function(t3) {
              var e3 = N();
              return this.abs().divRemTo(t3, null, e3), this.s < 0 && e3.compareTo(r2.ZERO) > 0 && t3.subTo(e3, e3), e3;
            }, r2.prototype.modPowInt = function(t3, e3) {
              var r3;
              return r3 = t3 < 256 || e3.isEven() ? new O(e3) : new V(e3), this.exp(t3, r3);
            }, r2.prototype.clone = function() {
              var t3 = N();
              return this.copyTo(t3), t3;
            }, r2.prototype.intValue = function() {
              if (this.s < 0) {
                if (1 == this.t) return this[0] - this.DV;
                if (0 == this.t) return -1;
              } else {
                if (1 == this.t) return this[0];
                if (0 == this.t) return 0;
              }
              return (this[1] & (1 << 32 - this.DB) - 1) << this.DB | this[0];
            }, r2.prototype.byteValue = function() {
              return 0 == this.t ? this.s : this[0] << 24 >> 24;
            }, r2.prototype.shortValue = function() {
              return 0 == this.t ? this.s : this[0] << 16 >> 16;
            }, r2.prototype.signum = function() {
              return this.s < 0 ? -1 : this.t <= 0 || 1 == this.t && this[0] <= 0 ? 0 : 1;
            }, r2.prototype.toByteArray = function() {
              var t3 = this.t, e3 = [];
              e3[0] = this.s;
              var r3, i2 = this.DB - t3 * this.DB % 8, n2 = 0;
              if (t3-- > 0) for (i2 < this.DB && (r3 = this[t3] >> i2) != (this.s & this.DM) >> i2 && (e3[n2++] = r3 | this.s << this.DB - i2); t3 >= 0; ) i2 < 8 ? (r3 = (this[t3] & (1 << i2) - 1) << 8 - i2, r3 |= this[--t3] >> (i2 += this.DB - 8)) : (r3 = this[t3] >> (i2 -= 8) & 255, i2 <= 0 && (i2 += this.DB, --t3)), 128 & r3 && (r3 |= -256), 0 == n2 && (128 & this.s) != (128 & r3) && ++n2, (n2 > 0 || r3 != this.s) && (e3[n2++] = r3);
              return e3;
            }, r2.prototype.equals = function(t3) {
              return 0 == this.compareTo(t3);
            }, r2.prototype.min = function(t3) {
              return this.compareTo(t3) < 0 ? this : t3;
            }, r2.prototype.max = function(t3) {
              return this.compareTo(t3) > 0 ? this : t3;
            }, r2.prototype.and = function(t3) {
              var r3 = N();
              return this.bitwiseTo(t3, e2, r3), r3;
            }, r2.prototype.or = function(t3) {
              var e3 = N();
              return this.bitwiseTo(t3, n, e3), e3;
            }, r2.prototype.xor = function(t3) {
              var e3 = N();
              return this.bitwiseTo(t3, s, e3), e3;
            }, r2.prototype.andNot = function(t3) {
              var e3 = N();
              return this.bitwiseTo(t3, o, e3), e3;
            }, r2.prototype.not = function() {
              for (var t3 = N(), e3 = 0; e3 < this.t; ++e3) t3[e3] = this.DM & ~this[e3];
              return t3.t = this.t, t3.s = ~this.s, t3;
            }, r2.prototype.shiftLeft = function(t3) {
              var e3 = N();
              return t3 < 0 ? this.rShiftTo(-t3, e3) : this.lShiftTo(t3, e3), e3;
            }, r2.prototype.shiftRight = function(t3) {
              var e3 = N();
              return t3 < 0 ? this.lShiftTo(-t3, e3) : this.rShiftTo(t3, e3), e3;
            }, r2.prototype.getLowestSetBit = function() {
              for (var t3 = 0; t3 < this.t; ++t3) if (0 != this[t3]) return t3 * this.DB + h(this[t3]);
              return this.s < 0 ? this.t * this.DB : -1;
            }, r2.prototype.bitCount = function() {
              for (var t3 = 0, e3 = this.s & this.DM, r3 = 0; r3 < this.t; ++r3) t3 += a(this[r3] ^ e3);
              return t3;
            }, r2.prototype.testBit = function(t3) {
              var e3 = Math.floor(t3 / this.DB);
              return e3 >= this.t ? 0 != this.s : !!(this[e3] & 1 << t3 % this.DB);
            }, r2.prototype.setBit = function(t3) {
              return this.changeBit(t3, n);
            }, r2.prototype.clearBit = function(t3) {
              return this.changeBit(t3, o);
            }, r2.prototype.flipBit = function(t3) {
              return this.changeBit(t3, s);
            }, r2.prototype.add = function(t3) {
              var e3 = N();
              return this.addTo(t3, e3), e3;
            }, r2.prototype.subtract = function(t3) {
              var e3 = N();
              return this.subTo(t3, e3), e3;
            }, r2.prototype.multiply = function(t3) {
              var e3 = N();
              return this.multiplyTo(t3, e3), e3;
            }, r2.prototype.divide = function(t3) {
              var e3 = N();
              return this.divRemTo(t3, e3, null), e3;
            }, r2.prototype.remainder = function(t3) {
              var e3 = N();
              return this.divRemTo(t3, null, e3), e3;
            }, r2.prototype.divideAndRemainder = function(t3) {
              var e3 = N(), r3 = N();
              return this.divRemTo(t3, e3, r3), [e3, r3];
            }, r2.prototype.modPow = function(t3, e3) {
              var r3, i2, n2 = t3.bitLength(), s2 = H(1);
              if (n2 <= 0) return s2;
              r3 = n2 < 18 ? 1 : n2 < 48 ? 3 : n2 < 144 ? 4 : n2 < 768 ? 5 : 6, i2 = n2 < 8 ? new O(e3) : e3.isEven() ? new I(e3) : new V(e3);
              var o2 = [], h2 = 3, a2 = r3 - 1, u2 = (1 << r3) - 1;
              if (o2[1] = i2.convert(this), r3 > 1) {
                var c2 = N();
                for (i2.sqrTo(o2[1], c2); h2 <= u2; ) o2[h2] = N(), i2.mulTo(c2, o2[h2 - 2], o2[h2]), h2 += 2;
              }
              var f2, l2, p2 = t3.t - 1, g2 = true, d2 = N();
              for (n2 = F(t3[p2]) - 1; p2 >= 0; ) {
                for (n2 >= a2 ? f2 = t3[p2] >> n2 - a2 & u2 : (f2 = (t3[p2] & (1 << n2 + 1) - 1) << a2 - n2, p2 > 0 && (f2 |= t3[p2 - 1] >> this.DB + n2 - a2)), h2 = r3; !(1 & f2); ) f2 >>= 1, --h2;
                if ((n2 -= h2) < 0 && (n2 += this.DB, --p2), g2) o2[f2].copyTo(s2), g2 = false;
                else {
                  for (; h2 > 1; ) i2.sqrTo(s2, d2), i2.sqrTo(d2, s2), h2 -= 2;
                  h2 > 0 ? i2.sqrTo(s2, d2) : (l2 = s2, s2 = d2, d2 = l2), i2.mulTo(d2, o2[f2], s2);
                }
                for (; p2 >= 0 && !(t3[p2] & 1 << n2); ) i2.sqrTo(s2, d2), l2 = s2, s2 = d2, d2 = l2, --n2 < 0 && (n2 = this.DB - 1, --p2);
              }
              return i2.revert(s2);
            }, r2.prototype.modInverse = function(t3) {
              var e3 = t3.isEven();
              if (this.isEven() && e3 || 0 == t3.signum()) return r2.ZERO;
              for (var i2 = t3.clone(), n2 = this.clone(), s2 = H(1), o2 = H(0), h2 = H(0), a2 = H(1); 0 != i2.signum(); ) {
                for (; i2.isEven(); ) i2.rShiftTo(1, i2), e3 ? (s2.isEven() && o2.isEven() || (s2.addTo(this, s2), o2.subTo(t3, o2)), s2.rShiftTo(1, s2)) : o2.isEven() || o2.subTo(t3, o2), o2.rShiftTo(1, o2);
                for (; n2.isEven(); ) n2.rShiftTo(1, n2), e3 ? (h2.isEven() && a2.isEven() || (h2.addTo(this, h2), a2.subTo(t3, a2)), h2.rShiftTo(1, h2)) : a2.isEven() || a2.subTo(t3, a2), a2.rShiftTo(1, a2);
                i2.compareTo(n2) >= 0 ? (i2.subTo(n2, i2), e3 && s2.subTo(h2, s2), o2.subTo(a2, o2)) : (n2.subTo(i2, n2), e3 && h2.subTo(s2, h2), a2.subTo(o2, a2));
              }
              return 0 != n2.compareTo(r2.ONE) ? r2.ZERO : a2.compareTo(t3) >= 0 ? a2.subtract(t3) : a2.signum() < 0 ? (a2.addTo(t3, a2), a2.signum() < 0 ? a2.add(t3) : a2) : a2;
            }, r2.prototype.pow = function(t3) {
              return this.exp(t3, new B());
            }, r2.prototype.gcd = function(t3) {
              var e3 = this.s < 0 ? this.negate() : this.clone(), r3 = t3.s < 0 ? t3.negate() : t3.clone();
              if (e3.compareTo(r3) < 0) {
                var i2 = e3;
                e3 = r3, r3 = i2;
              }
              var n2 = e3.getLowestSetBit(), s2 = r3.getLowestSetBit();
              if (s2 < 0) return e3;
              for (n2 < s2 && (s2 = n2), s2 > 0 && (e3.rShiftTo(s2, e3), r3.rShiftTo(s2, r3)); e3.signum() > 0; ) (n2 = e3.getLowestSetBit()) > 0 && e3.rShiftTo(n2, e3), (n2 = r3.getLowestSetBit()) > 0 && r3.rShiftTo(n2, r3), e3.compareTo(r3) >= 0 ? (e3.subTo(r3, e3), e3.rShiftTo(1, e3)) : (r3.subTo(e3, r3), r3.rShiftTo(1, r3));
              return s2 > 0 && r3.lShiftTo(s2, r3), r3;
            }, r2.prototype.isProbablePrime = function(t3) {
              var e3, r3 = this.abs();
              if (1 == r3.t && r3[0] <= x[x.length - 1]) {
                for (e3 = 0; e3 < x.length; ++e3) if (r3[0] == x[e3]) return true;
                return false;
              }
              if (r3.isEven()) return false;
              for (e3 = 1; e3 < x.length; ) {
                for (var i2 = x[e3], n2 = e3 + 1; n2 < x.length && i2 < R; ) i2 *= x[n2++];
                for (i2 = r3.modInt(i2); e3 < n2; ) if (i2 % x[e3++] == 0) return false;
              }
              return r3.millerRabin(t3);
            }, r2.prototype.copyTo = function(t3) {
              for (var e3 = this.t - 1; e3 >= 0; --e3) t3[e3] = this[e3];
              t3.t = this.t, t3.s = this.s;
            }, r2.prototype.fromInt = function(t3) {
              this.t = 1, this.s = t3 < 0 ? -1 : 0, t3 > 0 ? this[0] = t3 : t3 < -1 ? this[0] = t3 + this.DV : this.t = 0;
            }, r2.prototype.fromString = function(t3, e3) {
              var i2;
              if (16 == e3) i2 = 4;
              else if (8 == e3) i2 = 3;
              else if (256 == e3) i2 = 8;
              else if (2 == e3) i2 = 1;
              else if (32 == e3) i2 = 5;
              else {
                if (4 != e3) return void this.fromRadix(t3, e3);
                i2 = 2;
              }
              this.t = 0, this.s = 0;
              for (var n2 = t3.length, s2 = false, o2 = 0; --n2 >= 0; ) {
                var h2 = 8 == i2 ? 255 & +t3[n2] : C(t3, n2);
                h2 < 0 ? "-" == t3.charAt(n2) && (s2 = true) : (s2 = false, 0 == o2 ? this[this.t++] = h2 : o2 + i2 > this.DB ? (this[this.t - 1] |= (h2 & (1 << this.DB - o2) - 1) << o2, this[this.t++] = h2 >> this.DB - o2) : this[this.t - 1] |= h2 << o2, (o2 += i2) >= this.DB && (o2 -= this.DB));
              }
              8 == i2 && 128 & +t3[0] && (this.s = -1, o2 > 0 && (this[this.t - 1] |= (1 << this.DB - o2) - 1 << o2)), this.clamp(), s2 && r2.ZERO.subTo(this, this);
            }, r2.prototype.clamp = function() {
              for (var t3 = this.s & this.DM; this.t > 0 && this[this.t - 1] == t3; ) --this.t;
            }, r2.prototype.dlShiftTo = function(t3, e3) {
              var r3;
              for (r3 = this.t - 1; r3 >= 0; --r3) e3[r3 + t3] = this[r3];
              for (r3 = t3 - 1; r3 >= 0; --r3) e3[r3] = 0;
              e3.t = this.t + t3, e3.s = this.s;
            }, r2.prototype.drShiftTo = function(t3, e3) {
              for (var r3 = t3; r3 < this.t; ++r3) e3[r3 - t3] = this[r3];
              e3.t = Math.max(this.t - t3, 0), e3.s = this.s;
            }, r2.prototype.lShiftTo = function(t3, e3) {
              for (var r3 = t3 % this.DB, i2 = this.DB - r3, n2 = (1 << i2) - 1, s2 = Math.floor(t3 / this.DB), o2 = this.s << r3 & this.DM, h2 = this.t - 1; h2 >= 0; --h2) e3[h2 + s2 + 1] = this[h2] >> i2 | o2, o2 = (this[h2] & n2) << r3;
              for (h2 = s2 - 1; h2 >= 0; --h2) e3[h2] = 0;
              e3[s2] = o2, e3.t = this.t + s2 + 1, e3.s = this.s, e3.clamp();
            }, r2.prototype.rShiftTo = function(t3, e3) {
              e3.s = this.s;
              var r3 = Math.floor(t3 / this.DB);
              if (r3 >= this.t) e3.t = 0;
              else {
                var i2 = t3 % this.DB, n2 = this.DB - i2, s2 = (1 << i2) - 1;
                e3[0] = this[r3] >> i2;
                for (var o2 = r3 + 1; o2 < this.t; ++o2) e3[o2 - r3 - 1] |= (this[o2] & s2) << n2, e3[o2 - r3] = this[o2] >> i2;
                i2 > 0 && (e3[this.t - r3 - 1] |= (this.s & s2) << n2), e3.t = this.t - r3, e3.clamp();
              }
            }, r2.prototype.subTo = function(t3, e3) {
              for (var r3 = 0, i2 = 0, n2 = Math.min(t3.t, this.t); r3 < n2; ) i2 += this[r3] - t3[r3], e3[r3++] = i2 & this.DM, i2 >>= this.DB;
              if (t3.t < this.t) {
                for (i2 -= t3.s; r3 < this.t; ) i2 += this[r3], e3[r3++] = i2 & this.DM, i2 >>= this.DB;
                i2 += this.s;
              } else {
                for (i2 += this.s; r3 < t3.t; ) i2 -= t3[r3], e3[r3++] = i2 & this.DM, i2 >>= this.DB;
                i2 -= t3.s;
              }
              e3.s = i2 < 0 ? -1 : 0, i2 < -1 ? e3[r3++] = this.DV + i2 : i2 > 0 && (e3[r3++] = i2), e3.t = r3, e3.clamp();
            }, r2.prototype.multiplyTo = function(t3, e3) {
              var i2 = this.abs(), n2 = t3.abs(), s2 = i2.t;
              for (e3.t = s2 + n2.t; --s2 >= 0; ) e3[s2] = 0;
              for (s2 = 0; s2 < n2.t; ++s2) e3[s2 + i2.t] = i2.am(0, n2[s2], e3, s2, 0, i2.t);
              e3.s = 0, e3.clamp(), this.s != t3.s && r2.ZERO.subTo(e3, e3);
            }, r2.prototype.squareTo = function(t3) {
              for (var e3 = this.abs(), r3 = t3.t = 2 * e3.t; --r3 >= 0; ) t3[r3] = 0;
              for (r3 = 0; r3 < e3.t - 1; ++r3) {
                var i2 = e3.am(r3, e3[r3], t3, 2 * r3, 0, 1);
                (t3[r3 + e3.t] += e3.am(r3 + 1, 2 * e3[r3], t3, 2 * r3 + 1, i2, e3.t - r3 - 1)) >= e3.DV && (t3[r3 + e3.t] -= e3.DV, t3[r3 + e3.t + 1] = 1);
              }
              t3.t > 0 && (t3[t3.t - 1] += e3.am(r3, e3[r3], t3, 2 * r3, 0, 1)), t3.s = 0, t3.clamp();
            }, r2.prototype.divRemTo = function(t3, e3, i2) {
              var n2 = t3.abs();
              if (!(n2.t <= 0)) {
                var s2 = this.abs();
                if (s2.t < n2.t) return null != e3 && e3.fromInt(0), void (null != i2 && this.copyTo(i2));
                null == i2 && (i2 = N());
                var o2 = N(), h2 = this.s, a2 = t3.s, u2 = this.DB - F(n2[n2.t - 1]);
                u2 > 0 ? (n2.lShiftTo(u2, o2), s2.lShiftTo(u2, i2)) : (n2.copyTo(o2), s2.copyTo(i2));
                var c2 = o2.t, f2 = o2[c2 - 1];
                if (0 != f2) {
                  var l2 = f2 * (1 << this.F1) + (c2 > 1 ? o2[c2 - 2] >> this.F2 : 0), p2 = this.FV / l2, g2 = (1 << this.F1) / l2, d2 = 1 << this.F2, v2 = i2.t, y2 = v2 - c2, m2 = null == e3 ? N() : e3;
                  for (o2.dlShiftTo(y2, m2), i2.compareTo(m2) >= 0 && (i2[i2.t++] = 1, i2.subTo(m2, i2)), r2.ONE.dlShiftTo(c2, m2), m2.subTo(o2, o2); o2.t < c2; ) o2[o2.t++] = 0;
                  for (; --y2 >= 0; ) {
                    var b2 = i2[--v2] == f2 ? this.DM : Math.floor(i2[v2] * p2 + (i2[v2 - 1] + d2) * g2);
                    if ((i2[v2] += o2.am(0, b2, i2, y2, 0, c2)) < b2) for (o2.dlShiftTo(y2, m2), i2.subTo(m2, i2); i2[v2] < --b2; ) i2.subTo(m2, i2);
                  }
                  null != e3 && (i2.drShiftTo(c2, e3), h2 != a2 && r2.ZERO.subTo(e3, e3)), i2.t = c2, i2.clamp(), u2 > 0 && i2.rShiftTo(u2, i2), h2 < 0 && r2.ZERO.subTo(i2, i2);
                }
              }
            }, r2.prototype.invDigit = function() {
              if (this.t < 1) return 0;
              var t3 = this[0];
              if (!(1 & t3)) return 0;
              var e3 = 3 & t3;
              return (e3 = (e3 = (e3 = (e3 = e3 * (2 - (15 & t3) * e3) & 15) * (2 - (255 & t3) * e3) & 255) * (2 - ((65535 & t3) * e3 & 65535)) & 65535) * (2 - t3 * e3 % this.DV) % this.DV) > 0 ? this.DV - e3 : -e3;
            }, r2.prototype.isEven = function() {
              return 0 == (this.t > 0 ? 1 & this[0] : this.s);
            }, r2.prototype.exp = function(t3, e3) {
              if (t3 > 4294967295 || t3 < 1) return r2.ONE;
              var i2 = N(), n2 = N(), s2 = e3.convert(this), o2 = F(t3) - 1;
              for (s2.copyTo(i2); --o2 >= 0; ) if (e3.sqrTo(i2, n2), (t3 & 1 << o2) > 0) e3.mulTo(n2, s2, i2);
              else {
                var h2 = i2;
                i2 = n2, n2 = h2;
              }
              return e3.revert(i2);
            }, r2.prototype.chunkSize = function(t3) {
              return Math.floor(Math.LN2 * this.DB / Math.log(t3));
            }, r2.prototype.toRadix = function(t3) {
              if (null == t3 && (t3 = 10), 0 == this.signum() || t3 < 2 || t3 > 36) return "0";
              var e3 = this.chunkSize(t3), r3 = Math.pow(t3, e3), i2 = H(r3), n2 = N(), s2 = N(), o2 = "";
              for (this.divRemTo(i2, n2, s2); n2.signum() > 0; ) o2 = (r3 + s2.intValue()).toString(t3).substring(1) + o2, n2.divRemTo(i2, n2, s2);
              return s2.intValue().toString(t3) + o2;
            }, r2.prototype.fromRadix = function(t3, e3) {
              this.fromInt(0), null == e3 && (e3 = 10);
              for (var i2 = this.chunkSize(e3), n2 = Math.pow(e3, i2), s2 = false, o2 = 0, h2 = 0, a2 = 0; a2 < t3.length; ++a2) {
                var u2 = C(t3, a2);
                u2 < 0 ? "-" == t3.charAt(a2) && 0 == this.signum() && (s2 = true) : (h2 = e3 * h2 + u2, ++o2 >= i2 && (this.dMultiply(n2), this.dAddOffset(h2, 0), o2 = 0, h2 = 0));
              }
              o2 > 0 && (this.dMultiply(Math.pow(e3, o2)), this.dAddOffset(h2, 0)), s2 && r2.ZERO.subTo(this, this);
            }, r2.prototype.fromNumber = function(t3, e3, i2) {
              if ("number" == typeof e3) if (t3 < 2) this.fromInt(1);
              else for (this.fromNumber(t3, i2), this.testBit(t3 - 1) || this.bitwiseTo(r2.ONE.shiftLeft(t3 - 1), n, this), this.isEven() && this.dAddOffset(1, 0); !this.isProbablePrime(e3); ) this.dAddOffset(2, 0), this.bitLength() > t3 && this.subTo(r2.ONE.shiftLeft(t3 - 1), this);
              else {
                var s2 = [], o2 = 7 & t3;
                s2.length = 1 + (t3 >> 3), e3.nextBytes(s2), o2 > 0 ? s2[0] &= (1 << o2) - 1 : s2[0] = 0, this.fromString(s2, 256);
              }
            }, r2.prototype.bitwiseTo = function(t3, e3, r3) {
              var i2, n2, s2 = Math.min(t3.t, this.t);
              for (i2 = 0; i2 < s2; ++i2) r3[i2] = e3(this[i2], t3[i2]);
              if (t3.t < this.t) {
                for (n2 = t3.s & this.DM, i2 = s2; i2 < this.t; ++i2) r3[i2] = e3(this[i2], n2);
                r3.t = this.t;
              } else {
                for (n2 = this.s & this.DM, i2 = s2; i2 < t3.t; ++i2) r3[i2] = e3(n2, t3[i2]);
                r3.t = t3.t;
              }
              r3.s = e3(this.s, t3.s), r3.clamp();
            }, r2.prototype.changeBit = function(t3, e3) {
              var i2 = r2.ONE.shiftLeft(t3);
              return this.bitwiseTo(i2, e3, i2), i2;
            }, r2.prototype.addTo = function(t3, e3) {
              for (var r3 = 0, i2 = 0, n2 = Math.min(t3.t, this.t); r3 < n2; ) i2 += this[r3] + t3[r3], e3[r3++] = i2 & this.DM, i2 >>= this.DB;
              if (t3.t < this.t) {
                for (i2 += t3.s; r3 < this.t; ) i2 += this[r3], e3[r3++] = i2 & this.DM, i2 >>= this.DB;
                i2 += this.s;
              } else {
                for (i2 += this.s; r3 < t3.t; ) i2 += t3[r3], e3[r3++] = i2 & this.DM, i2 >>= this.DB;
                i2 += t3.s;
              }
              e3.s = i2 < 0 ? -1 : 0, i2 > 0 ? e3[r3++] = i2 : i2 < -1 && (e3[r3++] = this.DV + i2), e3.t = r3, e3.clamp();
            }, r2.prototype.dMultiply = function(t3) {
              this[this.t] = this.am(0, t3 - 1, this, 0, 0, this.t), ++this.t, this.clamp();
            }, r2.prototype.dAddOffset = function(t3, e3) {
              if (0 != t3) {
                for (; this.t <= e3; ) this[this.t++] = 0;
                for (this[e3] += t3; this[e3] >= this.DV; ) this[e3] -= this.DV, ++e3 >= this.t && (this[this.t++] = 0), ++this[e3];
              }
            }, r2.prototype.multiplyLowerTo = function(t3, e3, r3) {
              var i2 = Math.min(this.t + t3.t, e3);
              for (r3.s = 0, r3.t = i2; i2 > 0; ) r3[--i2] = 0;
              for (var n2 = r3.t - this.t; i2 < n2; ++i2) r3[i2 + this.t] = this.am(0, t3[i2], r3, i2, 0, this.t);
              for (n2 = Math.min(t3.t, e3); i2 < n2; ++i2) this.am(0, t3[i2], r3, i2, 0, e3 - i2);
              r3.clamp();
            }, r2.prototype.multiplyUpperTo = function(t3, e3, r3) {
              --e3;
              var i2 = r3.t = this.t + t3.t - e3;
              for (r3.s = 0; --i2 >= 0; ) r3[i2] = 0;
              for (i2 = Math.max(e3 - this.t, 0); i2 < t3.t; ++i2) r3[this.t + i2 - e3] = this.am(e3 - i2, t3[i2], r3, 0, 0, this.t + i2 - e3);
              r3.clamp(), r3.drShiftTo(1, r3);
            }, r2.prototype.modInt = function(t3) {
              if (t3 <= 0) return 0;
              var e3 = this.DV % t3, r3 = this.s < 0 ? t3 - 1 : 0;
              if (this.t > 0) if (0 == e3) r3 = this[0] % t3;
              else for (var i2 = this.t - 1; i2 >= 0; --i2) r3 = (e3 * r3 + this[i2]) % t3;
              return r3;
            }, r2.prototype.millerRabin = function(t3) {
              var e3 = this.subtract(r2.ONE), i2 = e3.getLowestSetBit();
              if (i2 <= 0) return false;
              var n2 = e3.shiftRight(i2);
              (t3 = t3 + 1 >> 1) > x.length && (t3 = x.length);
              for (var s2 = N(), o2 = 0; o2 < t3; ++o2) {
                s2.fromInt(x[Math.floor(Math.random() * x.length)]);
                var h2 = s2.modPow(n2, this);
                if (0 != h2.compareTo(r2.ONE) && 0 != h2.compareTo(e3)) {
                  for (var a2 = 1; a2++ < i2 && 0 != h2.compareTo(e3); ) if (0 == (h2 = h2.modPowInt(2, this)).compareTo(r2.ONE)) return false;
                  if (0 != h2.compareTo(e3)) return false;
                }
              }
              return true;
            }, r2.prototype.square = function() {
              var t3 = N();
              return this.squareTo(t3), t3;
            }, r2.prototype.gcda = function(t3, e3) {
              var r3 = this.s < 0 ? this.negate() : this.clone(), i2 = t3.s < 0 ? t3.negate() : t3.clone();
              if (r3.compareTo(i2) < 0) {
                var n2 = r3;
                r3 = i2, i2 = n2;
              }
              var s2 = r3.getLowestSetBit(), o2 = i2.getLowestSetBit();
              if (o2 < 0) e3(r3);
              else {
                s2 < o2 && (o2 = s2), o2 > 0 && (r3.rShiftTo(o2, r3), i2.rShiftTo(o2, i2));
                var h2 = function() {
                  (s2 = r3.getLowestSetBit()) > 0 && r3.rShiftTo(s2, r3), (s2 = i2.getLowestSetBit()) > 0 && i2.rShiftTo(s2, i2), r3.compareTo(i2) >= 0 ? (r3.subTo(i2, r3), r3.rShiftTo(1, r3)) : (i2.subTo(r3, i2), i2.rShiftTo(1, i2)), r3.signum() > 0 ? setTimeout(h2, 0) : (o2 > 0 && i2.lShiftTo(o2, i2), setTimeout(function() {
                    e3(i2);
                  }, 0));
                };
                setTimeout(h2, 10);
              }
            }, r2.prototype.fromNumberAsync = function(t3, e3, i2, s2) {
              if ("number" == typeof e3) if (t3 < 2) this.fromInt(1);
              else {
                this.fromNumber(t3, i2), this.testBit(t3 - 1) || this.bitwiseTo(r2.ONE.shiftLeft(t3 - 1), n, this), this.isEven() && this.dAddOffset(1, 0);
                var o2 = this, h2 = function() {
                  o2.dAddOffset(2, 0), o2.bitLength() > t3 && o2.subTo(r2.ONE.shiftLeft(t3 - 1), o2), o2.isProbablePrime(e3) ? setTimeout(function() {
                    s2();
                  }, 0) : setTimeout(h2, 0);
                };
                setTimeout(h2, 0);
              }
              else {
                var a2 = [], u2 = 7 & t3;
                a2.length = 1 + (t3 >> 3), e3.nextBytes(a2), u2 > 0 ? a2[0] &= (1 << u2) - 1 : a2[0] = 0, this.fromString(a2, 256);
              }
            }, r2;
          })(), B = (function() {
            function t3() {
            }
            return t3.prototype.convert = function(t4) {
              return t4;
            }, t3.prototype.revert = function(t4) {
              return t4;
            }, t3.prototype.mulTo = function(t4, e3, r2) {
              t4.multiplyTo(e3, r2);
            }, t3.prototype.sqrTo = function(t4, e3) {
              t4.squareTo(e3);
            }, t3;
          })(), O = (function() {
            function t3(t4) {
              this.m = t4;
            }
            return t3.prototype.convert = function(t4) {
              return t4.s < 0 || t4.compareTo(this.m) >= 0 ? t4.mod(this.m) : t4;
            }, t3.prototype.revert = function(t4) {
              return t4;
            }, t3.prototype.reduce = function(t4) {
              t4.divRemTo(this.m, null, t4);
            }, t3.prototype.mulTo = function(t4, e3, r2) {
              t4.multiplyTo(e3, r2), this.reduce(r2);
            }, t3.prototype.sqrTo = function(t4, e3) {
              t4.squareTo(e3), this.reduce(e3);
            }, t3;
          })(), V = (function() {
            function t3(t4) {
              this.m = t4, this.mp = t4.invDigit(), this.mpl = 32767 & this.mp, this.mph = this.mp >> 15, this.um = (1 << t4.DB - 15) - 1, this.mt2 = 2 * t4.t;
            }
            return t3.prototype.convert = function(t4) {
              var e3 = N();
              return t4.abs().dlShiftTo(this.m.t, e3), e3.divRemTo(this.m, null, e3), t4.s < 0 && e3.compareTo(A.ZERO) > 0 && this.m.subTo(e3, e3), e3;
            }, t3.prototype.revert = function(t4) {
              var e3 = N();
              return t4.copyTo(e3), this.reduce(e3), e3;
            }, t3.prototype.reduce = function(t4) {
              for (; t4.t <= this.mt2; ) t4[t4.t++] = 0;
              for (var e3 = 0; e3 < this.m.t; ++e3) {
                var r2 = 32767 & t4[e3], i2 = r2 * this.mpl + ((r2 * this.mph + (t4[e3] >> 15) * this.mpl & this.um) << 15) & t4.DM;
                for (t4[r2 = e3 + this.m.t] += this.m.am(0, i2, t4, e3, 0, this.m.t); t4[r2] >= t4.DV; ) t4[r2] -= t4.DV, t4[++r2]++;
              }
              t4.clamp(), t4.drShiftTo(this.m.t, t4), t4.compareTo(this.m) >= 0 && t4.subTo(this.m, t4);
            }, t3.prototype.mulTo = function(t4, e3, r2) {
              t4.multiplyTo(e3, r2), this.reduce(r2);
            }, t3.prototype.sqrTo = function(t4, e3) {
              t4.squareTo(e3), this.reduce(e3);
            }, t3;
          })(), I = (function() {
            function t3(t4) {
              this.m = t4, this.r2 = N(), this.q3 = N(), A.ONE.dlShiftTo(2 * t4.t, this.r2), this.mu = this.r2.divide(t4);
            }
            return t3.prototype.convert = function(t4) {
              if (t4.s < 0 || t4.t > 2 * this.m.t) return t4.mod(this.m);
              if (t4.compareTo(this.m) < 0) return t4;
              var e3 = N();
              return t4.copyTo(e3), this.reduce(e3), e3;
            }, t3.prototype.revert = function(t4) {
              return t4;
            }, t3.prototype.reduce = function(t4) {
              for (t4.drShiftTo(this.m.t - 1, this.r2), t4.t > this.m.t + 1 && (t4.t = this.m.t + 1, t4.clamp()), this.mu.multiplyUpperTo(this.r2, this.m.t + 1, this.q3), this.m.multiplyLowerTo(this.q3, this.m.t + 1, this.r2); t4.compareTo(this.r2) < 0; ) t4.dAddOffset(1, this.m.t + 1);
              for (t4.subTo(this.r2, t4); t4.compareTo(this.m) >= 0; ) t4.subTo(this.m, t4);
            }, t3.prototype.mulTo = function(t4, e3, r2) {
              t4.multiplyTo(e3, r2), this.reduce(r2);
            }, t3.prototype.sqrTo = function(t4, e3) {
              t4.squareTo(e3), this.reduce(e3);
            }, t3;
          })();
          function N() {
            return new A(null);
          }
          function P(t3, e3) {
            return new A(t3, e3);
          }
          var M = "undefined" != typeof navigator;
          M && "Microsoft Internet Explorer" == navigator.appName ? (A.prototype.am = function(t3, e3, r2, i2, n2, s2) {
            for (var o2 = 32767 & e3, h2 = e3 >> 15; --s2 >= 0; ) {
              var a2 = 32767 & this[t3], u2 = this[t3++] >> 15, c2 = h2 * a2 + u2 * o2;
              n2 = ((a2 = o2 * a2 + ((32767 & c2) << 15) + r2[i2] + (1073741823 & n2)) >>> 30) + (c2 >>> 15) + h2 * u2 + (n2 >>> 30), r2[i2++] = 1073741823 & a2;
            }
            return n2;
          }, S = 30) : M && "Netscape" != navigator.appName ? (A.prototype.am = function(t3, e3, r2, i2, n2, s2) {
            for (; --s2 >= 0; ) {
              var o2 = e3 * this[t3++] + r2[i2] + n2;
              n2 = Math.floor(o2 / 67108864), r2[i2++] = 67108863 & o2;
            }
            return n2;
          }, S = 26) : (A.prototype.am = function(t3, e3, r2, i2, n2, s2) {
            for (var o2 = 16383 & e3, h2 = e3 >> 14; --s2 >= 0; ) {
              var a2 = 16383 & this[t3], u2 = this[t3++] >> 14, c2 = h2 * a2 + u2 * o2;
              n2 = ((a2 = o2 * a2 + ((16383 & c2) << 14) + r2[i2] + n2) >> 28) + (c2 >> 14) + h2 * u2, r2[i2++] = 268435455 & a2;
            }
            return n2;
          }, S = 28), A.prototype.DB = S, A.prototype.DM = (1 << S) - 1, A.prototype.DV = 1 << S;
          A.prototype.FV = Math.pow(2, 52), A.prototype.F1 = 52 - S, A.prototype.F2 = 2 * S - 52;
          var L, j, q = [];
          for (L = "0".charCodeAt(0), j = 0; j <= 9; ++j) q[L++] = j;
          for (L = "a".charCodeAt(0), j = 10; j < 36; ++j) q[L++] = j;
          for (L = "A".charCodeAt(0), j = 10; j < 36; ++j) q[L++] = j;
          function C(t3, e3) {
            var r2 = q[t3.charCodeAt(e3)];
            return null == r2 ? -1 : r2;
          }
          function H(t3) {
            var e3 = N();
            return e3.fromInt(t3), e3;
          }
          function F(t3) {
            var e3, r2 = 1;
            return 0 != (e3 = t3 >>> 16) && (t3 = e3, r2 += 16), 0 != (e3 = t3 >> 8) && (t3 = e3, r2 += 8), 0 != (e3 = t3 >> 4) && (t3 = e3, r2 += 4), 0 != (e3 = t3 >> 2) && (t3 = e3, r2 += 2), 0 != (e3 = t3 >> 1) && (t3 = e3, r2 += 1), r2;
          }
          A.ZERO = H(0), A.ONE = H(1);
          var K = (function() {
            function t3() {
              this.i = 0, this.j = 0, this.S = [];
            }
            return t3.prototype.init = function(t4) {
              var e3, r2, i2;
              for (e3 = 0; e3 < 256; ++e3) this.S[e3] = e3;
              for (r2 = 0, e3 = 0; e3 < 256; ++e3) r2 = r2 + this.S[e3] + t4[e3 % t4.length] & 255, i2 = this.S[e3], this.S[e3] = this.S[r2], this.S[r2] = i2;
              this.i = 0, this.j = 0;
            }, t3.prototype.next = function() {
              var t4;
              return this.i = this.i + 1 & 255, this.j = this.j + this.S[this.i] & 255, t4 = this.S[this.i], this.S[this.i] = this.S[this.j], this.S[this.j] = t4, this.S[t4 + this.S[this.i] & 255];
            }, t3;
          })();
          var U, k, _ = null;
          if (null == _) {
            _ = [], k = 0;
            var z = void 0;
            if ("undefined" != typeof window && self.crypto && self.crypto.getRandomValues) {
              var Z = new Uint32Array(256);
              for (self.crypto.getRandomValues(Z), z = 0; z < Z.length; ++z) _[k++] = 255 & Z[z];
            }
            var G = 0, $ = function(t3) {
              if ((G = G || 0) >= 256 || k >= 256) self.removeEventListener ? self.removeEventListener("mousemove", $, false) : self.detachEvent && self.detachEvent("onmousemove", $);
              else try {
                var e3 = t3.x + t3.y;
                _[k++] = 255 & e3, G += 1;
              } catch (t4) {
              }
            };
            "undefined" != typeof window && (self.addEventListener ? self.addEventListener("mousemove", $, false) : self.attachEvent && self.attachEvent("onmousemove", $));
          }
          function Y() {
            if (null == U) {
              for (U = new K(); k < 256; ) {
                var t3 = Math.floor(65536 * Math.random());
                _[k++] = 255 & t3;
              }
              for (U.init(_), k = 0; k < _.length; ++k) _[k] = 0;
              k = 0;
            }
            return U.next();
          }
          var J = (function() {
            function t3() {
            }
            return t3.prototype.nextBytes = function(t4) {
              for (var e3 = 0; e3 < t4.length; ++e3) t4[e3] = Y();
            }, t3;
          })();
          function X(t3) {
            return (function(t4) {
              for (var e3 = "", r2 = 0; r2 < 32 * t4.length; r2 += 8) e3 += String.fromCharCode(t4[r2 >> 5] >>> 24 - r2 % 32 & 255);
              return e3;
            })((function(t4, e3) {
              var r2, i2, n2, s2, o2, h2, a2, u2, c2, f2, l2, p2, g2 = new Array(1779033703, -1150833019, 1013904242, -1521486534, 1359893119, -1694144372, 528734635, 1541459225), d2 = new Array(64);
              for (t4[e3 >> 5] |= 128 << 24 - e3 % 32, t4[15 + (e3 + 64 >> 9 << 4)] = e3, c2 = 0; c2 < t4.length; c2 += 16) {
                for (r2 = g2[0], i2 = g2[1], n2 = g2[2], s2 = g2[3], o2 = g2[4], h2 = g2[5], a2 = g2[6], u2 = g2[7], f2 = 0; f2 < 64; f2++) d2[f2] = f2 < 16 ? t4[f2 + c2] : at(at(at(ot(d2[f2 - 2]), d2[f2 - 7]), st(d2[f2 - 15])), d2[f2 - 16]), l2 = at(at(at(at(u2, nt(o2)), et(o2, h2, a2)), ht[f2]), d2[f2]), p2 = at(it(r2), rt(r2, i2, n2)), u2 = a2, a2 = h2, h2 = o2, o2 = at(s2, l2), s2 = n2, n2 = i2, i2 = r2, r2 = at(l2, p2);
                g2[0] = at(r2, g2[0]), g2[1] = at(i2, g2[1]), g2[2] = at(n2, g2[2]), g2[3] = at(s2, g2[3]), g2[4] = at(o2, g2[4]), g2[5] = at(h2, g2[5]), g2[6] = at(a2, g2[6]), g2[7] = at(u2, g2[7]);
              }
              return g2;
            })((function(t4) {
              for (var e3 = Array(t4.length >> 2), r2 = 0; r2 < e3.length; r2++) e3[r2] = 0;
              for (r2 = 0; r2 < 8 * t4.length; r2 += 8) e3[r2 >> 5] |= (255 & t4.charCodeAt(r2 / 8)) << 24 - r2 % 32;
              return e3;
            })(t3), 8 * t3.length));
          }
          function Q(t3) {
            for (var e3 = "0123456789abcdef", r2 = "", i2 = 0; i2 < t3.length; i2++) {
              var n2 = t3.charCodeAt(i2);
              r2 += e3.charAt(n2 >>> 4 & 15) + e3.charAt(15 & n2);
            }
            return r2;
          }
          function W(t3, e3) {
            return t3 >>> e3 | t3 << 32 - e3;
          }
          function tt(t3, e3) {
            return t3 >>> e3;
          }
          function et(t3, e3, r2) {
            return t3 & e3 ^ ~t3 & r2;
          }
          function rt(t3, e3, r2) {
            return t3 & e3 ^ t3 & r2 ^ e3 & r2;
          }
          function it(t3) {
            return W(t3, 2) ^ W(t3, 13) ^ W(t3, 22);
          }
          function nt(t3) {
            return W(t3, 6) ^ W(t3, 11) ^ W(t3, 25);
          }
          function st(t3) {
            return W(t3, 7) ^ W(t3, 18) ^ tt(t3, 3);
          }
          function ot(t3) {
            return W(t3, 17) ^ W(t3, 19) ^ tt(t3, 10);
          }
          var ht = new Array(1116352408, 1899447441, -1245643825, -373957723, 961987163, 1508970993, -1841331548, -1424204075, -670586216, 310598401, 607225278, 1426881987, 1925078388, -2132889090, -1680079193, -1046744716, -459576895, -272742522, 264347078, 604807628, 770255983, 1249150122, 1555081692, 1996064986, -1740746414, -1473132947, -1341970488, -1084653625, -958395405, -710438585, 113926993, 338241895, 666307205, 773529912, 1294757372, 1396182291, 1695183700, 1986661051, -2117940946, -1838011259, -1564481375, -1474664885, -1035236496, -949202525, -778901479, -694614492, -200395387, 275423344, 430227734, 506948616, 659060556, 883997877, 958139571, 1322822218, 1537002063, 1747873779, 1955562222, 2024104815, -2067236844, -1933114872, -1866530822, -1538233109, -1090935817, -965641998);
          function at(t3, e3) {
            var r2 = (65535 & t3) + (65535 & e3);
            return (t3 >> 16) + (e3 >> 16) + (r2 >> 16) << 16 | 65535 & r2;
          }
          function ut(t3, e3) {
            if (e3 < t3.length + 11) return console.error("Message too long for RSA"), null;
            for (var r2 = [], i2 = t3.length - 1; i2 >= 0 && e3 > 0; ) {
              var n2 = t3.charCodeAt(i2--);
              n2 < 128 ? r2[--e3] = n2 : n2 > 127 && n2 < 2048 ? (r2[--e3] = 63 & n2 | 128, r2[--e3] = n2 >> 6 | 192) : (r2[--e3] = 63 & n2 | 128, r2[--e3] = n2 >> 6 & 63 | 128, r2[--e3] = n2 >> 12 | 224);
            }
            r2[--e3] = 0;
            for (var s2 = new J(), o2 = []; e3 > 2; ) {
              for (o2[0] = 0; 0 == o2[0]; ) s2.nextBytes(o2);
              r2[--e3] = o2[0];
            }
            return r2[--e3] = 2, r2[--e3] = 0, new A(r2);
          }
          function ct(t3, e3, r2) {
            for (var i2 = "", n2 = 0; i2.length < e3; ) i2 += r2(String.fromCharCode.apply(String, t3.concat([(4278190080 & n2) >> 24, (16711680 & n2) >> 16, (65280 & n2) >> 8, 255 & n2]))), n2 += 1;
            return i2;
          }
          function ft(t3, e3) {
            var r2 = X;
            if (t3.length + 64 + 2 > e3) throw "Message too long for RSA";
            var i2, n2 = "";
            for (i2 = 0; i2 < e3 - t3.length - 64 - 2; i2 += 1) n2 += "\0";
            var s2 = r2("") + n2 + "" + t3, o2 = new Array(32);
            new J().nextBytes(o2);
            var h2 = ct(o2, s2.length, r2), a2 = [];
            for (i2 = 0; i2 < s2.length; i2 += 1) a2[i2] = s2.charCodeAt(i2) ^ h2.charCodeAt(i2);
            var u2 = ct(a2, o2.length, r2), c2 = [0];
            for (i2 = 0; i2 < o2.length; i2 += 1) c2[i2 + 1] = o2[i2] ^ u2.charCodeAt(i2);
            return new A(c2.concat(a2));
          }
          var lt = (function() {
            function t3() {
              this.n = null, this.e = 0, this.d = null, this.p = null, this.q = null, this.dmp1 = null, this.dmq1 = null, this.coeff = null;
            }
            return t3.prototype.doPublic = function(t4) {
              return t4.modPowInt(this.e, this.n);
            }, t3.prototype.doPrivate = function(t4) {
              if (null == this.p || null == this.q) return t4.modPow(this.d, this.n);
              for (var e3 = t4.mod(this.p).modPow(this.dmp1, this.p), r2 = t4.mod(this.q).modPow(this.dmq1, this.q); e3.compareTo(r2) < 0; ) e3 = e3.add(this.p);
              return e3.subtract(r2).multiply(this.coeff).mod(this.p).multiply(this.q).add(r2);
            }, t3.prototype.setPublic = function(t4, e3) {
              null != t4 && null != e3 && t4.length > 0 && e3.length > 0 ? (this.n = P(t4, 16), this.e = parseInt(e3, 16)) : console.error("Invalid RSA public key");
            }, t3.prototype.encrypt = function(t4, e3) {
              void 0 === e3 && (e3 = ut);
              var r2 = this.n.bitLength() + 7 >> 3, i2 = e3(t4, r2);
              if (null == i2) return null;
              var n2 = this.doPublic(i2);
              if (null == n2) return null;
              for (var s2 = n2.toString(16), o2 = s2.length, h2 = 0; h2 < 2 * r2 - o2; h2++) s2 = "0" + s2;
              return s2;
            }, t3.prototype.setPrivate = function(t4, e3, r2) {
              null != t4 && null != e3 && t4.length > 0 && e3.length > 0 ? (this.n = P(t4, 16), this.e = parseInt(e3, 16), this.d = P(r2, 16)) : console.error("Invalid RSA private key");
            }, t3.prototype.setPrivateEx = function(t4, e3, r2, i2, n2, s2, o2, h2) {
              null != t4 && null != e3 && t4.length > 0 && e3.length > 0 ? (this.n = P(t4, 16), this.e = parseInt(e3, 16), this.d = P(r2, 16), this.p = P(i2, 16), this.q = P(n2, 16), this.dmp1 = P(s2, 16), this.dmq1 = P(o2, 16), this.coeff = P(h2, 16)) : console.error("Invalid RSA private key");
            }, t3.prototype.generate = function(t4, e3) {
              var r2 = new J(), i2 = t4 >> 1;
              this.e = parseInt(e3, 16);
              for (var n2 = new A(e3, 16); ; ) {
                for (; this.p = new A(t4 - i2, 1, r2), 0 != this.p.subtract(A.ONE).gcd(n2).compareTo(A.ONE) || !this.p.isProbablePrime(10); ) ;
                for (; this.q = new A(i2, 1, r2), 0 != this.q.subtract(A.ONE).gcd(n2).compareTo(A.ONE) || !this.q.isProbablePrime(10); ) ;
                if (this.p.compareTo(this.q) <= 0) {
                  var s2 = this.p;
                  this.p = this.q, this.q = s2;
                }
                var o2 = this.p.subtract(A.ONE), h2 = this.q.subtract(A.ONE), a2 = o2.multiply(h2);
                if (0 == a2.gcd(n2).compareTo(A.ONE)) {
                  this.n = this.p.multiply(this.q), this.d = n2.modInverse(a2), this.dmp1 = this.d.mod(o2), this.dmq1 = this.d.mod(h2), this.coeff = this.q.modInverse(this.p);
                  break;
                }
              }
            }, t3.prototype.decrypt = function(t4) {
              var e3 = P(t4, 16), r2 = this.doPrivate(e3);
              return null == r2 ? null : (function(t5, e4) {
                var r3 = t5.toByteArray(), i2 = 0;
                for (; i2 < r3.length && 0 == r3[i2]; ) ++i2;
                if (r3.length - i2 != e4 - 1 || 2 != r3[i2]) return null;
                ++i2;
                for (; 0 != r3[i2]; ) if (++i2 >= r3.length) return null;
                var n2 = "";
                for (; ++i2 < r3.length; ) {
                  var s2 = 255 & r3[i2];
                  s2 < 128 ? n2 += String.fromCharCode(s2) : s2 > 191 && s2 < 224 ? (n2 += String.fromCharCode((31 & s2) << 6 | 63 & r3[i2 + 1]), ++i2) : (n2 += String.fromCharCode((15 & s2) << 12 | (63 & r3[i2 + 1]) << 6 | 63 & r3[i2 + 2]), i2 += 2);
                }
                return n2;
              })(r2, this.n.bitLength() + 7 >> 3);
            }, t3.prototype.generateAsync = function(t4, e3, r2) {
              var i2 = new J(), n2 = t4 >> 1;
              this.e = parseInt(e3, 16);
              var s2 = new A(e3, 16), o2 = this, h2 = function() {
                var e4 = function() {
                  if (o2.p.compareTo(o2.q) <= 0) {
                    var t5 = o2.p;
                    o2.p = o2.q, o2.q = t5;
                  }
                  var e5 = o2.p.subtract(A.ONE), i3 = o2.q.subtract(A.ONE), n3 = e5.multiply(i3);
                  0 == n3.gcd(s2).compareTo(A.ONE) ? (o2.n = o2.p.multiply(o2.q), o2.d = s2.modInverse(n3), o2.dmp1 = o2.d.mod(e5), o2.dmq1 = o2.d.mod(i3), o2.coeff = o2.q.modInverse(o2.p), setTimeout(function() {
                    r2();
                  }, 0)) : setTimeout(h2, 0);
                }, a2 = function() {
                  o2.q = N(), o2.q.fromNumberAsync(n2, 1, i2, function() {
                    o2.q.subtract(A.ONE).gcda(s2, function(t5) {
                      0 == t5.compareTo(A.ONE) && o2.q.isProbablePrime(10) ? setTimeout(e4, 0) : setTimeout(a2, 0);
                    });
                  });
                }, u2 = function() {
                  o2.p = N(), o2.p.fromNumberAsync(t4 - n2, 1, i2, function() {
                    o2.p.subtract(A.ONE).gcda(s2, function(t5) {
                      0 == t5.compareTo(A.ONE) && o2.p.isProbablePrime(10) ? setTimeout(a2, 0) : setTimeout(u2, 0);
                    });
                  });
                };
                setTimeout(u2, 0);
              };
              setTimeout(h2, 0);
            }, t3.prototype.sign = function(t4, e3, r2) {
              var i2 = (pt[r2] || "") + e3(t4).toString(), n2 = this.n.bitLength() / 4, s2 = (function(t5, e4) {
                if (e4 < t5.length + 22) return console.error("Message too long for RSA"), null;
                for (var r3 = e4 - t5.length - 6, i3 = "", n3 = 0; n3 < r3; n3 += 2) i3 += "ff";
                return P("0001" + i3 + "00" + t5, 16);
              })(i2, n2);
              if (null == s2) return null;
              var o2 = this.doPrivate(s2);
              if (null == o2) return null;
              for (var h2 = o2.toString(16), a2 = h2.length, u2 = 0; u2 < n2 - a2; u2++) h2 = "0" + h2;
              return h2;
            }, t3.prototype.verify = function(t4, e3, r2) {
              var i2 = P(e3, 16), n2 = this.doPublic(i2);
              return null == n2 ? null : (function(t5) {
                for (var e4 in pt) if (pt.hasOwnProperty(e4)) {
                  var r3 = pt[e4], i3 = r3.length;
                  if (t5.substring(0, i3) == r3) return t5.substring(i3);
                }
                return t5;
              })(n2.toString(16).replace(/^1f+00/, "")) == r2(t4).toString();
            }, t3;
          })();
          var pt = { md2: "3020300c06082a864886f70d020205000410", md5: "3020300c06082a864886f70d020505000410", sha1: "3021300906052b0e03021a05000414", sha224: "302d300d06096086480165030402040500041c", sha256: "3031300d060960864801650304020105000420", sha384: "3041300d060960864801650304020205000430", sha512: "3051300d060960864801650304020305000440", ripemd160: "3021300906052b2403020105000414" };
          function gt(t3, e3, r2) {
            if (!e3 || !t3) throw new Error("extend failed, please check that all dependencies are included.");
            var i2 = function() {
            };
            if (i2.prototype = e3.prototype, t3.prototype = new i2(), t3.prototype.constructor = t3, t3.superclass = e3.prototype, e3.prototype.constructor == Object.prototype.constructor && (e3.prototype.constructor = e3), r2) {
              var n2;
              for (n2 in r2) t3.prototype[n2] = r2[n2];
              var s2 = function() {
              }, o2 = ["toString", "valueOf"];
              try {
                /MSIE/.test(navigator.userAgent) && (s2 = function(t4, e4) {
                  for (n2 = 0; n2 < o2.length; n2 += 1) {
                    var r3 = o2[n2], i3 = e4[r3];
                    "function" == typeof i3 && i3 != Object.prototype[r3] && (t4[r3] = i3);
                  }
                });
              } catch (t4) {
              }
              s2(t3.prototype, r2);
            }
          }
          var dt = {};
          void 0 !== dt.asn1 && dt.asn1 || (dt.asn1 = {}), dt.asn1.ASN1Util = new function() {
            this.integerToByteHex = function(t3) {
              var e3 = t3.toString(16);
              return e3.length % 2 == 1 && (e3 = "0" + e3), e3;
            }, this.bigIntToMinTwosComplementsHex = function(t3) {
              var e3 = t3.toString(16);
              if ("-" != e3.substring(0, 1)) e3.length % 2 == 1 ? e3 = "0" + e3 : e3.match(/^[0-7]/) || (e3 = "00" + e3);
              else {
                var r2 = e3.substring(1).length;
                r2 % 2 == 1 ? r2 += 1 : e3.match(/^[0-7]/) || (r2 += 2);
                for (var i2 = "", n2 = 0; n2 < r2; n2++) i2 += "f";
                e3 = new A(i2, 16).xor(t3).add(A.ONE).toString(16).replace(/^-/, "");
              }
              return e3;
            }, this.getPEMStringFromHex = function(t3, e3) {
              return hextopem(t3, e3);
            }, this.newObject = function(t3) {
              var e3 = dt.asn1, r2 = e3.DERBoolean, i2 = e3.DERInteger, n2 = e3.DERBitString, s2 = e3.DEROctetString, o2 = e3.DERNull, h2 = e3.DERObjectIdentifier, a2 = e3.DEREnumerated, u2 = e3.DERUTF8String, c2 = e3.DERNumericString, f2 = e3.DERPrintableString, l2 = e3.DERTeletexString, p2 = e3.DERIA5String, g2 = e3.DERUTCTime, d2 = e3.DERGeneralizedTime, v2 = e3.DERSequence, y2 = e3.DERSet, m2 = e3.DERTaggedObject, b2 = e3.ASN1Util.newObject, T2 = Object.keys(t3);
              if (1 != T2.length) throw "key of param shall be only one.";
              var S2 = T2[0];
              if (-1 == ":bool:int:bitstr:octstr:null:oid:enum:utf8str:numstr:prnstr:telstr:ia5str:utctime:gentime:seq:set:tag:".indexOf(":" + S2 + ":")) throw "undefined key: " + S2;
              if ("bool" == S2) return new r2(t3[S2]);
              if ("int" == S2) return new i2(t3[S2]);
              if ("bitstr" == S2) return new n2(t3[S2]);
              if ("octstr" == S2) return new s2(t3[S2]);
              if ("null" == S2) return new o2(t3[S2]);
              if ("oid" == S2) return new h2(t3[S2]);
              if ("enum" == S2) return new a2(t3[S2]);
              if ("utf8str" == S2) return new u2(t3[S2]);
              if ("numstr" == S2) return new c2(t3[S2]);
              if ("prnstr" == S2) return new f2(t3[S2]);
              if ("telstr" == S2) return new l2(t3[S2]);
              if ("ia5str" == S2) return new p2(t3[S2]);
              if ("utctime" == S2) return new g2(t3[S2]);
              if ("gentime" == S2) return new d2(t3[S2]);
              if ("seq" == S2) {
                for (var E2 = t3[S2], w2 = [], D2 = 0; D2 < E2.length; D2++) {
                  var x2 = b2(E2[D2]);
                  w2.push(x2);
                }
                return new v2({ array: w2 });
              }
              if ("set" == S2) {
                for (E2 = t3[S2], w2 = [], D2 = 0; D2 < E2.length; D2++) {
                  x2 = b2(E2[D2]);
                  w2.push(x2);
                }
                return new y2({ array: w2 });
              }
              if ("tag" == S2) {
                var R2 = t3[S2];
                if ("[object Array]" === Object.prototype.toString.call(R2) && 3 == R2.length) {
                  var A2 = b2(R2[2]);
                  return new m2({ tag: R2[0], explicit: R2[1], obj: A2 });
                }
                var B2 = {};
                if (void 0 !== R2.explicit && (B2.explicit = R2.explicit), void 0 !== R2.tag && (B2.tag = R2.tag), void 0 === R2.obj) throw "obj shall be specified for 'tag'.";
                return B2.obj = b2(R2.obj), new m2(B2);
              }
            }, this.jsonToASN1HEX = function(t3) {
              return this.newObject(t3).getEncodedHex();
            };
          }(), dt.asn1.ASN1Util.oidHexToInt = function(t3) {
            for (var e3 = "", r2 = parseInt(t3.substring(0, 2), 16), i2 = (e3 = Math.floor(r2 / 40) + "." + r2 % 40, ""), n2 = 2; n2 < t3.length; n2 += 2) {
              var s2 = ("00000000" + parseInt(t3.substring(n2, n2 + 2), 16).toString(2)).slice(-8);
              if (i2 += s2.substring(1, 8), "0" == s2.substring(0, 1)) e3 = e3 + "." + new A(i2, 2).toString(10), i2 = "";
            }
            return e3;
          }, dt.asn1.ASN1Util.oidIntToHex = function(t3) {
            var e3 = function(t4) {
              var e4 = t4.toString(16);
              return 1 == e4.length && (e4 = "0" + e4), e4;
            }, r2 = function(t4) {
              var r3 = "", i3 = new A(t4, 10).toString(2), n3 = 7 - i3.length % 7;
              7 == n3 && (n3 = 0);
              for (var s3 = "", o3 = 0; o3 < n3; o3++) s3 += "0";
              i3 = s3 + i3;
              for (o3 = 0; o3 < i3.length - 1; o3 += 7) {
                var h2 = i3.substring(o3, o3 + 7);
                o3 != i3.length - 7 && (h2 = "1" + h2), r3 += e3(parseInt(h2, 2));
              }
              return r3;
            };
            if (!t3.match(/^[0-9.]+$/)) throw "malformed oid string: " + t3;
            var i2 = "", n2 = t3.split("."), s2 = 40 * parseInt(n2[0]) + parseInt(n2[1]);
            i2 += e3(s2), n2.splice(0, 2);
            for (var o2 = 0; o2 < n2.length; o2++) i2 += r2(n2[o2]);
            return i2;
          }, dt.asn1.ASN1Object = function() {
            this.getLengthHexFromValue = function() {
              if (void 0 === this.hV || null == this.hV) throw "this.hV is null or undefined.";
              if (this.hV.length % 2 == 1) throw "value hex must be even length: n=0,v=" + this.hV;
              var t3 = this.hV.length / 2, e3 = t3.toString(16);
              if (e3.length % 2 == 1 && (e3 = "0" + e3), t3 < 128) return e3;
              var r2 = e3.length / 2;
              if (r2 > 15) throw "ASN.1 length too long to represent by 8x: n = " + t3.toString(16);
              return (128 + r2).toString(16) + e3;
            }, this.getEncodedHex = function() {
              return (null == this.hTLV || this.isModified) && (this.hV = this.getFreshValueHex(), this.hL = this.getLengthHexFromValue(), this.hTLV = this.hT + this.hL + this.hV, this.isModified = false), this.hTLV;
            }, this.getValueHex = function() {
              return this.getEncodedHex(), this.hV;
            }, this.getFreshValueHex = function() {
              return "";
            };
          }, dt.asn1.DERAbstractString = function(t3) {
            dt.asn1.DERAbstractString.superclass.constructor.call(this);
            this.getString = function() {
              return this.s;
            }, this.setString = function(t4) {
              this.hTLV = null, this.isModified = true, this.s = t4, this.hV = stohex(this.s);
            }, this.setStringHex = function(t4) {
              this.hTLV = null, this.isModified = true, this.s = null, this.hV = t4;
            }, this.getFreshValueHex = function() {
              return this.hV;
            }, void 0 !== t3 && ("string" == typeof t3 ? this.setString(t3) : void 0 !== t3.str ? this.setString(t3.str) : void 0 !== t3.hex && this.setStringHex(t3.hex));
          }, gt(dt.asn1.DERAbstractString, dt.asn1.ASN1Object), dt.asn1.DERAbstractTime = function(t3) {
            dt.asn1.DERAbstractTime.superclass.constructor.call(this);
            this.localDateToUTC = function(t4) {
              return utc = t4.getTime() + 6e4 * t4.getTimezoneOffset(), new Date(utc);
            }, this.formatDate = function(t4, e3, r2) {
              var i2 = this.zeroPadding, n2 = this.localDateToUTC(t4), s2 = String(n2.getFullYear());
              "utc" == e3 && (s2 = s2.substring(2, 4));
              var o2 = s2 + i2(String(n2.getMonth() + 1), 2) + i2(String(n2.getDate()), 2) + i2(String(n2.getHours()), 2) + i2(String(n2.getMinutes()), 2) + i2(String(n2.getSeconds()), 2);
              if (true === r2) {
                var h2 = n2.getMilliseconds();
                if (0 != h2) {
                  var a2 = i2(String(h2), 3);
                  o2 = o2 + "." + (a2 = a2.replace(/[0]+$/, ""));
                }
              }
              return o2 + "Z";
            }, this.zeroPadding = function(t4, e3) {
              return t4.length >= e3 ? t4 : new Array(e3 - t4.length + 1).join("0") + t4;
            }, this.getString = function() {
              return this.s;
            }, this.setString = function(t4) {
              this.hTLV = null, this.isModified = true, this.s = t4, this.hV = stohex(t4);
            }, this.setByDateValue = function(t4, e3, r2, i2, n2, s2) {
              var o2 = new Date(Date.UTC(t4, e3 - 1, r2, i2, n2, s2, 0));
              this.setByDate(o2);
            }, this.getFreshValueHex = function() {
              return this.hV;
            };
          }, gt(dt.asn1.DERAbstractTime, dt.asn1.ASN1Object), dt.asn1.DERAbstractStructured = function(t3) {
            dt.asn1.DERAbstractString.superclass.constructor.call(this);
            this.setByASN1ObjectArray = function(t4) {
              this.hTLV = null, this.isModified = true, this.asn1Array = t4;
            }, this.appendASN1Object = function(t4) {
              this.hTLV = null, this.isModified = true, this.asn1Array.push(t4);
            }, this.asn1Array = new Array(), void 0 !== t3 && void 0 !== t3.array && (this.asn1Array = t3.array);
          }, gt(dt.asn1.DERAbstractStructured, dt.asn1.ASN1Object), dt.asn1.DERBoolean = function() {
            dt.asn1.DERBoolean.superclass.constructor.call(this), this.hT = "01", this.hTLV = "0101ff";
          }, gt(dt.asn1.DERBoolean, dt.asn1.ASN1Object), dt.asn1.DERInteger = function(t3) {
            dt.asn1.DERInteger.superclass.constructor.call(this), this.hT = "02", this.setByBigInteger = function(t4) {
              this.hTLV = null, this.isModified = true, this.hV = dt.asn1.ASN1Util.bigIntToMinTwosComplementsHex(t4);
            }, this.setByInteger = function(t4) {
              var e3 = new A(String(t4), 10);
              this.setByBigInteger(e3);
            }, this.setValueHex = function(t4) {
              this.hV = t4;
            }, this.getFreshValueHex = function() {
              return this.hV;
            }, void 0 !== t3 && (void 0 !== t3.bigint ? this.setByBigInteger(t3.bigint) : void 0 !== t3.int ? this.setByInteger(t3.int) : "number" == typeof t3 ? this.setByInteger(t3) : void 0 !== t3.hex && this.setValueHex(t3.hex));
          }, gt(dt.asn1.DERInteger, dt.asn1.ASN1Object), dt.asn1.DERBitString = function(t3) {
            if (void 0 !== t3 && void 0 !== t3.obj) {
              var e3 = dt.asn1.ASN1Util.newObject(t3.obj);
              t3.hex = "00" + e3.getEncodedHex();
            }
            dt.asn1.DERBitString.superclass.constructor.call(this), this.hT = "03", this.setHexValueIncludingUnusedBits = function(t4) {
              this.hTLV = null, this.isModified = true, this.hV = t4;
            }, this.setUnusedBitsAndHexValue = function(t4, e4) {
              if (t4 < 0 || 7 < t4) throw "unused bits shall be from 0 to 7: u = " + t4;
              var r2 = "0" + t4;
              this.hTLV = null, this.isModified = true, this.hV = r2 + e4;
            }, this.setByBinaryString = function(t4) {
              var e4 = 8 - (t4 = t4.replace(/0+$/, "")).length % 8;
              8 == e4 && (e4 = 0);
              for (var r2 = 0; r2 <= e4; r2++) t4 += "0";
              var i2 = "";
              for (r2 = 0; r2 < t4.length - 1; r2 += 8) {
                var n2 = t4.substring(r2, r2 + 8), s2 = parseInt(n2, 2).toString(16);
                1 == s2.length && (s2 = "0" + s2), i2 += s2;
              }
              this.hTLV = null, this.isModified = true, this.hV = "0" + e4 + i2;
            }, this.setByBooleanArray = function(t4) {
              for (var e4 = "", r2 = 0; r2 < t4.length; r2++) 1 == t4[r2] ? e4 += "1" : e4 += "0";
              this.setByBinaryString(e4);
            }, this.newFalseArray = function(t4) {
              for (var e4 = new Array(t4), r2 = 0; r2 < t4; r2++) e4[r2] = false;
              return e4;
            }, this.getFreshValueHex = function() {
              return this.hV;
            }, void 0 !== t3 && ("string" == typeof t3 && t3.toLowerCase().match(/^[0-9a-f]+$/) ? this.setHexValueIncludingUnusedBits(t3) : void 0 !== t3.hex ? this.setHexValueIncludingUnusedBits(t3.hex) : void 0 !== t3.bin ? this.setByBinaryString(t3.bin) : void 0 !== t3.array && this.setByBooleanArray(t3.array));
          }, gt(dt.asn1.DERBitString, dt.asn1.ASN1Object), dt.asn1.DEROctetString = function(t3) {
            if (void 0 !== t3 && void 0 !== t3.obj) {
              var e3 = dt.asn1.ASN1Util.newObject(t3.obj);
              t3.hex = e3.getEncodedHex();
            }
            dt.asn1.DEROctetString.superclass.constructor.call(this, t3), this.hT = "04";
          }, gt(dt.asn1.DEROctetString, dt.asn1.DERAbstractString), dt.asn1.DERNull = function() {
            dt.asn1.DERNull.superclass.constructor.call(this), this.hT = "05", this.hTLV = "0500";
          }, gt(dt.asn1.DERNull, dt.asn1.ASN1Object), dt.asn1.DERObjectIdentifier = function(t3) {
            var e3 = function(t4) {
              var e4 = t4.toString(16);
              return 1 == e4.length && (e4 = "0" + e4), e4;
            }, r2 = function(t4) {
              var r3 = "", i2 = new A(t4, 10).toString(2), n2 = 7 - i2.length % 7;
              7 == n2 && (n2 = 0);
              for (var s2 = "", o2 = 0; o2 < n2; o2++) s2 += "0";
              i2 = s2 + i2;
              for (o2 = 0; o2 < i2.length - 1; o2 += 7) {
                var h2 = i2.substring(o2, o2 + 7);
                o2 != i2.length - 7 && (h2 = "1" + h2), r3 += e3(parseInt(h2, 2));
              }
              return r3;
            };
            dt.asn1.DERObjectIdentifier.superclass.constructor.call(this), this.hT = "06", this.setValueHex = function(t4) {
              this.hTLV = null, this.isModified = true, this.s = null, this.hV = t4;
            }, this.setValueOidString = function(t4) {
              if (!t4.match(/^[0-9.]+$/)) throw "malformed oid string: " + t4;
              var i2 = "", n2 = t4.split("."), s2 = 40 * parseInt(n2[0]) + parseInt(n2[1]);
              i2 += e3(s2), n2.splice(0, 2);
              for (var o2 = 0; o2 < n2.length; o2++) i2 += r2(n2[o2]);
              this.hTLV = null, this.isModified = true, this.s = null, this.hV = i2;
            }, this.setValueName = function(t4) {
              var e4 = dt.asn1.x509.OID.name2oid(t4);
              if ("" === e4) throw "DERObjectIdentifier oidName undefined: " + t4;
              this.setValueOidString(e4);
            }, this.getFreshValueHex = function() {
              return this.hV;
            }, void 0 !== t3 && ("string" == typeof t3 ? t3.match(/^[0-2].[0-9.]+$/) ? this.setValueOidString(t3) : this.setValueName(t3) : void 0 !== t3.oid ? this.setValueOidString(t3.oid) : void 0 !== t3.hex ? this.setValueHex(t3.hex) : void 0 !== t3.name && this.setValueName(t3.name));
          }, gt(dt.asn1.DERObjectIdentifier, dt.asn1.ASN1Object), dt.asn1.DEREnumerated = function(t3) {
            dt.asn1.DEREnumerated.superclass.constructor.call(this), this.hT = "0a", this.setByBigInteger = function(t4) {
              this.hTLV = null, this.isModified = true, this.hV = dt.asn1.ASN1Util.bigIntToMinTwosComplementsHex(t4);
            }, this.setByInteger = function(t4) {
              var e3 = new A(String(t4), 10);
              this.setByBigInteger(e3);
            }, this.setValueHex = function(t4) {
              this.hV = t4;
            }, this.getFreshValueHex = function() {
              return this.hV;
            }, void 0 !== t3 && (void 0 !== t3.int ? this.setByInteger(t3.int) : "number" == typeof t3 ? this.setByInteger(t3) : void 0 !== t3.hex && this.setValueHex(t3.hex));
          }, gt(dt.asn1.DEREnumerated, dt.asn1.ASN1Object), dt.asn1.DERUTF8String = function(t3) {
            dt.asn1.DERUTF8String.superclass.constructor.call(this, t3), this.hT = "0c";
          }, gt(dt.asn1.DERUTF8String, dt.asn1.DERAbstractString), dt.asn1.DERNumericString = function(t3) {
            dt.asn1.DERNumericString.superclass.constructor.call(this, t3), this.hT = "12";
          }, gt(dt.asn1.DERNumericString, dt.asn1.DERAbstractString), dt.asn1.DERPrintableString = function(t3) {
            dt.asn1.DERPrintableString.superclass.constructor.call(this, t3), this.hT = "13";
          }, gt(dt.asn1.DERPrintableString, dt.asn1.DERAbstractString), dt.asn1.DERTeletexString = function(t3) {
            dt.asn1.DERTeletexString.superclass.constructor.call(this, t3), this.hT = "14";
          }, gt(dt.asn1.DERTeletexString, dt.asn1.DERAbstractString), dt.asn1.DERIA5String = function(t3) {
            dt.asn1.DERIA5String.superclass.constructor.call(this, t3), this.hT = "16";
          }, gt(dt.asn1.DERIA5String, dt.asn1.DERAbstractString), dt.asn1.DERUTCTime = function(t3) {
            dt.asn1.DERUTCTime.superclass.constructor.call(this, t3), this.hT = "17", this.setByDate = function(t4) {
              this.hTLV = null, this.isModified = true, this.date = t4, this.s = this.formatDate(this.date, "utc"), this.hV = stohex(this.s);
            }, this.getFreshValueHex = function() {
              return void 0 === this.date && void 0 === this.s && (this.date = /* @__PURE__ */ new Date(), this.s = this.formatDate(this.date, "utc"), this.hV = stohex(this.s)), this.hV;
            }, void 0 !== t3 && (void 0 !== t3.str ? this.setString(t3.str) : "string" == typeof t3 && t3.match(/^[0-9]{12}Z$/) ? this.setString(t3) : void 0 !== t3.hex ? this.setStringHex(t3.hex) : void 0 !== t3.date && this.setByDate(t3.date));
          }, gt(dt.asn1.DERUTCTime, dt.asn1.DERAbstractTime), dt.asn1.DERGeneralizedTime = function(t3) {
            dt.asn1.DERGeneralizedTime.superclass.constructor.call(this, t3), this.hT = "18", this.withMillis = false, this.setByDate = function(t4) {
              this.hTLV = null, this.isModified = true, this.date = t4, this.s = this.formatDate(this.date, "gen", this.withMillis), this.hV = stohex(this.s);
            }, this.getFreshValueHex = function() {
              return void 0 === this.date && void 0 === this.s && (this.date = /* @__PURE__ */ new Date(), this.s = this.formatDate(this.date, "gen", this.withMillis), this.hV = stohex(this.s)), this.hV;
            }, void 0 !== t3 && (void 0 !== t3.str ? this.setString(t3.str) : "string" == typeof t3 && t3.match(/^[0-9]{14}Z$/) ? this.setString(t3) : void 0 !== t3.hex ? this.setStringHex(t3.hex) : void 0 !== t3.date && this.setByDate(t3.date), true === t3.millis && (this.withMillis = true));
          }, gt(dt.asn1.DERGeneralizedTime, dt.asn1.DERAbstractTime), dt.asn1.DERSequence = function(t3) {
            dt.asn1.DERSequence.superclass.constructor.call(this, t3), this.hT = "30", this.getFreshValueHex = function() {
              for (var t4 = "", e3 = 0; e3 < this.asn1Array.length; e3++) {
                t4 += this.asn1Array[e3].getEncodedHex();
              }
              return this.hV = t4, this.hV;
            };
          }, gt(dt.asn1.DERSequence, dt.asn1.DERAbstractStructured), dt.asn1.DERSet = function(t3) {
            dt.asn1.DERSet.superclass.constructor.call(this, t3), this.hT = "31", this.sortFlag = true, this.getFreshValueHex = function() {
              for (var t4 = new Array(), e3 = 0; e3 < this.asn1Array.length; e3++) {
                var r2 = this.asn1Array[e3];
                t4.push(r2.getEncodedHex());
              }
              return 1 == this.sortFlag && t4.sort(), this.hV = t4.join(""), this.hV;
            }, void 0 !== t3 && void 0 !== t3.sortflag && 0 == t3.sortflag && (this.sortFlag = false);
          }, gt(dt.asn1.DERSet, dt.asn1.DERAbstractStructured), dt.asn1.DERTaggedObject = function(t3) {
            dt.asn1.DERTaggedObject.superclass.constructor.call(this), this.hT = "a0", this.hV = "", this.isExplicit = true, this.asn1Object = null, this.setASN1Object = function(t4, e3, r2) {
              this.hT = e3, this.isExplicit = t4, this.asn1Object = r2, this.isExplicit ? (this.hV = this.asn1Object.getEncodedHex(), this.hTLV = null, this.isModified = true) : (this.hV = null, this.hTLV = r2.getEncodedHex(), this.hTLV = this.hTLV.replace(/^../, e3), this.isModified = false);
            }, this.getFreshValueHex = function() {
              return this.hV;
            }, void 0 !== t3 && (void 0 !== t3.tag && (this.hT = t3.tag), void 0 !== t3.explicit && (this.isExplicit = t3.explicit), void 0 !== t3.obj && (this.asn1Object = t3.obj, this.setASN1Object(this.isExplicit, this.hT, this.asn1Object)));
          }, gt(dt.asn1.DERTaggedObject, dt.asn1.ASN1Object);
          var vt, yt, mt = (vt = function(t3, e3) {
            return vt = Object.setPrototypeOf || { __proto__: [] } instanceof Array && function(t4, e4) {
              t4.__proto__ = e4;
            } || function(t4, e4) {
              for (var r2 in e4) Object.prototype.hasOwnProperty.call(e4, r2) && (t4[r2] = e4[r2]);
            }, vt(t3, e3);
          }, function(t3, e3) {
            if ("function" != typeof e3 && null !== e3) throw new TypeError("Class extends value " + String(e3) + " is not a constructor or null");
            function r2() {
              this.constructor = t3;
            }
            vt(t3, e3), t3.prototype = null === e3 ? Object.create(e3) : (r2.prototype = e3.prototype, new r2());
          }), bt = (function(t3) {
            function e3(r2) {
              var i2 = t3.call(this) || this;
              return r2 && ("string" == typeof r2 ? i2.parseKey(r2) : (e3.hasPrivateKeyProperty(r2) || e3.hasPublicKeyProperty(r2)) && i2.parsePropertiesFrom(r2)), i2;
            }
            return mt(e3, t3), e3.prototype.parseKey = function(t4) {
              try {
                var e4 = 0, r2 = 0, i2 = /^\s*(?:[0-9A-Fa-f][0-9A-Fa-f]\s*)+$/.test(t4) ? g(t4) : d.unarmor(t4), n2 = w.decode(i2);
                if (3 === n2.sub.length && (n2 = n2.sub[2].sub[0]), 9 === n2.sub.length) {
                  e4 = n2.sub[1].getHexStringValue(), this.n = P(e4, 16), r2 = n2.sub[2].getHexStringValue(), this.e = parseInt(r2, 16);
                  var s2 = n2.sub[3].getHexStringValue();
                  this.d = P(s2, 16);
                  var o2 = n2.sub[4].getHexStringValue();
                  this.p = P(o2, 16);
                  var h2 = n2.sub[5].getHexStringValue();
                  this.q = P(h2, 16);
                  var a2 = n2.sub[6].getHexStringValue();
                  this.dmp1 = P(a2, 16);
                  var u2 = n2.sub[7].getHexStringValue();
                  this.dmq1 = P(u2, 16);
                  var c2 = n2.sub[8].getHexStringValue();
                  this.coeff = P(c2, 16);
                } else {
                  if (2 !== n2.sub.length) return false;
                  if (n2.sub[0].sub) {
                    var f2 = n2.sub[1].sub[0];
                    e4 = f2.sub[0].getHexStringValue(), this.n = P(e4, 16), r2 = f2.sub[1].getHexStringValue(), this.e = parseInt(r2, 16);
                  } else e4 = n2.sub[0].getHexStringValue(), this.n = P(e4, 16), r2 = n2.sub[1].getHexStringValue(), this.e = parseInt(r2, 16);
                }
                return true;
              } catch (t5) {
                return false;
              }
            }, e3.prototype.getPrivateBaseKey = function() {
              var t4 = { array: [new dt.asn1.DERInteger({ int: 0 }), new dt.asn1.DERInteger({ bigint: this.n }), new dt.asn1.DERInteger({ int: this.e }), new dt.asn1.DERInteger({ bigint: this.d }), new dt.asn1.DERInteger({ bigint: this.p }), new dt.asn1.DERInteger({ bigint: this.q }), new dt.asn1.DERInteger({ bigint: this.dmp1 }), new dt.asn1.DERInteger({ bigint: this.dmq1 }), new dt.asn1.DERInteger({ bigint: this.coeff })] };
              return new dt.asn1.DERSequence(t4).getEncodedHex();
            }, e3.prototype.getPrivateBaseKeyB64 = function() {
              return f(this.getPrivateBaseKey());
            }, e3.prototype.getPublicBaseKey = function() {
              var t4 = new dt.asn1.DERSequence({ array: [new dt.asn1.DERObjectIdentifier({ oid: "1.2.840.113549.1.1.1" }), new dt.asn1.DERNull()] }), e4 = new dt.asn1.DERSequence({ array: [new dt.asn1.DERInteger({ bigint: this.n }), new dt.asn1.DERInteger({ int: this.e })] }), r2 = new dt.asn1.DERBitString({ hex: "00" + e4.getEncodedHex() });
              return new dt.asn1.DERSequence({ array: [t4, r2] }).getEncodedHex();
            }, e3.prototype.getPublicBaseKeyB64 = function() {
              return f(this.getPublicBaseKey());
            }, e3.wordwrap = function(t4, e4) {
              if (!t4) return t4;
              var r2 = "(.{1," + (e4 = e4 || 64) + "})( +|$\n?)|(.{1," + e4 + "})";
              return t4.match(RegExp(r2, "g")).join("\n");
            }, e3.prototype.getPrivateKey = function() {
              var t4 = "-----BEGIN RSA PRIVATE KEY-----\n";
              return t4 += e3.wordwrap(this.getPrivateBaseKeyB64()) + "\n", t4 += "-----END RSA PRIVATE KEY-----";
            }, e3.prototype.getPublicKey = function() {
              var t4 = "-----BEGIN PUBLIC KEY-----\n";
              return t4 += e3.wordwrap(this.getPublicBaseKeyB64()) + "\n", t4 += "-----END PUBLIC KEY-----";
            }, e3.hasPublicKeyProperty = function(t4) {
              return (t4 = t4 || {}).hasOwnProperty("n") && t4.hasOwnProperty("e");
            }, e3.hasPrivateKeyProperty = function(t4) {
              return (t4 = t4 || {}).hasOwnProperty("n") && t4.hasOwnProperty("e") && t4.hasOwnProperty("d") && t4.hasOwnProperty("p") && t4.hasOwnProperty("q") && t4.hasOwnProperty("dmp1") && t4.hasOwnProperty("dmq1") && t4.hasOwnProperty("coeff");
            }, e3.prototype.parsePropertiesFrom = function(t4) {
              this.n = t4.n, this.e = t4.e, t4.hasOwnProperty("d") && (this.d = t4.d, this.p = t4.p, this.q = t4.q, this.dmp1 = t4.dmp1, this.dmq1 = t4.dmq1, this.coeff = t4.coeff);
            }, e3;
          })(lt), Tt = r(606), St = void 0 !== Tt ? null === (yt = Tt.env) || void 0 === yt ? void 0 : "3.5.4" : void 0, Et = (function() {
            function t3(t4) {
              void 0 === t4 && (t4 = {}), this.default_key_size = t4.default_key_size ? parseInt(t4.default_key_size, 10) : 1024, this.default_public_exponent = t4.default_public_exponent || "010001", this.log = t4.log || false, this.key = t4.key || null;
            }
            return t3.prototype.setKey = function(t4) {
              t4 ? (this.log && this.key && console.warn("A key was already set, overriding existing."), this.key = new bt(t4)) : !this.key && this.log && console.error("A key was not set.");
            }, t3.prototype.setPrivateKey = function(t4) {
              this.setKey(t4);
            }, t3.prototype.setPublicKey = function(t4) {
              this.setKey(t4);
            }, t3.prototype.decrypt = function(t4) {
              try {
                return this.getKey().decrypt(l(t4));
              } catch (t5) {
                return false;
              }
            }, t3.prototype.encrypt = function(t4) {
              try {
                return f(this.getKey().encrypt(t4));
              } catch (t5) {
                return false;
              }
            }, t3.prototype.encryptOAEP = function(t4) {
              try {
                return f(this.getKey().encrypt(t4, ft));
              } catch (t5) {
                return false;
              }
            }, t3.prototype.sign = function(t4, e3, r2) {
              void 0 === e3 && (e3 = function(t5) {
                return t5;
              }), void 0 === r2 && (r2 = "");
              try {
                return f(this.getKey().sign(t4, e3, r2));
              } catch (t5) {
                return false;
              }
            }, t3.prototype.signSha256 = function(t4) {
              return this.sign(t4, function(t5) {
                return Q(X(t5));
              }, "sha256");
            }, t3.prototype.verify = function(t4, e3, r2) {
              void 0 === r2 && (r2 = function(t5) {
                return t5;
              });
              try {
                return this.getKey().verify(t4, l(e3), r2);
              } catch (t5) {
                return false;
              }
            }, t3.prototype.verifySha256 = function(t4, e3) {
              return this.verify(t4, e3, function(t5) {
                return Q(X(t5));
              });
            }, t3.prototype.getKey = function(t4) {
              if (!this.key) {
                if (this.key = new bt(), t4 && "[object Function]" === {}.toString.call(t4)) return void this.key.generateAsync(this.default_key_size, this.default_public_exponent, t4);
                this.key.generate(this.default_key_size, this.default_public_exponent);
              }
              return this.key;
            }, t3.prototype.getPrivateKey = function() {
              return this.getKey().getPrivateKey();
            }, t3.prototype.getPrivateKeyB64 = function() {
              return this.getKey().getPrivateBaseKeyB64();
            }, t3.prototype.getPublicKey = function() {
              return this.getKey().getPublicKey();
            }, t3.prototype.getPublicKeyB64 = function() {
              return this.getKey().getPublicBaseKeyB64();
            }, t3.version = St, t3;
          })();
        })(), i = i.default;
      })();
    });
    return module.exports;
  }

  // src/auth/login.js
  var LOGIN_COOKIES = /* @__PURE__ */ new Set([
    "SESSDATA",
    "bili_jct",
    "DedeUserID",
    "DedeUserID__ckMd5",
    "sid",
    "buvid3",
    "buvid4",
    "b_nut"
  ]);
  var LOGIN_PATHS = /* @__PURE__ */ new Set([
    "/x/passport-login/captcha",
    "/x/passport-login/web/key",
    "/x/passport-login/web/login",
    "/x/passport-login/web/sms/send",
    "/x/passport-login/web/login/sms",
    "/x/passport-login/web/qrcode/generate",
    "/x/passport-login/web/qrcode/poll"
  ]);
  function stopLogin() {
    const dispose = runtime.disposeLogin;
    runtime.disposeLogin = null;
    dispose?.();
  }
  function loginContext() {
    const controller = new page.AbortController();
    const timers = /* @__PURE__ */ new Set();
    const cookies = /* @__PURE__ */ Object.create(null);
    for (const entry of document.cookie.split(";")) {
      const pair = /^\s*(buvid3|buvid4|b_nut)=([^;\r\n\x00]*)$/.exec(entry);
      if (pair) cookies[pair[1]] = pair[2];
    }
    return {
      cookies,
      signal: controller.signal,
      delay(action, ms) {
        const timer = setTimeout(() => {
          timers.delete(timer);
          if (!controller.signal.aborted) action();
        }, ms);
        timers.add(timer);
        return timer;
      },
      dispose() {
        controller.abort();
        for (const timer of timers) clearTimeout(timer);
        timers.clear();
      }
    };
  }
  function loginError(code) {
    const messages = {
      "-400": "登录参数有误，请重试",
      "-412": "请求被风控拦截，请稍后重试或使用扫码登录",
      "-629": "账号或密码错误",
      "-662": "请求过于频繁，请稍后重试",
      "-105": "验证未通过，请重试",
      1002: "手机号格式有误",
      1003: "验证码已发送，请稍候",
      1006: "验证码有误或已过期",
      1007: "验证码有误或已过期",
      2400: "验证已过期，请重新获取",
      2406: "人机验证未通过，请重试",
      86203: "短信发送次数已达上限，请稍后重试"
    };
    return new Error(
      messages[code] || `登录请求未完成（${Number.isFinite(Number(code)) ? Number(code) : "响应异常"}）`
    );
  }
  function keepLoginCookie(context, name, value) {
    if (!LOGIN_COOKIES.has(name) || typeof value !== "string" || /[;\r\n\x00]/.test(value)) return;
    if (value) context.cookies[name] = value;
    else delete context.cookies[name];
  }
  function loginRequest(context, path, fields = null, query = {}) {
    const identity = path === "/x/web-interface/nav";
    if (!identity && !LOGIN_PATHS.has(path)) return Promise.reject(new Error("无效的登录接口"));
    const url = new URL(
      path,
      identity ? "https://api.bilibili.com" : "https://passport.bilibili.com"
    );
    url.search = new URLSearchParams(query).toString();
    return new Promise((resolve, reject) => {
      let request, settled = false;
      const finish = (error, result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        context.signal.removeEventListener("abort", abort);
        error ? reject(error) : resolve(result);
      };
      const abort = () => {
        finish(new DOMException("登录已取消", "AbortError"));
        request?.abort();
      };
      const timer = setTimeout(() => {
        finish(new Error("登录请求超时，请重试"));
        request?.abort();
      }, 2e4);
      if (context.signal.aborted) {
        abort();
        return;
      }
      context.signal.addEventListener("abort", abort, { once: true });
      try {
        request = GM_xmlhttpRequest({
          method: fields ? "POST" : "GET",
          url: url.href,
          anonymous: true,
          redirect: "error",
          responseType: "text",
          cookie: Object.entries(context.cookies).map(([name, value]) => `${name}=${value}`).join("; "),
          headers: {
            Accept: "application/json",
            Referer: "https://www.bilibili.com/",
            Origin: "https://www.bilibili.com",
            ...fields ? { "Content-Type": "application/x-www-form-urlencoded" } : {}
          },
          data: fields ? new URLSearchParams(fields).toString() : void 0,
          onload: (response) => {
            if (settled) return;
            try {
              const final = new URL(response.finalUrl || url.href);
              if (final.origin !== url.origin || final.pathname !== url.pathname)
                throw new Error("登录接口发生重定向，请重试");
              if (response.status !== 200) throw new Error(`登录请求失败（HTTP ${response.status}）`);
              const body = JSON.parse(response.responseText || response.response);
              if (body.code !== 0) throw loginError(body.code);
              for (const line of String(response.responseHeaders || "").split(/\r?\n/)) {
                if (!/^set-cookie:/i.test(line)) continue;
                for (const entry of line.replace(/^set-cookie:\s*/i, "").split(/,(?=\s*[A-Za-z0-9_-]+=)/)) {
                  const pair = /^\s*([A-Za-z0-9_-]+)=([^;]*)/.exec(entry);
                  if (pair) keepLoginCookie(context, pair[1], pair[2]);
                }
              }
              if (!body.data || typeof body.data !== "object")
                throw new Error("登录接口返回异常，请重试");
              finish(null, body.data);
            } catch (error) {
              finish(error instanceof SyntaxError ? new Error("登录接口返回异常，请重试") : error);
            }
          },
          onerror: () => finish(new Error("登录请求失败，请检查网络及脚本的 passport.bilibili.com 权限")),
          ontimeout: () => finish(new Error("登录请求超时，请重试")),
          onabort: () => finish(new DOMException("登录已取消", "AbortError"))
        });
      } catch (_) {
        finish(new Error("无法发起登录请求，请检查脚本权限"));
      }
    });
  }
  function loginCookies(context, data) {
    if (typeof data.url === "string" && data.url) {
      let url;
      try {
        url = new URL(data.url);
      } catch (_) {
        throw new Error("登录凭据地址无效");
      }
      if (url.protocol === "https:" && !url.username && !url.password && !url.port && ["passport.biligame.com", "passport.bilibili.com"].includes(url.hostname) && /^\/crossDomain\/?$/.test(url.pathname)) {
        for (const name of LOGIN_COOKIES) {
          let value = url.searchParams.get(name);
          if (name === "SESSDATA" && value?.includes(",")) value = encodeURIComponent(value);
          if (value !== null) keepLoginCookie(context, name, value);
        }
      }
    }
    try {
      return cookiesFrom(context.cookies);
    } catch (_) {
      throw new Error("登录成功但未取得完整凭据，请重新登录或使用 Cookie 导入");
    }
  }
  function showLoginCaptcha(context, data) {
    const gt = data.geetest;
    if (!data.token || !gt?.gt || !gt.challenge || data.type && data.type !== "geetest") {
      return Promise.reject(new Error("当前验证方式暂不支持，请使用扫码登录"));
    }
    return new Promise((resolve, reject) => {
      if (context.signal.aborted) {
        reject(new DOMException("登录已取消", "AbortError"));
        return;
      }
      const token = page.crypto.randomUUID();
      let settled = false;
      const overlay = el("div", null, { class: "captcha-overlay" });
      const header = el("div", null, { class: "captcha-header" });
      const cancel = button("", () => finish(new DOMException("验证已取消", "AbortError")), "close");
      cancel.setAttribute("aria-label", "取消验证");
      cancel.append(icon("close"));
      header.append(el("span", "安全验证"), cancel);
      const frame = el("iframe", null, {
        class: "captcha-frame",
        title: "哔哩哔哩安全验证",
        sandbox: "allow-scripts",
        referrerpolicy: "no-referrer"
      });
      const finish = (error, result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        page.removeEventListener("message", receive);
        context.signal.removeEventListener("abort", abort);
        runtime.dialog.removeEventListener("cancel", cancelDialog);
        overlay.remove();
        if (runtime.dialog.open && !context.signal.aborted)
          runtime.shadow.querySelector(".login-submit")?.focus({ preventScroll: true });
        error ? reject(error) : resolve(result);
      };
      const abort = () => finish(new DOMException("登录已取消", "AbortError"));
      const cancelDialog = (event) => {
        event.preventDefault();
        finish(new DOMException("验证已取消", "AbortError"));
      };
      const receive = (event) => {
        if (event.source !== frame.contentWindow || event.data?.token !== token) return;
        if (event.data.type === "success") {
          const value = event.data.value;
          if (!value || !["geetest_challenge", "geetest_validate", "geetest_seccode"].every(
            (key) => typeof value[key] === "string" && value[key].length > 0 && value[key].length < 2048
          )) {
            finish(new Error("验证结果异常，请重试"));
            return;
          }
          finish(null, {
            token: data.token,
            challenge: value.geetest_challenge,
            validate: value.geetest_validate,
            seccode: value.geetest_seccode
          });
        } else if (event.data.type === "close") abort();
        else if (event.data.type === "error")
          finish(new Error("安全验证加载失败，请重试或使用扫码登录"));
      };
      const timer = setTimeout(() => finish(new Error("安全验证超时，请重试")), 18e4);
      const config = JSON.stringify({
        gt: gt.gt,
        challenge: gt.challenge,
        offline: false,
        new_captcha: true,
        product: "bind",
        https: true,
        protocol: "https://",
        lang: "zh-cn",
        width: "100%"
      }).replace(/</g, "\\u003c");
      frame.srcdoc = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
      html,body{margin:0;width:100%;height:100%;background:#fff;font:14px -apple-system,BlinkMacSystemFont,sans-serif}
      #loading{position:absolute;inset:0;display:grid;place-items:center;color:#86868b}</style></head><body><div id="loading">正在加载验证…</div>
      <script>const send=(type,value)=>parent.postMessage({token:${JSON.stringify(token)},type,value},'*');
      const start=()=>{try{initGeetest(${config},captcha=>{captcha.onReady(()=>{document.getElementById('loading').remove();captcha.verify()});
      captcha.onSuccess(()=>send('success',captcha.getValidate()));captcha.onError(()=>send('error'));captcha.onClose(()=>send('close'))})}catch(e){send('error')}};
      const sdk=document.createElement('script');sdk.src='https://static.geetest.com/static/tools/gt.js';sdk.onload=start;sdk.onerror=()=>send('error');document.head.append(sdk);<\/script></body></html>`;
      page.addEventListener("message", receive);
      context.signal.addEventListener("abort", abort, { once: true });
      runtime.dialog.addEventListener("cancel", cancelDialog);
      overlay.append(header, frame);
      runtime.dialog.append(overlay);
      frame.focus();
    });
  }
  function drawLoginQR(canvas, value) {
    runtime.LoginQR ||= createLoginQR();
    const qr = runtime.LoginQR(0, "M");
    qr.addData(value);
    qr.make();
    const count = qr.getModuleCount();
    const scale = 5;
    const margin = 4;
    canvas.width = canvas.height = (count + margin * 2) * scale;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("无法显示二维码");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#1d1d1f";
    for (let row = 0; row < count; row++)
      for (let col = 0; col < count; col++) {
        if (qr.isDark(row, col))
          context.fillRect((col + margin) * scale, (row + margin) * scale, scale, scale);
      }
  }
  function loginQRData(data) {
    let url = null;
    const raw = typeof data.url === "string" ? data.url.trim() : "";
    if (raw) {
      try {
        url = new URL(raw, "https://passport.bilibili.com/");
      } catch (_) {
      }
    }
    const suppliedKey = typeof data.qrcode_key === "string" ? data.qrcode_key.trim() : "";
    const key = suppliedKey || url?.searchParams.get("qrcode_key") || "";
    if (!/^[A-Za-z0-9_-]{16,256}$/.test(key)) throw new Error("未获取到二维码，请刷新重试");
    const urlKey = url?.searchParams.get("qrcode_key");
    if (url && ["https:", "http:"].includes(url.protocol) && !url.username && !url.password && !url.port && (/(?:^|\.)bilibili\.com$/.test(url.hostname) || url.hostname === "b23.tv") && (!urlKey || urlKey === key))
      return { key, value: url.href };
    const scan = new URL("https://passport.bilibili.com/h5-app/passport/login/scan");
    scan.search = new URLSearchParams({ navhide: "1", qrcode_key: key, from: "main_web" }).toString();
    return { key, value: scan.href };
  }
  function importPanelAccounts(raw, draft) {
    const imported = accountsFrom(raw);
    const incoming = imported.accounts.map((account) => {
      const previous = runtime.state.accounts.find((old) => old.mid === account.mid);
      profileAttempts.delete(account.mid);
      return {
        ...account,
        username: account.username || previous?.username || "",
        face: account.face || previous?.face || "",
        vip: account.vip ?? previous?.vip ?? false
      };
    });
    const mids = new Set(incoming.map((account) => account.mid));
    runtime.state = validateState({
      ...runtime.state,
      accounts: runtime.state.accounts.filter((account) => !mids.has(account.mid)).concat(incoming),
      roles: { ...runtime.state.roles, ...imported.roles }
    });
    runtime.panelDraft = { ...draft, ...imported.roles };
    runtime.panelAddingAccount = false;
    save();
    render();
    notice("账号已导入");
    void refreshAccountProfiles(true);
  }
  function renderLoginForm(content, draft) {
    const context = loginContext();
    const form = el("form", null, {
      class: `card form login-form${runtime.loginMethod === "qrcode" ? " qrcode-form" : ""}`,
      autocomplete: "off"
    });
    const methods = el("div", null, {
      class: "login-tabs",
      role: "tablist",
      "aria-label": "添加账号方式"
    });
    const methodKeys = ["qrcode", "password", "sms"];
    for (const [method, label] of [
      ["qrcode", "二维码"],
      ["password", "密码"],
      ["sms", "验证码"]
    ]) {
      const tab = button(
        label,
        () => {
          runtime.loginMethod = method;
          render();
        },
        "tab"
      );
      for (const [key, value] of Object.entries({
        role: "tab",
        "aria-selected": String(runtime.loginMethod === method),
        tabindex: runtime.loginMethod === method ? "0" : "-1",
        "data-login-method": method,
        "aria-controls": "bilibili-login-fields"
      }))
        tab.setAttribute(key, value);
      tab.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
        event.preventDefault();
        runtime.loginMethod = methodKeys[(methodKeys.indexOf(method) + (event.key === "ArrowRight" ? 1 : methodKeys.length - 1)) % methodKeys.length];
        render();
        runtime.shadow.querySelector(`[data-login-method="${runtime.loginMethod}"]`)?.focus();
      });
      methods.append(tab);
    }
    const fields = el("div", null, {
      class: "login-fields",
      id: "bilibili-login-fields",
      role: "tabpanel"
    });
    const status = el("div", null, {
      class: "login-status",
      role: "status",
      "aria-live": "polite",
      hidden: ""
    });
    const setStatus = (message, error = false) => {
      if (context.signal.aborted) return;
      status.textContent = message;
      status.hidden = !message;
      status.classList.toggle("error", error);
    };
    let busy = false, submitAction = null, cooldownUpdate = null;
    const run = async (action) => {
      if (busy || context.signal.aborted) return;
      busy = true;
      for (const control of form.querySelectorAll(".login-submit,.sms-send,.qr-refresh"))
        control.disabled = true;
      try {
        await action();
      } catch (error) {
        if (!context.signal.aborted)
          setStatus(
            error.name === "AbortError" ? "验证已取消" : error.message || "登录失败，请重试",
            true
          );
      } finally {
        busy = false;
        if (!context.signal.aborted) {
          for (const control of form.querySelectorAll(".login-submit,.sms-send,.qr-refresh"))
            control.disabled = false;
          cooldownUpdate?.();
        }
      }
    };
    const complete = async (data, session = context) => {
      if (data.status !== void 0 && Number(data.status) !== 0)
        throw new Error("本次登录需要额外安全验证，请使用短信或扫码登录");
      const cookies = loginCookies(session, data);
      setStatus("正在添加账号…");
      const identity = await loginRequest(session, "/x/web-interface/nav");
      if (!identity.isLogin || String(identity.mid) !== cookies.DedeUserID)
        throw new Error("账号验证失败，请重新登录");
      if (context.signal.aborted || session.signal.aborted)
        throw new DOMException("登录已取消", "AbortError");
      const account = {
        mid: cookies.DedeUserID,
        name: String(identity.uname || ""),
        cookies,
        username: String(identity.uname || ""),
        face: safeAvatar(identity.face),
        vip: Number(identity.vipStatus ?? identity.vip?.status) === 1
      };
      runtime.state = validateState({
        ...runtime.state,
        accounts: runtime.state.accounts.filter((old) => old.mid !== account.mid).concat(account)
      });
      profileAttempts.set(account.mid, "done");
      save();
      runtime.loginMethod = "qrcode";
      runtime.panelAddingAccount = false;
      render();
      notice("账号已添加");
    };
    const captcha = async () => {
      setStatus("正在准备安全验证…");
      const data = await loginRequest(context, "/x/passport-login/captcha", null, {
        source: "main_web"
      });
      return showLoginCaptcha(context, data);
    };
    const submit = (label) => {
      const control = el("button", label, { type: "submit", class: "action primary login-submit" });
      fields.append(control);
      return control;
    };
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (submitAction) void run(submitAction);
    });
    let disposeQR = null, disposeQRLayout = null;
    runtime.disposeLogin = () => {
      context.dispose();
      disposeQR?.();
      disposeQRLayout?.();
      for (const input of form.querySelectorAll("input,textarea")) input.value = "";
    };
    if (runtime.loginMethod === "password") {
      const username = el("input", null, {
        type: "text",
        placeholder: "手机号 / 邮箱",
        "aria-label": "登录账号",
        autocomplete: "username",
        autocapitalize: "none",
        spellcheck: "false",
        required: "",
        maxlength: "254"
      });
      const password = el("input", null, {
        type: "password",
        placeholder: "密码",
        "aria-label": "登录密码",
        autocomplete: "off",
        required: "",
        maxlength: "256"
      });
      fields.append(username, password);
      submit("登录并添加");
      submitAction = async () => {
        const account = username.value.trim();
        let secret = password.value;
        if (!account || !secret) throw new Error("请输入账号和密码");
        password.value = "";
        try {
          const validation = await captcha();
          setStatus("正在登录…");
          const key = await loginRequest(context, "/x/passport-login/web/key");
          if (typeof key.key !== "string" || !key.key.includes("PUBLIC KEY") || typeof key.hash !== "string")
            throw new Error("无法获取登录密钥");
          runtime.LoginRSA ||= createLoginRSA();
          const crypt = new runtime.LoginRSA();
          crypt.setPublicKey(key.key);
          const encrypted = crypt.encrypt(key.hash + secret);
          secret = "";
          if (!encrypted) throw new Error("密码加密失败，请重新输入");
          const data = await loginRequest(context, "/x/passport-login/web/login", {
            username: account,
            password: encrypted,
            keep: "1",
            source: "main_web",
            go_url: "https://www.bilibili.com/",
            ...validation
          });
          await complete(data);
        } finally {
          secret = "";
          password.value = "";
        }
      };
    } else if (runtime.loginMethod === "sms") {
      const phoneRow = el("div", null, { class: "phone-row" });
      const country = el("input", null, {
        type: "tel",
        class: "country-code",
        value: "+86",
        "aria-label": "国家或地区区号",
        inputmode: "tel",
        maxlength: "5",
        required: ""
      });
      const phone = el("input", null, {
        type: "tel",
        placeholder: "手机号",
        "aria-label": "手机号",
        autocomplete: "tel-national",
        inputmode: "tel",
        required: "",
        maxlength: "20"
      });
      phoneRow.append(country, phone);
      const codeRow = el("div", null, { class: "code-row" });
      const code = el("input", null, {
        type: "text",
        placeholder: "短信验证码",
        "aria-label": "短信验证码",
        inputmode: "numeric",
        autocomplete: "one-time-code",
        maxlength: "8",
        required: ""
      });
      const send = el("button", "获取验证码", { type: "button", class: "sms-send text-button" });
      codeRow.append(code, send);
      fields.append(phoneRow, codeRow);
      submit("登录并添加");
      let ticket = null;
      const phoneValue = () => {
        const cid = country.value.trim().replace(/^\+/, "");
        const tel = phone.value.trim().replace(/[\s-]/g, "");
        if (!/^[1-9]\d{0,3}$/.test(cid) || !/^\d{5,15}$/.test(tel) || cid === "86" && !/^1\d{10}$/.test(tel))
          throw new Error("请输入正确的区号和手机号");
        return { cid, tel };
      };
      cooldownUpdate = () => {
        const seconds = Math.max(0, Math.ceil((runtime.smsCooldownUntil - Date.now()) / 1e3));
        send.textContent = seconds ? `${seconds} 秒后重发` : "获取验证码";
        send.disabled = busy || seconds > 0;
      };
      const tick = () => {
        cooldownUpdate();
        context.delay(tick, 1e3);
      };
      tick();
      for (const input of [country, phone])
        input.addEventListener("input", () => {
          ticket = null;
          code.value = "";
          setStatus("");
        });
      send.addEventListener(
        "click",
        () => void run(async () => {
          if (Date.now() < runtime.smsCooldownUntil) return;
          const target2 = phoneValue();
          ticket = null;
          const validation = await captcha();
          const current = phoneValue();
          if (current.cid !== target2.cid || current.tel !== target2.tel)
            throw new Error("手机号已变更，请重新获取验证码");
          setStatus("正在发送验证码…");
          const data = await loginRequest(context, "/x/passport-login/web/sms/send", {
            ...target2,
            source: "main_web",
            ...validation
          });
          if (typeof data.captcha_key !== "string" || !data.captcha_key)
            throw new Error("验证码发送失败，请重试");
          runtime.smsCooldownUntil = Date.now() + 6e4;
          const latest = phoneValue();
          if (latest.cid !== target2.cid || latest.tel !== target2.tel)
            throw new Error("手机号已变更，请使用原手机号接收的验证码");
          ticket = { ...target2, key: data.captcha_key, expires: Date.now() + 3e5 };
          setStatus("验证码已发送");
          code.focus();
        })
      );
      submitAction = async () => {
        const target2 = phoneValue();
        if (!ticket || ticket.cid !== target2.cid || ticket.tel !== target2.tel || Date.now() >= ticket.expires)
          throw new Error("请先获取短信验证码");
        if (!/^\d{4,8}$/.test(code.value.trim())) throw new Error("请输入正确的短信验证码");
        setStatus("正在登录…");
        const data = await loginRequest(context, "/x/passport-login/web/login/sms", {
          ...target2,
          code: code.value.trim(),
          captcha_key: ticket.key,
          source: "main_web",
          keep: "true",
          go_url: "https://www.bilibili.com/"
        });
        code.value = "";
        await complete(data);
      };
    } else if (runtime.loginMethod === "qrcode") {
      const box = el("div", null, { class: "qr-box" });
      const placeholder = el("div", "正在生成二维码…", { class: "qr-placeholder" });
      const canvas = el("canvas", null, {
        class: "qr-canvas",
        role: "img",
        "aria-label": "哔哩哔哩登录二维码",
        hidden: ""
      });
      box.append(placeholder, canvas);
      fields.append(box);
      const refresh = el("button", "刷新二维码", { type: "button", class: "text-button qr-refresh" });
      fields.append(refresh);
      let layoutFrame = null;
      const fitQRCode = () => {
        layoutFrame = null;
        if (context.signal.aborted || !form.isConnected || !runtime.dialog.open) return;
        const pool = form.closest(".pool-pane");
        const workspace = pool.closest(".workspace");
        const formRect = form.getBoundingClientRect();
        const poolRect = pool.getBoundingClientRect();
        const style = page.getComputedStyle(form);
        const width = form.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        const availableHeight = (page.matchMedia("(min-width:761px)").matches ? pool.clientHeight : workspace.clientHeight) - (formRect.top - poolRect.top + pool.scrollTop);
        const controlsHeight = formRect.height - box.getBoundingClientRect().height;
        const size = Math.max(80, Math.floor(Math.min(width, availableHeight - controlsHeight - 1)));
        if (form.style.getPropertyValue("--login-qr-size") !== size + "px")
          form.style.setProperty("--login-qr-size", size + "px");
      };
      const queueLayout = () => {
        if (layoutFrame === null) layoutFrame = page.requestAnimationFrame(fitQRCode);
      };
      const layoutObserver = new page.ResizeObserver(queueLayout);
      for (const node of [form, methods, status, refresh, content.closest(".pool-pane")])
        layoutObserver.observe(node);
      disposeQRLayout = () => {
        layoutObserver.disconnect();
        if (layoutFrame !== null) page.cancelAnimationFrame(layoutFrame);
      };
      queueLayout();
      const start = async () => {
        disposeQR?.();
        const session = loginContext();
        const abort = () => session.dispose();
        context.signal.addEventListener("abort", abort, { once: true });
        disposeQR = () => {
          context.signal.removeEventListener("abort", abort);
          session.dispose();
        };
        canvas.hidden = true;
        canvas.classList.remove("expired");
        placeholder.hidden = false;
        placeholder.textContent = "正在生成二维码…";
        setStatus("");
        const data = await loginRequest(session, "/x/passport-login/web/qrcode/generate", null, {
          source: "main_web"
        });
        const qr = loginQRData(data);
        drawLoginQR(canvas, qr.value);
        canvas.hidden = false;
        placeholder.hidden = true;
        setStatus("");
        const expires = Date.now() + 18e4;
        const expired = () => {
          canvas.classList.add("expired");
          setStatus("二维码已失效，点击刷新");
        };
        const poll = async () => {
          if (session.signal.aborted) return;
          if (Date.now() >= expires) {
            expired();
            return;
          }
          try {
            const result = await loginRequest(session, "/x/passport-login/web/qrcode/poll", null, {
              qrcode_key: qr.key,
              source: "main_web"
            });
            if (Number(result.code) === 0) {
              await complete(result, session);
              return;
            }
            if (Number(result.code) === 86038) {
              expired();
              return;
            }
            if (Number(result.code) === 86090) setStatus("已扫码，请在手机上确认");
            else if (Number(result.code) === 86101) setStatus("");
            else throw loginError(result.code);
            session.delay(() => void poll(), 3e3);
          } catch (error) {
            if (!context.signal.aborted && !session.signal.aborted) {
              canvas.classList.add("expired");
              setStatus(error.message || "扫码登录失败，请刷新二维码", true);
            }
          }
        };
        session.delay(() => void poll(), 1e3);
      };
      const generate = async () => {
        await run(start);
        if (!context.signal.aborted && canvas.hidden) placeholder.textContent = "点击下方刷新二维码";
      };
      refresh.addEventListener("click", () => void generate());
      queueMicrotask(() => {
        if (!context.signal.aborted && runtime.dialog.open) void generate();
      });
    }
    form.append(methods, fields, status);
    content.append(form);
  }

  // src/ui/panel.css
  var panel_default = ":host {\n  all: initial;\n  color-scheme: light dark;\n  font:\n    14px/1.45 -apple-system,\n    BlinkMacSystemFont,\n    'SF Pro Text',\n    'Segoe UI',\n    'PingFang SC',\n    'Microsoft YaHei',\n    sans-serif;\n  color: var(--text, #1d1d1f);\n}\n* {\n  box-sizing: border-box;\n}\nbutton,\ninput,\ntextarea {\n  font: inherit;\n}\nbutton {\n  cursor: pointer;\n  -webkit-tap-highlight-color: transparent;\n}\nbutton:disabled {\n  opacity: 0.45;\n  cursor: wait;\n}\nbutton:focus-visible,\ninput:focus-visible,\ntextarea:focus-visible,\nsummary:focus-visible {\n  outline: 3px solid #007aff66;\n  outline-offset: 3px;\n}\n.icon {\n  width: 20px;\n  height: 20px;\n  flex: none;\n  display: block;\n}\nbutton {\n  border: 0;\n  color: var(--text);\n  background: transparent;\n}\n.launcher {\n  position: fixed;\n  right: max(20px, env(safe-area-inset-right));\n  bottom: max(20px, env(safe-area-inset-bottom));\n  z-index: 2147483646;\n  display: grid;\n  place-items: center;\n  width: 44px;\n  height: 44px;\n  padding: 0;\n  border: 1px solid #ffffffb3;\n  border-radius: 50%;\n  background: #ffffffdf;\n  color: #26262a;\n  backdrop-filter: blur(24px);\n  box-shadow: 0 4px 24px #00000012;\n}\n.launcher .icon {\n  width: 20px;\n  height: 20px;\n  color: #007aff;\n}\ndialog {\n  --text: #1d1d1f;\n  --secondary: #6e6e76;\n  --card: #ffffff;\n  --line: #0000000b;\n  --field: #f5f5f7;\n  --accent: #007aff;\n  --hover: #00000004;\n  border: 1px solid #ffffffc9;\n  border-radius: 28px;\n  padding: 0;\n  width: min(960px, calc(100vw - 32px));\n  height: min(560px, calc(100dvh - 32px));\n  max-height: calc(100dvh - 32px);\n  overflow: hidden;\n  background: #f5f5f7f5;\n  color: var(--text);\n  box-shadow:\n    0 30px 100px #00000025,\n    0 2px 10px #0000000a;\n  backdrop-filter: blur(40px);\n  -webkit-backdrop-filter: blur(40px);\n}\ndialog::backdrop {\n  background: #11182738;\n  backdrop-filter: blur(7px);\n  -webkit-backdrop-filter: blur(7px);\n}\n.sheet {\n  display: flex;\n  flex-direction: column;\n  height: 100%;\n  min-height: 0;\n}\n.header {\n  flex: none;\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  padding: 27px 28px 21px;\n  gap: 12px;\n}\n.panel-title {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  min-width: 0;\n}\n.panel-title .icon {\n  width: 30px;\n  height: 30px;\n  color: #fb7299;\n}\n.close {\n  flex: none;\n}\nh2 {\n  font-size: 25px;\n  line-height: 1.2;\n  letter-spacing: -0.7px;\n  font-weight: 650;\n  margin: 0;\n}\nh3 {\n  font-size: 12px;\n  font-weight: 500;\n  color: var(--secondary);\n  margin: 22px 0 9px 13px;\n}\n.close {\n  width: 29px;\n  height: 29px;\n  border-radius: 50%;\n  display: grid;\n  place-items: center;\n  background: #e7e7ec;\n  color: #75757b;\n  padding: 0;\n}\n.close .icon {\n  width: 15px;\n  height: 15px;\n  stroke-width: 2.2;\n}\n.tab {\n  padding: 7px 6px;\n  border-radius: 8px;\n  color: #66666d;\n  font-size: 13px;\n  font-weight: 500;\n  transition:\n    background 0.16s,\n    box-shadow 0.16s;\n}\n.tab[aria-selected='true'] {\n  color: var(--text);\n  background: var(--card);\n  box-shadow:\n    0 2px 5px #0000000d,\n    0 0 0 1px #00000003;\n}\n.workspace {\n  flex: 1;\n  display: grid;\n  grid-template-rows: minmax(0, 1fr);\n  grid-template-columns: minmax(260px, 320px) minmax(0, 1fr);\n  gap: 28px;\n  padding: 0 28px;\n  overflow: hidden;\n  min-height: 0;\n}\n.pool-pane,\n.assignment-pane {\n  min-width: 0;\n  min-height: 0;\n}\n.assignment-pane {\n  position: relative;\n  display: flex;\n  flex-direction: column;\n}\n.pool-pane {\n  overflow: auto;\n  overscroll-behavior: contain;\n  scrollbar-width: thin;\n  padding-right: 28px;\n  border-right: 1px solid var(--line);\n}\n.pane-heading {\n  flex: none;\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 10px;\n  flex-wrap: wrap;\n  margin-bottom: 16px;\n  min-height: 44px;\n}\n.pane-heading h3 {\n  margin: 0;\n  font-size: 17px;\n  color: var(--text);\n  font-weight: 600;\n}\n.pool-count {\n  font-size: 12px;\n  color: var(--secondary);\n  font-weight: 400;\n  margin-left: 8px;\n}\n.pool-actions {\n  display: flex;\n  align-items: center;\n  gap: 4px;\n  margin-left: auto;\n}\n.pool-actions .add-account,\n.pool-transfer {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  gap: 4px;\n  min-height: 44px;\n  padding: 8px 6px;\n  border-radius: 10px;\n  color: var(--accent);\n  background: var(--card);\n  font-size: 12px;\n  white-space: nowrap;\n}\n.pool-transfer .icon {\n  width: 15px;\n  height: 15px;\n}\n.pool-transfer:hover,\n.pool-transfer[aria-expanded='true'] {\n  background: var(--field);\n}\n.transfer-option {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  width: 100%;\n  min-height: 44px;\n  padding: 10px 12px;\n  border-radius: 10px;\n  font-size: 13px;\n  text-align: left;\n}\n.transfer-option:hover,\n.transfer-option:focus-visible {\n  background: var(--field);\n}\n.transfer-option .icon {\n  width: 17px;\n  height: 17px;\n  color: var(--accent);\n}\n.add-account {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  gap: 5px;\n  min-height: 44px;\n  padding: 8px 10px;\n  border-radius: 10px;\n  color: var(--accent);\n  background: var(--card);\n  font-size: 13px;\n  white-space: nowrap;\n}\n.add-account .icon {\n  width: 15px;\n  height: 15px;\n}\n.add-account:hover {\n  background: var(--field);\n}\n.content {\n  flex: 1;\n  min-height: 0;\n  display: grid;\n  grid-template-rows: minmax(0, 1fr);\n  gap: 10px;\n}\n.assignment-details {\n  min-height: 0;\n  display: grid;\n  grid-template-rows: minmax(288px, 1fr);\n  gap: 10px;\n  overflow: auto;\n  scrollbar-width: thin;\n  overscroll-behavior: contain;\n}\n.assignments {\n  display: grid;\n  grid-template-rows: repeat(4, minmax(72px, 1fr));\n}\n.assignments .setting-row {\n  min-height: 0;\n  padding: 4px 15px;\n}\n.pool-pane > .card {\n  margin-bottom: 16px;\n}\n.pool-pane .account-row {\n  gap: 10px;\n  padding: 15px 12px;\n}\n.pool-pane .account-row .danger {\n  padding: 8px 4px;\n  font-size: 12px;\n}\n.pool-pane .account-name {\n  font-size: 14px;\n}\n.pool-pane .badges {\n  flex-wrap: wrap;\n  gap: 4px;\n}\n.pool-note {\n  font-size: 12px;\n  line-height: 1.6;\n  color: var(--secondary);\n  margin: 12px 2px 0;\n}\n.pool-pane .form {\n  padding: 12px;\n}\n.pool-pane .login-tabs .tab {\n  padding: 7px 3px;\n  font-size: 12px;\n}\n.pool-pane .qr-box {\n  width: var(--login-qr-size, 192px);\n  height: var(--login-qr-size, 192px);\n  margin: 0 auto;\n}\n.pool-pane .qr-canvas {\n  width: 100%;\n  height: 100%;\n}\n.pool-pane .qrcode-form {\n  gap: 8px;\n  margin: 0;\n}\n.pool-pane .qrcode-form .login-tabs {\n  margin-bottom: 0;\n}\n.pool-pane .qrcode-form .login-fields {\n  gap: 6px;\n}\n.pool-pane .qrcode-form .qr-refresh {\n  margin-top: 0;\n  padding: 5px 10px;\n  min-height: 30px;\n}\n.pool-pane .form-actions {\n  gap: 4px;\n}\n.pool-pane .form-actions .action {\n  padding: 8px 10px;\n}\n.card {\n  background: var(--card);\n  border-radius: 17px;\n  overflow: hidden;\n  box-shadow: 0 0 0 1px #00000002;\n}\n.avatar {\n  width: 42px;\n  height: 42px;\n  flex: none;\n  overflow: hidden;\n  border-radius: 50%;\n  display: grid;\n  place-items: center;\n  background: linear-gradient(145deg, #dceaff, #dfe1f6);\n  color: #627596;\n}\n.avatar img {\n  width: 100%;\n  height: 100%;\n  object-fit: cover;\n}\n.avatar.small {\n  width: 36px;\n  height: 36px;\n}\n.avatar .icon {\n  width: 21px;\n  height: 21px;\n}\n.setting-row {\n  display: flex;\n  align-items: center;\n  gap: 11px;\n  min-height: 61px;\n  padding: 12px 15px;\n  position: relative;\n}\n.setting-row + .setting-row::before {\n  content: '';\n  position: absolute;\n  top: 0;\n  left: 58px;\n  right: 0;\n  height: 1px;\n  background: var(--line);\n}\n.setting-label {\n  font-size: 14px;\n  font-weight: 500;\n  white-space: nowrap;\n}\n.setting-icon {\n  display: grid;\n  place-items: center;\n  width: 31px;\n  height: 31px;\n  border-radius: 9px;\n  flex: none;\n}\n.setting-icon .icon {\n  width: 18px;\n  height: 18px;\n}\n.setting-copy {\n  flex: 1;\n  min-width: 0;\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n}\n.setting-description {\n  font-size: 12px;\n  line-height: 1.5;\n  color: var(--secondary);\n  overflow-wrap: anywhere;\n}\n.assignments .account-picker {\n  flex: 0 1 40%;\n  max-width: 40%;\n}\n.blue {\n  color: #007aff;\n  background: #eaf3ff;\n}\n.green {\n  color: #2baf50;\n  background: #eaf8ee;\n}\n.purple {\n  color: #9258d8;\n  background: #f1eafd;\n}\n.orange {\n  color: #ed9636;\n  background: #fff3e4;\n}\n.account-picker {\n  margin-left: auto;\n  max-width: 64%;\n  min-width: 0;\n  display: flex;\n  align-items: center;\n  justify-content: flex-end;\n  gap: 8px;\n  border-radius: 9px;\n  padding: 7px 0 7px 8px;\n  font-size: 14px;\n  font-weight: 500;\n}\n.picker-name {\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  min-width: 0;\n}\n.account-picker > .icon {\n  width: 15px;\n  height: 15px;\n  color: #b2b2b7;\n  transition: transform 0.16s;\n}\n.account-picker[aria-expanded='true'] > .icon {\n  transform: rotate(180deg);\n}\n.account-picker:hover,\n.account-picker[aria-expanded='true'] {\n  color: var(--accent);\n}\n.account-picker .avatar {\n  width: 24px;\n  height: 24px;\n}\n.account-picker .avatar .icon {\n  width: 15px;\n  height: 15px;\n}\n.account-menu {\n  position: absolute;\n  z-index: 10;\n  width: 244px;\n  padding: 6px;\n  border-radius: 17px;\n  border: 1px solid var(--line);\n  background: var(--card);\n  box-shadow:\n    0 12px 36px #00000020,\n    0 2px 6px #00000008;\n  overflow: auto;\n  overscroll-behavior: contain;\n  scrollbar-width: thin;\n  animation: menu-appear 0.14s ease-out;\n  transform-origin: top right;\n}\n.account-option {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  width: 100%;\n  min-height: 47px;\n  padding: 7px 10px;\n  border-radius: 11px;\n  text-align: left;\n  font-size: 13px;\n}\n.account-option:hover,\n.account-option:focus-visible {\n  background: var(--field);\n  outline: none;\n}\n.account-option[aria-checked='true'] {\n  background: #007aff0d;\n}\n.account-option .avatar {\n  width: 29px;\n  height: 29px;\n}\n.account-option .avatar .icon {\n  width: 16px;\n  height: 16px;\n}\n.account-option > .picker-name {\n  flex: 1;\n}\n.account-option > .icon {\n  width: 17px;\n  height: 17px;\n  color: var(--accent);\n}\n.account-option[aria-checked='false'] > .icon {\n  visibility: hidden;\n}\n@keyframes menu-appear {\n  from {\n    opacity: 0;\n    transform: scale(0.97);\n  }\n  to {\n    opacity: 1;\n    transform: scale(1);\n  }\n}\n.notice-slot {\n  position: absolute;\n  bottom: 76px;\n  left: 28px;\n  right: 28px;\n  pointer-events: none;\n}\n.notice {\n  position: absolute;\n  z-index: 20;\n  left: 50%;\n  bottom: 0;\n  transform: translateX(-50%);\n  width: max-content;\n  max-width: calc(100% - 32px);\n  margin: 0;\n  padding: 10px 16px;\n  border: 1px solid var(--line);\n  border-radius: 14px;\n  background: var(--card);\n  color: var(--text);\n  box-shadow: 0 8px 32px #00000020;\n  font-size: 13px;\n  line-height: 1.6;\n  text-align: center;\n  white-space: pre-wrap;\n  overflow-wrap: anywhere;\n  pointer-events: none;\n  opacity: 1;\n  transition: opacity 0.6s ease;\n}\n.notice.fading {\n  opacity: 0;\n}\n.notice[hidden] {\n  display: none;\n}\n.footer {\n  flex: none;\n  padding: 18px 28px 20px;\n  display: flex;\n  justify-content: flex-end;\n  align-items: center;\n  gap: 9px;\n}\n.action {\n  padding: 9px 18px;\n  border-radius: 10px;\n  font-size: 13px;\n  font-weight: 500;\n  min-height: 36px;\n  background: var(--card);\n  box-shadow:\n    0 0 0 1px #00000006,\n    0 1px 2px #00000005;\n}\n.action:hover {\n  filter: brightness(0.98);\n}\n.primary {\n  background: #007aff;\n  color: #fff;\n  box-shadow: 0 2px 5px #007aff20;\n  min-width: 106px;\n}\n.text-button {\n  color: var(--accent);\n  padding: 7px 10px;\n  font-size: 13px;\n}\n.danger {\n  color: #ff453a;\n}\n.account-row {\n  display: flex;\n  gap: 11px;\n  align-items: center;\n  padding: 13px 14px;\n}\n.account-row + .account-row {\n  border-top: 1px solid var(--line);\n}\n.account-copy {\n  flex: 1;\n  min-width: 0;\n}\n.account-name {\n  display: block;\n  font-weight: 500;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n.badges {\n  display: flex;\n  gap: 6px;\n  margin-top: 4px;\n}\n.badge {\n  font-size: 10px;\n  line-height: 1.5;\n  padding: 1px 5px;\n  border-radius: 4px;\n  background: var(--field);\n  color: var(--secondary);\n}\n.badge.vip {\n  background: #fff0f4;\n  color: #c66b85;\n}\n.badge.login-valid {\n  color: var(--accent);\n  background: var(--field);\n}\n.badge.login-invalid {\n  color: var(--secondary);\n  background: var(--field);\n}\n.form {\n  padding: 14px;\n  display: grid;\n  gap: 10px;\n}\ninput[type='text'],\ninput[type='password'],\ninput[type='tel'],\ntextarea {\n  width: 100%;\n  min-width: 0;\n  border: 1px solid var(--line);\n  border-radius: 10px;\n  background: var(--field);\n  padding: 10px 12px;\n  color: var(--text);\n  font-size: 13px;\n}\ntextarea {\n  resize: vertical;\n  min-height: 102px;\n  max-height: 240px;\n}\n.form-actions {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 8px;\n  flex-wrap: wrap;\n}\n.form-actions .action {\n  padding: 8px 13px;\n}\n.empty {\n  padding: 18px;\n  text-align: center;\n  color: var(--secondary);\n  font-size: 13px;\n}\n.login-tabs {\n  display: grid;\n  grid-template-columns: repeat(3, minmax(0, 1fr));\n  gap: 3px;\n  padding: 3px;\n  border-radius: 11px;\n  background: var(--field);\n  margin-bottom: 5px;\n}\n.login-fields {\n  display: grid;\n  gap: 11px;\n  min-width: 0;\n}\n.login-submit {\n  width: 100%;\n  margin-top: 2px;\n}\n.form-actions .login-submit {\n  width: auto;\n  margin-top: 0;\n}\n.phone-row,\n.code-row {\n  display: flex;\n  align-items: center;\n  gap: 9px;\n  min-width: 0;\n}\n.phone-row .country-code {\n  width: 67px;\n  flex: none;\n  text-align: center;\n  padding: 10px 6px;\n}\n.code-row input {\n  flex: 1;\n}\n.sms-send {\n  flex: none;\n  white-space: nowrap;\n  min-width: 96px;\n  text-align: center;\n  padding: 9px 3px;\n}\n.login-status {\n  font-size: 12px;\n  color: var(--secondary);\n  text-align: center;\n  overflow-wrap: anywhere;\n  padding: 2px 0;\n}\n.login-status.error {\n  color: #ff453a;\n}\n.login-status[hidden] {\n  display: none;\n}\n.qr-box {\n  width: 228px;\n  height: 228px;\n  max-width: 100%;\n  margin: 3px auto 5px;\n  padding: 8px;\n  display: grid;\n  place-items: center;\n  background: #fff;\n  border: 1px solid var(--line);\n  border-radius: 18px;\n  overflow: hidden;\n}\n.qr-canvas {\n  display: block;\n  width: 212px;\n  height: 212px;\n  max-width: 100%;\n  object-fit: contain;\n  image-rendering: pixelated;\n}\n.qr-canvas.expired {\n  filter: blur(3px);\n  opacity: 0.25;\n}\n.qr-placeholder {\n  font-size: 13px;\n  color: #86868b;\n  text-align: center;\n}\n.qr-canvas[hidden],\n.qr-placeholder[hidden] {\n  display: none;\n}\n.qr-refresh {\n  justify-self: center;\n  margin-top: -4px;\n}\n.captcha-overlay {\n  position: absolute;\n  inset: 0;\n  z-index: 30;\n  background: var(--card);\n  display: flex;\n  flex-direction: column;\n  border-radius: inherit;\n  overflow: hidden;\n}\n.captcha-header {\n  padding: 19px 22px;\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 12px;\n  font-size: 16px;\n  font-weight: 600;\n}\n.captcha-frame {\n  width: 100%;\n  flex: 1;\n  min-height: 0;\n  border: 0;\n  background: white;\n}\n.tool-card {\n  position: relative;\n  min-width: 0;\n  border-radius: 14px;\n  background: var(--card);\n  box-shadow: 0 0 0 1px var(--line);\n}\n.tool-card .tool-notice[hidden] {\n  display: none;\n}\n.tool-card .tool-notice {\n  inset: 4px;\n  transform: none;\n  width: auto;\n  max-width: none;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  padding: 8px;\n  font-size: 12px;\n  line-height: 1.5;\n  border: 0;\n  border-radius: 11px;\n  box-shadow: none;\n  overflow: auto;\n  white-space: normal;\n}\n.tool-action {\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  justify-content: center;\n  gap: 8px;\n  width: 100%;\n  height: 100%;\n  min-width: 0;\n  min-height: 80px;\n  padding: 10px 8px;\n  border-radius: 14px;\n  background: transparent;\n  text-align: center;\n  transition: filter 0.16s;\n}\n.pool-refresh {\n  width: fit-content;\n  max-width: 100%;\n  margin: 0 auto;\n}\n.pool-refresh .tool-action {\n  height: auto;\n  flex-direction: row;\n  justify-content: center;\n  gap: 8px;\n  min-height: 44px;\n  padding: 8px 16px;\n}\n.pool-refresh .tool-action .setting-label {\n  font-size: 13px;\n}\n.pool-refresh .setting-icon {\n  width: 28px;\n  height: 28px;\n}\n.tool-action:hover {\n  filter: brightness(0.97);\n}\n.tool-action .setting-label {\n  font-size: 12px;\n  line-height: 1.5;\n  white-space: normal;\n  overflow-wrap: anywhere;\n}\n@media (prefers-color-scheme: dark) {\n  dialog {\n    --text: #f5f5f7;\n    --secondary: #9b9ba3;\n    --card: #343438;\n    --line: #ffffff0c;\n    --field: #29292d;\n    --hover: #ffffff05;\n    --accent: #64a8ff;\n    background: #222226f5;\n    border-color: #ffffff19;\n    box-shadow: 0 30px 100px #0008;\n  }\n  .close {\n    background: #39393e;\n  }\n  .close {\n    color: #aaaab3;\n  }\n  .tab {\n    color: #a8a8af;\n  }\n  .tab[aria-selected='true'] {\n    background: #66666c;\n  }\n  .launcher {\n    color: #f5f5f7;\n    background: #303035e8;\n    border-color: #ffffff18;\n  }\n  .blue {\n    background: #007aff24;\n    color: #68adff;\n  }\n  .green {\n    background: #34c75920;\n    color: #5dd280;\n  }\n  .purple {\n    background: #a274e923;\n    color: #c19afb;\n  }\n  .orange {\n    background: #ef9b3323;\n    color: #ffbd6b;\n  }\n  .avatar {\n    background: linear-gradient(145deg, #36475f, #494358);\n    color: #c5d8f0;\n  }\n  .badge.vip {\n    background: #71344655;\n    color: #efa7bd;\n  }\n}\n@media (max-height: 720px) and (min-width: 761px) {\n  .header {\n    padding: 16px 28px 12px;\n  }\n  .footer {\n    padding: 12px 28px 14px;\n  }\n  .pane-heading {\n    min-height: 36px;\n    margin-bottom: 8px;\n  }\n  .content {\n    gap: 8px;\n    grid-template-rows: minmax(0, 1fr);\n  }\n  .assignment-details {\n    grid-template-rows: minmax(176px, 1fr);\n    gap: 8px;\n  }\n  .tool-action {\n    min-height: 64px;\n    gap: 6px;\n    padding: 6px 8px;\n  }\n  .tool-action .setting-icon {\n    width: 26px;\n    height: 26px;\n  }\n}\n@media (max-width: 760px) {\n  dialog {\n    height: min(760px, calc(100dvh - 32px));\n  }\n  .workspace {\n    display: block;\n    overflow: auto;\n    overscroll-behavior: contain;\n  }\n  .pool-pane {\n    max-height: 260px;\n    margin-bottom: 20px;\n    padding-right: 0;\n    padding-bottom: 20px;\n    border-right: 0;\n    border-bottom: 1px solid var(--line);\n  }\n  .pool-pane.adding-account {\n    max-height: none;\n    overflow: visible;\n  }\n  .pool-pane .form {\n    max-width: 440px;\n    margin: 0 auto;\n  }\n  .assignment-pane {\n    height: auto;\n  }\n  .content {\n    min-height: 0;\n    grid-template-rows: auto;\n  }\n  .assignment-details {\n    grid-template-rows: auto;\n    overflow: visible;\n  }\n  .assignments {\n    grid-template-rows: repeat(4, minmax(80px, auto));\n  }\n}\n@media (max-width: 480px) {\n  .panel-title {\n    font-size: 20px;\n    letter-spacing: 0;\n  }\n  .panel-title .icon {\n    width: 25px;\n    height: 25px;\n  }\n  dialog {\n    border-radius: 23px;\n  }\n  .header {\n    padding: 23px 20px 19px;\n  }\n  .workspace {\n    padding: 0 20px;\n    gap: 20px;\n  }\n  .footer {\n    flex: none;\n    padding: 19px 20px 22px;\n  }\n  .account-picker {\n    max-width: 60%;\n  }\n  .setting-row {\n    padding: 11px 12px;\n  }\n  .setting-label,\n  .account-picker {\n    font-size: 13px;\n  }\n  .setting-icon {\n    width: 28px;\n    height: 28px;\n  }\n  .pane-heading {\n    margin-bottom: 12px;\n  }\n}\n@media (prefers-reduced-motion: reduce) {\n  *,\n  *::after {\n    transition: none !important;\n    animation: none !important;\n  }\n}\n";

  // src/ui/panel.js
  function mount() {
    if (runtime.host || !document.documentElement) return;
    runtime.host = el("div", null, { id: "bilibili-multi-account" });
    runtime.shadow = runtime.host.attachShadow({ mode: "open" });
    const style = el("style", panel_default);
    const launcher = button("", openPanel, "launcher");
    launcher.setAttribute("aria-label", "哔哩哔哩账号管理");
    launcher.title = "哔哩哔哩账号管理";
    launcher.append(icon("bilibili"));
    runtime.dialog = el("dialog", null, { "aria-label": "哔哩哔哩账号管理" });
    runtime.dialog.addEventListener("click", (e) => {
      if (e.target !== runtime.dialog) return;
      const rect = runtime.dialog.getBoundingClientRect();
      if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom)
        runtime.dialog.close();
    });
    runtime.dialog.addEventListener("pointerdown", (e) => {
      if (runtime.accountMenu && !runtime.accountMenu.menu.contains(e.target) && !runtime.accountMenu.trigger.contains(e.target))
        closeAccountMenu();
    });
    runtime.dialog.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && closeAccountMenu(true)) {
        e.preventDefault();
        e.stopPropagation();
      }
    });
    runtime.dialog.addEventListener("close", () => {
      clearNotice();
      closeAccountMenu();
      stopLogin();
    });
    page.addEventListener("resize", () => closeAccountMenu());
    runtime.shadow.append(style, launcher, runtime.dialog);
    document.documentElement.append(runtime.host);
  }
  function openPanel() {
    mount();
    runtime.panelDraft = { ...runtime.state.roles };
    runtime.panelAddingAccount = false;
    render();
    if (!runtime.dialog.open) runtime.dialog.showModal();
    void refreshAccountProfiles(true);
  }
  function render() {
    clearNotice();
    stopLogin();
    closeAccountMenu();
    runtime.dialog.replaceChildren();
    runtime.browserLabels = [];
    runtime.refreshAccountChoices = null;
    if (!runtime.panelDraft) runtime.panelDraft = { ...runtime.state.roles };
    const draft = runtime.panelDraft;
    const sheet = el("div", null, { class: "sheet" });
    const header = el("div", null, { class: "header" });
    const close = button("", () => runtime.dialog.close(), "close");
    close.setAttribute("aria-label", "关闭");
    close.append(icon("close"));
    const title = el("h2", null, { class: "panel-title" });
    title.append(icon("bilibili"), document.createTextNode("哔哩哔哩账号管理"));
    header.append(title, close);
    sheet.append(header);
    const workspace = el("div", null, { class: "workspace" });
    sheet.append(workspace);
    const pool = el("section", null, {
      class: `pool-pane${runtime.panelAddingAccount ? " adding-account" : ""}`,
      "aria-labelledby": "bilibili-pool-title"
    });
    const management = el("section", null, {
      class: "assignment-pane",
      "aria-label": "账号分配管理"
    });
    workspace.append(pool, management);
    workspace.addEventListener("scroll", () => closeAccountMenu(), { passive: true });
    pool.addEventListener("scroll", () => closeAccountMenu(), { passive: true });
    const poolHeader = el("div", null, { class: "pane-heading" });
    const poolTitle = el("h3", runtime.panelAddingAccount ? "添加账号" : "账号池", {
      id: "bilibili-pool-title"
    });
    const entries = runtime.state.accounts.slice();
    if (!entries.some((a) => a.mid === currentBrowserMid())) entries.unshift({ mid: "browser" });
    if (!runtime.panelAddingAccount)
      poolTitle.append(el("span", String(entries.length), { class: "pool-count" }));
    const addAccount = button(
      "",
      () => {
        runtime.panelAddingAccount = !runtime.panelAddingAccount;
        render();
        runtime.shadow.querySelector(
          runtime.panelAddingAccount ? `[data-login-method="${runtime.loginMethod}"]` : ".add-account"
        )?.focus();
      },
      "add-account"
    );
    addAccount.append(
      icon(runtime.panelAddingAccount ? "back" : "plus"),
      document.createTextNode(runtime.panelAddingAccount ? "返回" : "添加账号")
    );
    addAccount.setAttribute("aria-label", runtime.panelAddingAccount ? "返回账号池" : "添加账号");
    addAccount.setAttribute("aria-expanded", String(runtime.panelAddingAccount));
    addAccount.setAttribute("aria-controls", "bilibili-add-account");
    const file = el("input", null, {
      type: "file",
      accept: ".json,.txt,application/json,text/plain",
      "aria-label": "从文件导入",
      hidden: ""
    });
    file.addEventListener("change", async () => {
      try {
        const selected = file.files[0];
        if (!selected) return;
        importPanelAccounts(await selected.text(), runtime.panelDraft || draft);
      } catch (error) {
        notice(error.message || "导入失败");
      } finally {
        file.value = "";
      }
    });
    const exportText = () => JSON.stringify(validateState({ ...runtime.state, roles: { ...draft } }), null, 2);
    const transferButton = (label, symbol, items) => {
      const trigger = button("", () => openTransferMenu(trigger, items), "pool-transfer");
      trigger.setAttribute("aria-haspopup", "menu");
      trigger.setAttribute("aria-expanded", "false");
      trigger.append(icon(symbol), document.createTextNode(label));
      trigger.addEventListener("keydown", (event) => {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          openTransferMenu(trigger, items);
        }
      });
      return trigger;
    };
    const importButton = transferButton("导入", "download", [
      [
        "从剪贴板导入",
        "download",
        async () => {
          let text;
          try {
            text = await page.navigator.clipboard.readText();
          } catch (_) {
            throw new Error("无法读取剪贴板，请使用从文件导入");
          }
          if (!text.trim()) throw new Error("剪贴板为空");
          importPanelAccounts(text, runtime.panelDraft || draft);
        }
      ],
      ["从文件导入", "download", () => file.click()]
    ]);
    const exportButton = transferButton("导出", "upload", [
      [
        "导出到剪贴板",
        "upload",
        async () => {
          try {
            await page.navigator.clipboard.writeText(exportText());
          } catch (_) {
            throw new Error("无法写入剪贴板，请使用导出到文件");
          }
          notice("已导出到剪贴板");
        }
      ],
      [
        "导出到文件",
        "upload",
        () => {
          const url = URL.createObjectURL(new Blob([exportText()], { type: "application/json" }));
          el("a", null, { href: url, download: "bilibili-web-accounts.json" }).click();
          setTimeout(() => URL.revokeObjectURL(url), 1e3);
          notice("已导出到文件");
        }
      ]
    ]);
    const poolActions = el("div", null, { class: "pool-actions" });
    poolActions.append(importButton, exportButton, addAccount);
    poolHeader.append(poolTitle, poolActions, file);
    pool.append(poolHeader);
    const content = el("div", null, {
      class: "content",
      id: "bilibili-panel-content",
      role: "region",
      "aria-label": "账号分配"
    });
    management.append(content);
    const profileUpdaters = [];
    content.addEventListener("scroll", () => closeAccountMenu(), { passive: true });
    const options = () => [
      { mid: "browser" },
      ...runtime.state.accounts.filter((a) => a.mid !== currentBrowserMid()),
      { mid: "0" }
    ];
    const makePicker = (role, title2) => {
      const trigger = el("button", null, {
        type: "button",
        class: "account-picker",
        "aria-haspopup": "menu",
        "aria-expanded": "false",
        "aria-controls": `bilibili-account-menu-${role}`
      });
      let picture = avatar(draft[role], "small");
      const name = el("span", null, { class: "picker-name" });
      trigger.append(picture, name, icon("down"));
      const selectedMid = () => currentBrowserMid() && draft[role] === currentBrowserMid() ? "browser" : draft[role];
      profileUpdaters.push(() => {
        const nextPicture = avatar(draft[role], "small");
        picture.replaceWith(nextPicture);
        picture = nextPicture;
        name.textContent = displayName(draft[role]);
        trigger.setAttribute("aria-label", `${title2}：${name.textContent}`);
        trigger.title = name.textContent;
      });
      const open = (last = false) => {
        closeAccountMenu();
        const menu = el("div", null, {
          class: "account-menu",
          role: "menu",
          id: `bilibili-account-menu-${role}`,
          "aria-label": title2
        });
        const position = () => {
          const bounds = runtime.dialog.getBoundingClientRect();
          const anchor = trigger.getBoundingClientRect();
          const width = runtime.dialog.clientWidth;
          const height = runtime.dialog.clientHeight;
          menu.style.width = `${Math.min(244, Math.max(0, width - 24))}px`;
          const below = height - (anchor.bottom - bounds.top) - 12;
          const above = anchor.top - bounds.top - 12;
          const placeBelow = below >= Math.min(menu.scrollHeight, 240) || below >= above;
          menu.style.maxHeight = `${Math.max(0, Math.min(240, placeBelow ? below : above))}px`;
          const left = anchor.right - bounds.left - runtime.dialog.clientLeft - menu.offsetWidth;
          const top = placeBelow ? anchor.bottom - bounds.top - runtime.dialog.clientTop + 6 : anchor.top - bounds.top - runtime.dialog.clientTop - menu.offsetHeight - 6;
          menu.style.left = `${Math.max(8, Math.min(left, width - menu.offsetWidth - 8))}px`;
          menu.style.top = `${Math.max(8, Math.min(top, height - menu.offsetHeight - 8))}px`;
          menu.style.transformOrigin = placeBelow ? "top right" : "bottom right";
        };
        const update = () => {
          const focusedMid = menu.contains(runtime.shadow.activeElement) ? runtime.shadow.activeElement.dataset.mid : null;
          const scrollTop = menu.scrollTop;
          menu.replaceChildren();
          for (const account of options()) {
            const option = el("button", null, {
              type: "button",
              class: "account-option",
              role: "menuitemradio",
              "aria-checked": String(selectedMid() === account.mid),
              tabindex: "-1",
              "data-mid": account.mid
            });
            option.append(
              avatar(account.mid),
              el("span", displayName(account.mid), { class: "picker-name" }),
              icon("check")
            );
            option.addEventListener("click", () => {
              draft[role] = account.mid;
              closeAccountMenu(true);
              runtime.refreshAccountChoices?.();
            });
            menu.append(option);
          }
          position();
          if (focusedMid !== null)
            [...menu.children].find((option) => option.dataset.mid === focusedMid)?.focus({ preventScroll: true });
          menu.scrollTop = scrollTop;
        };
        menu.addEventListener("keydown", (e) => {
          if (e.key === "Tab") {
            closeAccountMenu(true);
            return;
          }
          if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
          e.preventDefault();
          const items = [...menu.children];
          const current = items.indexOf(runtime.shadow.activeElement);
          const index = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : (current + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
          items[index]?.focus();
        });
        runtime.accountMenu = { menu, trigger, update };
        runtime.dialog.append(menu);
        trigger.setAttribute("aria-expanded", "true");
        update();
        const focused = menu.querySelector("[aria-checked=true]") || (last ? menu.lastElementChild : menu.firstElementChild);
        focused?.focus({ preventScroll: true });
        if (focused)
          menu.scrollTop = Math.max(
            0,
            focused.offsetTop + focused.offsetHeight - menu.clientHeight + 6
          );
      };
      trigger.addEventListener("click", () => {
        if (runtime.accountMenu?.trigger === trigger) closeAccountMenu(true);
        else open();
      });
      trigger.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          open(e.key === "ArrowUp");
        }
      });
      return trigger;
    };
    const addTool = (card, title2, symbol, color, action) => {
      const frame = el("div", null, { class: "tool-card" });
      const feedback = el("div", null, {
        class: "notice tool-notice",
        role: "status",
        "aria-live": "polite",
        "aria-atomic": "true",
        hidden: ""
      });
      const showNotice = (message) => notice(message, feedback);
      const row = button(
        "",
        async () => {
          try {
            await action(showNotice);
          } catch (error) {
            showNotice(error.message || "操作失败");
          }
        },
        "tool-action"
      );
      row.setAttribute("aria-label", title2);
      const tile = el("span", null, { class: `setting-icon ${color}` });
      tile.append(icon(symbol));
      row.append(tile, el("span", title2, { class: "setting-label" }));
      frame.append(row, feedback);
      card.append(frame);
      return row;
    };
    const saveAndReload = () => {
      runtime.state.roles = { ...draft };
      runtime.state.enabled = true;
      save();
      page.location.reload();
    };
    const accounts = el("div", null, { class: "card" });
    for (const account of runtime.panelAddingAccount ? [] : entries) {
      const row = el("div", null, { class: "account-row" });
      let picture = avatar(account.mid, "small");
      const copy = el("div", null, { class: "account-copy" });
      const name = el("span", displayName(account.mid), { class: "account-name" });
      const badges = el("div", null, { class: "badges" });
      copy.append(name, badges);
      const update = () => {
        name.textContent = displayName(account.mid);
        name.title = name.textContent;
        const nextPicture = avatar(account.mid, "small");
        picture.replaceWith(nextPicture);
        picture = nextPicture;
        badges.replaceChildren();
        const isBrowser = account.mid === "browser" || account.mid === currentBrowserMid();
        const loginState = isBrowser ? runtime.browserIdentity.status : profileAttempts.get(account.mid);
        const valid = loginState === "loggedIn" || loginState === "done";
        const invalid = loginState === "loggedOut" || loginState === "failed" || loginState === "error";
        if (valid || invalid)
          badges.append(
            el("span", valid ? "有效" : "失效", {
              class: valid ? "badge login-valid" : "badge login-invalid"
            })
          );
        if (isBrowser) badges.append(el("span", "当前登录", { class: "badge" }));
        const savedAccount = runtime.state.accounts.find((a) => a.mid === account.mid);
        const hasProfile = isBrowser ? runtime.browserIdentity.status === "loggedIn" : Boolean(savedAccount?.username);
        const isVip = isBrowser ? runtime.browserIdentity.vip : savedAccount?.vip;
        badges.append(
          el("span", hasProfile ? isVip ? "大会员" : "非大会员" : "会员状态未读取", {
            class: hasProfile && isVip ? "badge vip" : "badge"
          })
        );
      };
      profileUpdaters.push(update);
      row.append(picture, copy);
      if (account.mid !== "browser") {
        const remove = button(
          "移除",
          () => {
            if (!page.confirm(`移除“${displayName(account.mid)}”保存的账号？`)) return;
            runtime.state.accounts = runtime.state.accounts.filter((a) => a.mid !== account.mid);
            for (const role of Object.keys(ROLES)) {
              if (runtime.state.roles[role] === account.mid) runtime.state.roles[role] = "browser";
              if (draft[role] === account.mid) draft[role] = "browser";
            }
            profileAttempts.delete(account.mid);
            save();
            render();
            notice("账号已移除");
          },
          "text-button danger"
        );
        remove.setAttribute("aria-label", `移除${displayName(account.mid)}`);
        row.append(remove);
      }
      accounts.append(row);
    }
    if (!runtime.panelAddingAccount) {
      pool.append(accounts);
      const refreshArea = el("div", null, { class: "pool-refresh" });
      addTool(refreshArea, "更新账号信息", "refresh", "purple", async (showNotice) => {
        await detectBrowserAccount();
        await refreshAccountProfiles(true);
        runtime.refreshAccountChoices?.();
        showNotice("已更新");
      });
      pool.append(refreshArea);
    }
    const addArea = el("div", null, { id: "bilibili-add-account" });
    addArea.hidden = !runtime.panelAddingAccount;
    pool.append(addArea);
    if (runtime.panelAddingAccount) renderLoginForm(addArea, draft);
    const details = el("div", null, { class: "assignment-details" });
    content.append(details);
    details.addEventListener("scroll", () => closeAccountMenu(), { passive: true });
    const assignments = el("div", null, { class: "card assignments" });
    const symbols = {
      main: ["person", "blue"],
      heartbeat: ["history", "green"],
      recommend: ["sparkle", "purple"],
      video: ["play", "orange"]
    };
    const descriptions = {
      main: "点赞、投币、收藏、关注、发评论等",
      heartbeat: "将观看历史记录到此账号",
      recommend: "根据此账号获取推荐内容",
      video: "使用此账号的权限获取视频流"
    };
    for (const [role, title2] of Object.entries(ROLES)) {
      const row = el("div", null, { class: "setting-row" });
      const tile = el("span", null, { class: `setting-icon ${symbols[role][1]}` });
      tile.append(icon(symbols[role][0]));
      const copy = el("div", null, { class: "setting-copy" });
      const description = el("span", descriptions[role], {
        class: "setting-description",
        id: `bilibili-role-description-${role}`
      });
      copy.append(el("span", title2, { class: "setting-label" }), description);
      const picker = makePicker(role, title2);
      picker.setAttribute("aria-describedby", description.id);
      row.append(tile, copy, picker);
      assignments.append(row);
    }
    details.append(assignments);
    const noticeSlot = el("div", null, { class: "notice-slot" });
    runtime.statusBox = el("div", null, {
      class: "notice",
      role: "status",
      "aria-live": "polite",
      "aria-atomic": "true",
      hidden: ""
    });
    noticeSlot.append(runtime.statusBox);
    sheet.append(noticeSlot);
    const footer = el("div", null, { class: "footer" });
    footer.append(
      button("取消", () => runtime.dialog.close(), "action"),
      button("保存并刷新", saveAndReload, "action primary")
    );
    sheet.append(footer);
    runtime.dialog.append(sheet);
    runtime.refreshAccountChoices = () => {
      for (const update of profileUpdaters) update();
      runtime.accountMenu?.update();
    };
    updateBrowserInfo();
  }

  // src/main.js
  runtime.state = load();
  installAccountSync();
  installPlaybackHooks();
  installNetworkHooks();
  if (page.self === page.top) {
    void detectBrowserAccount();
    GM_registerMenuCommand("哔哩哔哩账号管理", openPanel);
    if (document.documentElement) mount();
    else
      new MutationObserver((_records, observer) => {
        if (document.documentElement) {
          observer.disconnect();
          mount();
        }
      }).observe(document, { childList: true });
  }
})();
