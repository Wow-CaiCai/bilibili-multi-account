import { transport } from '../network/transport.js';

export async function verify(account) {
  const route = {
    url: new URL('https://api.bilibili.com/x/web-interface/nav'),
    path: '/x/web-interface/nav',
    role: 'main',
    mid: account.mid,
    account,
  };
  const r = await transport(route).promise;
  if (r.status !== 200) throw new Error(`校验失败：HTTP ${r.status}`);
  const data = JSON.parse(new TextDecoder().decode(r.response));
  if (data.code !== 0 || !data.data?.isLogin)
    throw new Error(
      `登录失效或 Cookie 未成功发送（code ${data.code}），请更新 Cookie / Tampermonkey。`,
    );
  if (String(data.data.mid) !== account.mid)
    throw new Error('校验返回 UID 不匹配，请检查 Tampermonkey 的 Cookie 隔离支持。');
  return data.data;
}
