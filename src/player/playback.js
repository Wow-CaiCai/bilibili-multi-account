import {
  runtime,
  page,
  pendingPlayerRefresh,
  playbackBootstraps,
  trustedPlaybackData,
} from '../core/runtime.js';
import { transport } from '../network/transport.js';
import { notice } from '../ui/components.js';

export function separatePlayback() {
  return runtime.state.enabled && runtime.state.roles.video !== 'browser';
}
export function failureDetails(error, route, stage) {
  const clean = (value) =>
    String(value || '')
      .replace(/\?[^\s)"']*/g, '?…')
      .slice(0, 500);
  let path = route?.path || '';
  try {
    if (!path && error?.config?.url) path = new URL(error.config.url, page.location.href).pathname;
  } catch (_) {}
  const info = {
    stage,
    path,
    name: clean(error?.name),
    message: clean(error?.message || error),
    status: error?.response?.status ?? error?.status ?? '',
    code: error?.response?.data?.code ?? '',
    stack: clean(error?.stack),
  };
  console.warn('[Bilibili Multi-Account]', JSON.stringify(info));
  return `${stage}：${info.message || info.name}${path ? `（${path}）` : ''}${info.status ? ` HTTP ${info.status}` : ''}`;
}
export function refreshPlayerAccess(player = page.player) {
  if (!runtime.state.enabled) return Promise.reject(new Error('请先启用脚本并刷新页面'));
  if (!player || typeof player.reloadAccess !== 'function') {
    return Promise.reject(new Error('当前播放器未提供账号同步接口，请完整刷新播放页'));
  }
  if (pendingPlayerRefresh.has(player)) return pendingPlayerRefresh.get(player);
  const mid = runtime.state.roles.video;
  const promise = Promise.resolve()
    .then(() => player.reloadAccess())
    .then(() => {
      const actualMid = player.getUserInfo?.()?.mid;
      if (mid !== 'browser' && String(actualMid || '0') !== mid) {
        throw new Error(
          `播放器仍使用 UID ${actualMid || '0'}，与取流 UID ${mid} 不一致；请重新选择取流账号并刷新页面`,
        );
      }
      return actualMid;
    })
    .catch((error) => {
      const message = failureDetails(error, null, '播放器同步失败');
      throw new Error(message);
    })
    .finally(() => pendingPlayerRefresh.delete(player));
  pendingPlayerRefresh.set(player, promise);
  return promise;
}
export function readAssignedJSON(html, name) {
  // Read a JSON literal, never evaluate code from the fetched page.
  const match = new RegExp(`(?:const|let|var|window\\.)?\\s*${name}\\s*=\\s*`).exec(html);
  if (!match) return null;
  const start = match.index + match[0].length;
  if (html[start] !== '{') return null;
  let depth = 0,
    quoted = false,
    escaped = false;
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
export function playbackBootstrap(episode) {
  const match = /^\/(bangumi\/play)\/(ep|ss)(\d+)/.exec(page.location.pathname);
  if (!match) return Promise.reject(new Error('当前页面不支持番剧预载适配'));
  const path = episode ? `/bangumi/play/ep${episode}` : `/${match[1]}/${match[2]}${match[3]}`;
  const mid = runtime.state.roles.video;
  const account = mid === '0' ? null : runtime.state.accounts.find((a) => a.mid === mid);
  if (mid !== '0' && !account) return Promise.reject(new Error('请先配置有效的取流账号'));
  const key = `${mid}:${path}`;
  const cached = playbackBootstraps.get(key);
  if (cached && Date.now() - cached.time < 30000) return cached.promise;
  const route = {
    url: new URL(`https://www.bilibili.com${path}`),
    path,
    role: 'video',
    mid,
    account,
  };
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
  })().catch((error) => {
    playbackBootstraps.delete(key);
    notice(error.message);
    throw error;
  });
  playbackBootstraps.set(key, { time: Date.now(), promise });
  return promise;
}
export function installPlaybackHooks() {
  // UGC and legacy player bootstraps must not consume the browser account's
  // embedded stream response when a separate video account is selected.
  for (const name of ['__playinfo__', '__PLAYURL_HYDRATE_DATA__']) {
    const descriptor = Object.getOwnPropertyDescriptor(page, name);
    if (descriptor && (!descriptor.configurable || descriptor.get || descriptor.set)) continue;
    let value = descriptor?.value;
    try {
      Object.defineProperty(page, name, {
        configurable: true,
        enumerable: true,
        get() {
          return separatePlayback() && (!value || !trustedPlaybackData.has(value))
            ? undefined
            : value;
        },
        set(next) {
          value = next;
        },
      });
    } catch (_) {
      /* Unsupported page-global descriptors are left in place. */
    }
  }
  const wrapped = new WeakMap();
  function wrapNano(nano) {
    if (!nano || typeof nano !== 'object') return nano;
    if (wrapped.has(nano)) return wrapped.get(nano);
    const factories = new WeakMap();
    const proxy = new Proxy(nano, {
      get(object, key, receiver) {
        const value = Reflect.get(object, key, receiver);
        if (key !== 'createPlayer' || typeof value !== 'function') return value;
        if (!factories.has(value))
          factories.set(value, function (config, ...rest) {
            if (!separatePlayback() || !config)
              return Reflect.apply(value, object, [config, ...rest]);
            const next = { ...config };
            if (next.prefetch) {
              next.prefetch = { ...next.prefetch };
              delete next.prefetch.playUrl;
            }
            const callback = config.requestConfig?.reqHttpPlayUrlInfo;
            // The current official OGV page supplies an inline callback that only
            // returns playurlSSRData. Replace that specific SSR-only callback;
            // later real API request callbacks keep using our fetch/XHR routing.
            if (
              typeof callback === 'function' &&
              Function.prototype.toString.call(callback).includes('playurlSSRData')
            ) {
              next.requestConfig = {
                ...config.requestConfig,
                reqHttpPlayUrlInfo: (params) =>
                  playbackBootstrap(params?.ep_id || config.episodeId),
              };
            }
            // Initial player-info and playurl requests already use the video
            // account through fetch/XHR routing. reloadAccess() also replaces the
            // media source, so calling it on Player_Initialized interrupts the
            // first seconds of playback. Keep it as an explicit recovery action.
            return Reflect.apply(value, object, [next, ...rest]);
          });
        return factories.get(value);
      },
    });
    wrapped.set(nano, proxy);
    wrapped.set(proxy, proxy);
    return proxy;
  }
  const descriptor = Object.getOwnPropertyDescriptor(page, 'nano');
  if (!descriptor || (descriptor.configurable && !descriptor.get && !descriptor.set)) {
    let nano = wrapNano(descriptor?.value);
    try {
      Object.defineProperty(page, 'nano', {
        configurable: true,
        enumerable: true,
        get: () => nano,
        set: (value) => {
          nano = wrapNano(value);
        },
      });
    } catch (_) {
      /* Page compatibility. */
    }
  }
  if (separatePlayback() && /^\/bangumi\/play\/(ep|ss)\d+/.test(page.location.pathname)) {
    void playbackBootstrap().catch(() => {});
  }
}
