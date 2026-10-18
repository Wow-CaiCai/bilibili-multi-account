import { runtime } from '../core/runtime.js';
import { KEY, defaults, ROLES } from '../core/config.js';
import { safeAvatar } from './profiles.js';

export function load() {
  try {
    const value = GM_getValue(KEY, null);
    return value ? validateState(value) : defaults();
  } catch (_) {
    return defaults();
  }
}
export function cookiesFrom(input) {
  if (typeof input === 'string') {
    const text = input.trim();
    if (text.startsWith('{') || text.startsWith('[')) return cookiesFrom(JSON.parse(text));
    input = Object.fromEntries(
      text
        .replace(/^cookie\s*:\s*/i, '')
        .split(';')
        .filter((s) => s.includes('='))
        .map((s) => {
          const i = s.indexOf('=');
          return [s.slice(0, i).trim(), s.slice(i + 1).trim()];
        }),
    );
  }
  if (Array.isArray(input)) input = Object.fromEntries(input.map((c) => [c.name, c.value]));
  if (input && typeof input === 'object' && input.cookies) return cookiesFrom(input.cookies);
  if (!input || typeof input !== 'object')
    throw new Error('请输入 Cookie 或含 cookies 字段的 JSON');
  const result = Object.create(null);
  for (const [name, raw] of Object.entries(input)) {
    // Device / risk cookies are allowed, but browser account tickets are deliberately excluded.
    if (!/^[A-Za-z0-9_\-]+$/.test(name) || /^(?:bili_ticket|access_key|refresh_token)$/.test(name))
      continue;
    if (typeof raw !== 'string' || /[;\r\n\x00]/.test(raw)) continue;
    result[name] = raw;
  }
  if (!result.SESSDATA || !/^\d+$/.test(result.DedeUserID || '') || !result.bili_jct) {
    throw new Error('缺少 SESSDATA、DedeUserID 或 bili_jct。SESSDATA 若不可读取，请手动粘贴。');
  }
  return result;
}
export function accountsFrom(raw, name = '') {
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
    if (accounts.some((a) => a.mid === mid)) throw new Error('导入内容含重复 UID');
    accounts.push({ mid, name: String(name.trim() || entry?.name || mid).slice(0, 80), cookies });
    if (entry && typeof entry === 'object' && Object.hasOwn(entry, 'type')) {
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
  if (
    input &&
    typeof input === 'object' &&
    !Array.isArray(input) &&
    input.version === 1 &&
    Array.isArray(input.accounts)
  ) {
    const backup = validateState(input);
    return { accounts: backup.accounts, roles: backup.roles };
  }
  if (
    input &&
    typeof input === 'object' &&
    !Array.isArray(input) &&
    !input.cookies &&
    !input.SESSDATA
  ) {
    const entries = Object.entries(input);
    if (!entries.length || !entries.every(([key, value]) => /^\d+$/.test(key) && value?.cookies)) {
      throw new Error('JSON 应为单账号、Cookie 对象或以 UID 为键的多账号对象');
    }
    for (const [mid, entry] of entries) append(entry, mid);
  } else if (Array.isArray(input) && input.some((entry) => entry?.cookies)) {
    for (const entry of input) append(entry);
  } else append(input);
  return { accounts, roles };
}
export function validateState(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.accounts))
    throw new Error('备份格式不支持');
  const next = defaults();
  // Ignore legacy disabled flags so stored and imported accounts stay active.
  next.accounts = value.accounts.map((a) => {
    const cookies = cookiesFrom(a.cookies);
    const mid = cookies.DedeUserID;
    if (String(a.mid) !== mid || mid === '0') throw new Error('账号 UID 与 Cookie 不一致');
    return {
      mid,
      name: String(a.name || mid).slice(0, 80),
      cookies,
      username: typeof a.username === 'string' ? a.username.slice(0, 80) : '',
      face: safeAvatar(a.face),
      vip: a.vip === true,
    };
  });
  if (new Set(next.accounts.map((a) => a.mid)).size !== next.accounts.length)
    throw new Error('有重复 UID');
  for (const role of Object.keys(ROLES)) {
    const mid = String(value.roles?.[role] ?? '0');
    if (mid !== '0' && mid !== 'browser' && !next.accounts.some((a) => a.mid === mid))
      throw new Error('用途引用了不存在的账号');
    next.roles[role] = mid;
  }
  return next;
}
export function save() {
  GM_setValue(KEY, runtime.state);
}
