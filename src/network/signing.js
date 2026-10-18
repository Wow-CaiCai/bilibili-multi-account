import { runtime, nativeFetch, page } from '../core/runtime.js';

export function md5(text) {
  const input = new TextEncoder().encode(text);
  const bytes = new Uint8Array(Math.ceil((input.length + 9) / 64) * 64);
  bytes.set(input);
  bytes[input.length] = 128;
  const view = new DataView(bytes.buffer);
  view.setUint32(bytes.length - 8, (input.length * 8) >>> 0, true);
  view.setUint32(bytes.length - 4, Math.floor(input.length / 0x20000000), true);
  const shifts = [
    [7, 12, 17, 22],
    [5, 9, 14, 20],
    [4, 11, 16, 23],
    [6, 10, 15, 21],
  ];
  const sum = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];
  for (let offset = 0; offset < bytes.length; offset += 64) {
    let [a, b, c, d] = sum;
    for (let i = 0; i < 64; i++) {
      const round = i >>> 4;
      const f =
        round === 0
          ? (b & c) | (~b & d)
          : round === 1
            ? (d & b) | (~d & c)
            : round === 2
              ? b ^ c ^ d
              : c ^ (b | ~d);
      const g =
        round === 0
          ? i
          : round === 1
            ? (5 * i + 1) % 16
            : round === 2
              ? (3 * i + 5) % 16
              : (7 * i) % 16;
      const k = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000);
      const x = (a + f + k + view.getUint32(offset + g * 4, true)) | 0;
      const shift = shifts[round][i % 4];
      [a, b, c, d] = [d, (b + ((x << shift) | (x >>> (32 - shift)))) | 0, b, c];
    }
    sum[0] = (sum[0] + a) | 0;
    sum[1] = (sum[1] + b) | 0;
    sum[2] = (sum[2] + c) | 0;
    sum[3] = (sum[3] + d) | 0;
  }
  return sum
    .map((n) => [0, 8, 16, 24].map((s) => ((n >>> s) & 255).toString(16).padStart(2, '0')).join(''))
    .join('');
}

export async function wbiKey() {
  if (!runtime.wbiKeys || Date.now() - runtime.wbiKeys.time > 3600000) {
    runtime.wbiKeys = {
      time: Date.now(),
      promise: nativeFetch
        .call(page, 'https://api.bilibili.com/x/web-interface/nav', {
          credentials: 'include',
          cache: 'no-store',
          signal: page.AbortSignal.timeout(10000),
        })
        .then((r) => r.json())
        .then((data) => {
          const images = data.data?.wbi_img;
          const key = [images?.img_url, images?.sub_url]
            .map(
              (url) =>
                String(url || '')
                  .split('/')
                  .pop()
                  .split('.')[0],
            )
            .join('');
          if (key.length !== 64) throw new Error('无法取得 WBI 签名信息');
          // Same permutation as lib/utils/wbi_sign.dart.
          return [
            46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42,
            19, 29, 28, 14, 39, 12, 38, 41, 13,
          ]
            .map((i) => key[i])
            .join('');
        })
        .catch((error) => {
          runtime.wbiKeys = null;
          throw error;
        }),
    };
  }
  return runtime.wbiKeys.promise;
}
export async function prepareRoute(route) {
  const url = new URL(route.url.href);
  const csrf = route.account?.cookies.bili_jct || '';
  let changed = false;
  for (const key of ['access_key', 'refresh_token'])
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  for (const key of ['csrf', 'csrf_token']) {
    if (url.searchParams.has(key) && url.searchParams.get(key) !== csrf) {
      url.searchParams.set(key, csrf);
      changed = true;
    }
  }
  if (changed && url.searchParams.has('w_rid')) {
    const key = await wbiKey();
    url.searchParams.delete('w_rid');
    url.searchParams.set('wts', String(Math.floor(Date.now() / 1000)));
    const entries = [...url.searchParams].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const query = entries
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v.replace(/[!'()*]/g, ''))}`)
      .join('&');
    url.search = `${query}&w_rid=${md5(query + key)}`;
  }
  return { ...route, url };
}
