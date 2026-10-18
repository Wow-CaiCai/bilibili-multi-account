import { page, PLAYER_INFO, runtime, nativeFetch } from '../core/runtime.js';
import { REPORTS, HOSTS } from '../core/config.js';
import { prepareRoute } from './signing.js';
import { replaceCSRF } from './routing.js';

export function transport(route, options = {}) {
  const requests = [];
  const controller = new page.AbortController();
  let cancelled = false,
    timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    abort();
  }, options.timeout || 30000);
  const abort = () => {
    cancelled = true;
    controller.abort();
    for (const task of requests) task.abort();
  };
  const promise = (async () => {
    const prepared = await prepareRoute(route);
    if (cancelled) throw new DOMException('请求已取消', 'AbortError');
    const task = rawTransport(prepared, options);
    requests.push(task);
    const result = await task.promise;
    // Player permission / subtitle metadata comes from the video account;
    // keep resume position attached to the heartbeat account.
    if (
      PLAYER_INFO.has(route.path) &&
      runtime.state.roles.heartbeat !== route.mid &&
      result.status === 200
    ) {
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
        if (mid === 'browser') {
          const r = await nativeFetch.call(page, route.url.href, {
            method: 'GET',
            credentials: 'include',
            signal: controller.signal,
          });
          const value = await r.json();
          if (r.ok && value.code === 0) progress = value.data;
        } else if (mid !== '0') {
          const account = runtime.state.accounts.find((a) => a.mid === mid);
          if (account) {
            const r = rawTransport(
              await prepareRoute({ ...route, role: 'heartbeat', mid, account }),
              options,
            );
            if (cancelled) {
              r.abort();
              throw new DOMException('请求已取消', 'AbortError');
            }
            requests.push(r);
            const response = await r.promise;
            const value = JSON.parse(new TextDecoder().decode(response.response));
            if (value.code === 0) progress = value.data;
          }
        }
      } catch (_) {
        /* Don't substitute the video account's private resume position. */
      }
      payload.data.last_play_time = progress?.last_play_time || 0;
      payload.data.last_play_cid = progress?.last_play_cid || 0;
      // Tampermonkey exposes response through a getter-only property. Never
      // mutate its callback result when combining another account's progress.
      if (cancelled) throw new DOMException('请求已取消', 'AbortError');
      return { ...result, response: new TextEncoder().encode(JSON.stringify(payload)).buffer };
    }
    if (cancelled) throw new DOMException('请求已取消', 'AbortError');
    return result;
  })()
    .catch((error) => {
      if (timedOut) throw new DOMException('请求超时', 'TimeoutError');
      throw error;
    })
    .finally(() => clearTimeout(timer));
  return { promise, abort };
}
// Always omit the browser jar. Explicit cookie + anonymous is intentional:
// credentials must never fall back to the currently logged-in website account.
export function rawTransport(route, options = {}) {
  let cancel;
  const promise = new Promise((resolve, reject) => {
    if (!route.account && REPORTS.has(route.path)) {
      resolve({
        status: 200,
        statusText: 'OK',
        responseHeaders: 'Content-Type: application/json\r\n',
        response: new TextEncoder().encode('{"code":0,"message":"0","data":null}').buffer,
        finalUrl: route.url.href,
      });
      return;
    }
    const headers = new Headers(options.headers || {});
    const csrf = route.account?.cookies.bili_jct || '';
    const data = replaceCSRF(options.body, headers, csrf);
    const url = new URL(route.url.href);
    const outgoing = {};
    for (const [k, v] of headers) {
      if (
        !/^(?:cookie|host|origin|referer|authorization|proxy-authorization|content-length|user-agent|sec-.+|x-bili-.+)$/i.test(
          k,
        )
      ) {
        outgoing[k] = /^(?:x-csrf-token|x-csrf)$/i.test(k) ? csrf : v;
      }
    }
    outgoing.Referer = page.location.href.split('#')[0];
    const cookie = route.account
      ? Object.entries(route.account.cookies)
          .filter(([k]) => !/^bili_ticket/.test(k))
          .map(([k, v]) => `${k}=${v}`)
          .join('; ')
      : '';
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
        try {
          finalUrl = new URL(value.finalUrl || url.href);
        } catch (_) {
          reject(new TypeError('接口返回无效地址'));
          return;
        }
        if (finalUrl.protocol !== 'https:' || !HOSTS.has(finalUrl.hostname)) {
          reject(new TypeError('拒绝非 B 站接口的重定向'));
          return;
        }
        resolve(value);
      } else {
        reject(value);
      }
    };
    try {
      handle = GM_xmlhttpRequest({
        method: options.method || 'GET',
        url: url.href,
        headers: outgoing,
        data,
        anonymous: true,
        cookie,
        redirect: 'error',
        responseType: 'arraybuffer',
        onload: (r) => finish(true, r),
        onerror: () => finish(false, new TypeError('多账号请求失败，请检查脚本权限或网络')),
        ontimeout: () => finish(false, new DOMException('请求超时', 'TimeoutError')),
        onabort: () => finish(false, new DOMException('请求已取消', 'AbortError')),
      });
    } catch (error) {
      finish(false, error);
    }
    cancel = () => {
      finish(false, new DOMException('请求已取消', 'AbortError'));
      handle?.abort();
    };
  });
  return { promise, abort: () => cancel?.() };
}
export function responseHeaders(raw) {
  const headers = new Headers();
  for (const line of (raw || '').split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i < 1) continue;
    const name = line.slice(0, i).trim();
    // Body is already decoded by Chrome; don't expose a false compression / length.
    if (/^(?:set-cookie2?|content-encoding|content-length|transfer-encoding)$/i.test(name))
      continue;
    try {
      headers.append(name, line.slice(i + 1).trim());
    } catch (_) {
      /* Ignore invalid fields. */
    }
  }
  return headers;
}
