import { runtime, profileAttempts, page, nativeFetch } from '../core/runtime.js';
import { verify } from './verify.js';
import { save } from './store.js';

export function currentBrowserMid() {
  if (runtime.browserIdentity.status === 'loggedOut') return '';
  return (
    runtime.browserIdentity.mid ||
    /(?:^|;\s*)DedeUserID=(\d+)(?:;|$)/.exec(document.cookie)?.[1] ||
    ''
  );
}
export function browserLabel() {
  if (runtime.browserIdentity.name) return runtime.browserIdentity.name;
  if (runtime.browserIdentity.status === 'loading') return '读取中…';
  if (runtime.browserIdentity.status === 'loggedOut') return '未登录';
  return '浏览器账号';
}
export function safeAvatar(value) {
  try {
    const url = new URL(String(value || '').replace(/^\/\//, 'https://'));
    return url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      /(?:^|\.)(?:hdslb|biliimg)\.com$/.test(url.hostname)
      ? url.href
      : '';
  } catch (_) {
    return '';
  }
}
export function displayName(mid) {
  if (mid === '0') return '匿名';
  if (mid === 'browser' || mid === currentBrowserMid()) return browserLabel();
  const account = runtime.state.accounts.find((a) => a.mid === mid);
  if (account?.username) return account.username;
  if (account?.name && !/^\d+$/.test(account.name)) return account.name;
  return profileAttempts.get(mid) === 'failed' ? '未命名账号' : '读取中…';
}
export function accountFace(mid) {
  return mid === 'browser' || mid === currentBrowserMid()
    ? safeAvatar(runtime.browserIdentity.face)
    : runtime.state.accounts.find((a) => a.mid === mid)?.face || '';
}
export function saveProfile(mid, data) {
  const account = runtime.state.accounts.find((a) => a.mid === mid);
  if (!account) return;
  account.username = String(data.uname || '').slice(0, 80);
  account.face = safeAvatar(data.face);
  account.vip = Number(data.vipStatus ?? data.vip?.status) === 1;
}
export function refreshAccountProfiles(force = false) {
  if (runtime.profileRefreshPromise) return runtime.profileRefreshPromise;
  const work = runtime.state.accounts.filter(
    (a) => force || (!a.username && !profileAttempts.has(a.mid)),
  );
  runtime.profileRefreshPromise = Promise.allSettled(
    work.map(async (account) => {
      profileAttempts.set(account.mid, 'loading');
      try {
        const data =
          account.mid === currentBrowserMid() && runtime.browserIdentity.status === 'loggedIn'
            ? {
                uname: runtime.browserIdentity.name,
                face: runtime.browserIdentity.face,
                vipStatus: runtime.browserIdentity.vip ? 1 : 0,
              }
            : await verify(account);
        const current = runtime.state.accounts.find((a) => a.mid === account.mid);
        if (current && current.cookies.SESSDATA === account.cookies.SESSDATA)
          saveProfile(account.mid, data);
        profileAttempts.set(account.mid, 'done');
      } catch (_) {
        profileAttempts.set(account.mid, 'failed');
      } finally {
        runtime.refreshAccountChoices?.();
      }
    }),
  )
    .then(() => {
      if (work.length) save();
      runtime.refreshAccountChoices?.();
    })
    .finally(() => {
      runtime.profileRefreshPromise = null;
    });
  return runtime.profileRefreshPromise;
}
export function updateBrowserInfo() {
  runtime.refreshAccountChoices?.();
  for (const node of runtime.browserLabels) node.textContent = browserLabel();
}
export function detectBrowserAccount() {
  if (runtime.browserReadPromise) return runtime.browserReadPromise;
  runtime.browserIdentity = {
    status: 'loading',
    mid: currentBrowserMid(),
    name: runtime.browserIdentity.name,
  };
  updateBrowserInfo();
  runtime.browserReadPromise = (async () => {
    // Use the captured native fetch, never the per-role account transport.
    // This reads the real browser session even when another main account is selected.
    const controller = new page.AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await nativeFetch.call(
        page,
        'https://api.bilibili.com/x/web-interface/nav',
        { credentials: 'include', cache: 'no-store', signal: controller.signal },
      );
      if (!response.ok) throw new Error('浏览器账号识别失败');
      const data = await response.json();
      if (data.code === -101 || (data.code === 0 && data.data?.isLogin === false)) {
        runtime.browserIdentity = { status: 'loggedOut', mid: '', name: '' };
      } else if (data.code === 0 && data.data?.isLogin && /^\d+$/.test(String(data.data.mid))) {
        runtime.browserIdentity = {
          status: 'loggedIn',
          mid: String(data.data.mid),
          name: String(data.data.uname || ''),
          face: safeAvatar(data.data.face),
          vip: Number(data.data.vipStatus ?? data.data.vip?.status) === 1,
        };
      } else throw new Error('浏览器账号识别失败');
    } catch (_) {
      runtime.browserIdentity = { status: 'error', mid: '', name: '' };
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
