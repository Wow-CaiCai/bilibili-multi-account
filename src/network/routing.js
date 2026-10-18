import { page, runtime } from '../core/runtime.js';
import { HOSTS, GROUPS } from '../core/config.js';

export function classify(input) {
  let url;
  try {
    url = new URL(String(input), page.location.href);
  } catch (_) {
    return null;
  }
  if (
    url.protocol !== 'https:' ||
    url.port ||
    url.username ||
    url.password ||
    !HOSTS.has(url.hostname)
  )
    return null;
  if (/\/(?:login|logout|passport|oauth|qrcode|cookie|captcha|sms)(?:\/|$)/i.test(url.pathname))
    return null;
  const path = url.pathname.replace(/\/$/, '');
  let role = Object.keys(GROUPS).find((k) => GROUPS[k].has(path));
  if (!role && /^\/(?:x|pgc|pugv|ogv|xlive|room|av)\//.test(path)) role = 'main';
  if (!role) return null;
  return { url, path, role };
}
export function target(input) {
  if (!runtime.state.enabled) return null;
  const route = classify(input);
  if (!route) return null;
  const mid = runtime.state.roles[route.role];
  if (mid === 'browser') {
    return null;
  }
  const account = mid === '0' ? null : runtime.state.accounts.find((a) => a.mid === mid);
  if (mid !== '0' && !account) throw new Error('用途账号不存在，请重新配置');
  return { ...route, mid, account };
}
export function replaceCSRF(body, headers, csrf) {
  if (body == null) return body;
  if (body instanceof page.FormData || body instanceof FormData) {
    const copy = new FormData();
    for (const [k, v] of body.entries()) copy.append(k, /^(csrf|csrf_token)$/.test(k) ? csrf : v);
    return copy;
  }
  if (body instanceof page.URLSearchParams || body instanceof URLSearchParams) {
    body = body.toString();
    if (!headers.has('Content-Type'))
      headers.set('Content-Type', 'application/x-www-form-urlencoded;charset=UTF-8');
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
    if (
      contentType.includes('application/x-www-form-urlencoded') ||
      /(?:^|&)(?:csrf|csrf_token)=/.test(body)
    ) {
      const params = new URLSearchParams(body);
      for (const k of ['csrf', 'csrf_token']) if (params.has(k)) params.set(k, csrf);
      return params.toString();
    }
  }
  return body;
}
