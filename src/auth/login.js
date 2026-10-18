import { runtime, page, profileAttempts } from '../core/runtime.js';
import { cookiesFrom, accountsFrom, validateState, save } from '../accounts/store.js';
import { el, button, icon, notice } from '../ui/components.js';
import { createLoginQR } from '../vendor/qrcode.js';
import { render } from '../ui/panel.js';
import { refreshAccountProfiles, safeAvatar } from '../accounts/profiles.js';
import { createLoginRSA } from '../vendor/jsencrypt.js';

// Login requests have their own disposable cookie jar. Never use the page's
// fetch, write document.cookie, or follow the returned cross-domain URL.
export const LOGIN_COOKIES = new Set([
  'SESSDATA',
  'bili_jct',
  'DedeUserID',
  'DedeUserID__ckMd5',
  'sid',
  'buvid3',
  'buvid4',
  'b_nut',
]);
export const LOGIN_PATHS = new Set([
  '/x/passport-login/captcha',
  '/x/passport-login/web/key',
  '/x/passport-login/web/login',
  '/x/passport-login/web/sms/send',
  '/x/passport-login/web/login/sms',
  '/x/passport-login/web/qrcode/generate',
  '/x/passport-login/web/qrcode/poll',
]);
export function stopLogin() {
  const dispose = runtime.disposeLogin;
  runtime.disposeLogin = null;
  dispose?.();
}
export function loginContext() {
  const controller = new page.AbortController();
  const timers = new Set();
  const cookies = Object.create(null);
  // Reuse only device identifiers, never the browser's logged-in identity.
  for (const entry of document.cookie.split(';')) {
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
    },
  };
}
export function loginError(code) {
  const messages = {
    '-400': '登录参数有误，请重试',
    '-412': '请求被风控拦截，请稍后重试或使用扫码登录',
    '-629': '账号或密码错误',
    '-662': '请求过于频繁，请稍后重试',
    '-105': '验证未通过，请重试',
    1002: '手机号格式有误',
    1003: '验证码已发送，请稍候',
    1006: '验证码有误或已过期',
    1007: '验证码有误或已过期',
    2400: '验证已过期，请重新获取',
    2406: '人机验证未通过，请重试',
    86203: '短信发送次数已达上限，请稍后重试',
  };
  return new Error(
    messages[code] ||
      `登录请求未完成（${Number.isFinite(Number(code)) ? Number(code) : '响应异常'}）`,
  );
}
export function keepLoginCookie(context, name, value) {
  if (!LOGIN_COOKIES.has(name) || typeof value !== 'string' || /[;\r\n\x00]/.test(value)) return;
  if (value) context.cookies[name] = value;
  else delete context.cookies[name];
}
export function loginRequest(context, path, fields = null, query = {}) {
  const identity = path === '/x/web-interface/nav';
  if (!identity && !LOGIN_PATHS.has(path)) return Promise.reject(new Error('无效的登录接口'));
  const url = new URL(
    path,
    identity ? 'https://api.bilibili.com' : 'https://passport.bilibili.com',
  );
  url.search = new URLSearchParams(query).toString();
  return new Promise((resolve, reject) => {
    let request,
      settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      context.signal.removeEventListener('abort', abort);
      error ? reject(error) : resolve(result);
    };
    const abort = () => {
      finish(new DOMException('登录已取消', 'AbortError'));
      request?.abort();
    };
    const timer = setTimeout(() => {
      finish(new Error('登录请求超时，请重试'));
      request?.abort();
    }, 20000);
    if (context.signal.aborted) {
      abort();
      return;
    }
    context.signal.addEventListener('abort', abort, { once: true });
    try {
      request = GM_xmlhttpRequest({
        method: fields ? 'POST' : 'GET',
        url: url.href,
        anonymous: true,
        redirect: 'error',
        responseType: 'text',
        cookie: Object.entries(context.cookies)
          .map(([name, value]) => `${name}=${value}`)
          .join('; '),
        headers: {
          Accept: 'application/json',
          Referer: 'https://www.bilibili.com/',
          Origin: 'https://www.bilibili.com',
          ...(fields ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
        },
        data: fields ? new URLSearchParams(fields).toString() : undefined,
        onload: (response) => {
          if (settled) return;
          try {
            const final = new URL(response.finalUrl || url.href);
            if (final.origin !== url.origin || final.pathname !== url.pathname)
              throw new Error('登录接口发生重定向，请重试');
            if (response.status !== 200) throw new Error(`登录请求失败（HTTP ${response.status}）`);
            const body = JSON.parse(response.responseText || response.response);
            if (body.code !== 0) throw loginError(body.code);
            for (const line of String(response.responseHeaders || '').split(/\r?\n/)) {
              if (!/^set-cookie:/i.test(line)) continue;
              for (const entry of line
                .replace(/^set-cookie:\s*/i, '')
                .split(/,(?=\s*[A-Za-z0-9_-]+=)/)) {
                const pair = /^\s*([A-Za-z0-9_-]+)=([^;]*)/.exec(entry);
                if (pair) keepLoginCookie(context, pair[1], pair[2]);
              }
            }
            if (!body.data || typeof body.data !== 'object')
              throw new Error('登录接口返回异常，请重试');
            finish(null, body.data);
          } catch (error) {
            finish(error instanceof SyntaxError ? new Error('登录接口返回异常，请重试') : error);
          }
        },
        onerror: () =>
          finish(new Error('登录请求失败，请检查网络及脚本的 passport.bilibili.com 权限')),
        ontimeout: () => finish(new Error('登录请求超时，请重试')),
        onabort: () => finish(new DOMException('登录已取消', 'AbortError')),
      });
    } catch (_) {
      finish(new Error('无法发起登录请求，请检查脚本权限'));
    }
  });
}
export function loginCookies(context, data) {
  // Web login can return the same credentials in the cross-domain URL when
  // Set-Cookie headers are unavailable. Parse it locally; never navigate to it.
  if (typeof data.url === 'string' && data.url) {
    let url;
    try {
      url = new URL(data.url);
    } catch (_) {
      throw new Error('登录凭据地址无效');
    }
    if (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      ['passport.biligame.com', 'passport.bilibili.com'].includes(url.hostname) &&
      /^\/crossDomain\/?$/.test(url.pathname)
    ) {
      for (const name of LOGIN_COOKIES) {
        let value = url.searchParams.get(name);
        if (name === 'SESSDATA' && value?.includes(',')) value = encodeURIComponent(value);
        if (value !== null) keepLoginCookie(context, name, value);
      }
    }
  }
  try {
    return cookiesFrom(context.cookies);
  } catch (_) {
    throw new Error('登录成功但未取得完整凭据，请重新登录或使用 Cookie 导入');
  }
}
export function showLoginCaptcha(context, data) {
  const gt = data.geetest;
  if (!data.token || !gt?.gt || !gt.challenge || (data.type && data.type !== 'geetest')) {
    return Promise.reject(new Error('当前验证方式暂不支持，请使用扫码登录'));
  }
  return new Promise((resolve, reject) => {
    if (context.signal.aborted) {
      reject(new DOMException('登录已取消', 'AbortError'));
      return;
    }
    const token = page.crypto.randomUUID();
    let settled = false;
    const overlay = el('div', null, { class: 'captcha-overlay' });
    const header = el('div', null, { class: 'captcha-header' });
    const cancel = button('', () => finish(new DOMException('验证已取消', 'AbortError')), 'close');
    cancel.setAttribute('aria-label', '取消验证');
    cancel.append(icon('close'));
    header.append(el('span', '安全验证'), cancel);
    const frame = el('iframe', null, {
      class: 'captcha-frame',
      title: '哔哩哔哩安全验证',
      sandbox: 'allow-scripts',
      referrerpolicy: 'no-referrer',
    });
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      page.removeEventListener('message', receive);
      context.signal.removeEventListener('abort', abort);
      runtime.dialog.removeEventListener('cancel', cancelDialog);
      overlay.remove();
      if (runtime.dialog.open && !context.signal.aborted)
        runtime.shadow.querySelector('.login-submit')?.focus({ preventScroll: true });
      error ? reject(error) : resolve(result);
    };
    const abort = () => finish(new DOMException('登录已取消', 'AbortError'));
    const cancelDialog = (event) => {
      event.preventDefault();
      finish(new DOMException('验证已取消', 'AbortError'));
    };
    const receive = (event) => {
      if (event.source !== frame.contentWindow || event.data?.token !== token) return;
      if (event.data.type === 'success') {
        const value = event.data.value;
        if (
          !value ||
          !['geetest_challenge', 'geetest_validate', 'geetest_seccode'].every(
            (key) =>
              typeof value[key] === 'string' && value[key].length > 0 && value[key].length < 2048,
          )
        ) {
          finish(new Error('验证结果异常，请重试'));
          return;
        }
        finish(null, {
          token: data.token,
          challenge: value.geetest_challenge,
          validate: value.geetest_validate,
          seccode: value.geetest_seccode,
        });
      } else if (event.data.type === 'close') abort();
      else if (event.data.type === 'error')
        finish(new Error('安全验证加载失败，请重试或使用扫码登录'));
    };
    const timer = setTimeout(() => finish(new Error('安全验证超时，请重试')), 180000);
    const config = JSON.stringify({
      gt: gt.gt,
      challenge: gt.challenge,
      offline: false,
      new_captcha: true,
      product: 'bind',
      https: true,
      protocol: 'https://',
      lang: 'zh-cn',
      width: '100%',
    }).replace(/</g, '\\u003c');
    frame.srcdoc = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
      html,body{margin:0;width:100%;height:100%;background:#fff;font:14px -apple-system,BlinkMacSystemFont,sans-serif}
      #loading{position:absolute;inset:0;display:grid;place-items:center;color:#86868b}</style></head><body><div id="loading">正在加载验证…</div>
      <script>const send=(type,value)=>parent.postMessage({token:${JSON.stringify(token)},type,value},'*');
      const start=()=>{try{initGeetest(${config},captcha=>{captcha.onReady(()=>{document.getElementById('loading').remove();captcha.verify()});
      captcha.onSuccess(()=>send('success',captcha.getValidate()));captcha.onError(()=>send('error'));captcha.onClose(()=>send('close'))})}catch(e){send('error')}};
      const sdk=document.createElement('script');sdk.src='https://static.geetest.com/static/tools/gt.js';sdk.onload=start;sdk.onerror=()=>send('error');document.head.append(sdk);<\/script></body></html>`;
    page.addEventListener('message', receive);
    context.signal.addEventListener('abort', abort, { once: true });
    runtime.dialog.addEventListener('cancel', cancelDialog);
    overlay.append(header, frame);
    runtime.dialog.append(overlay);
    frame.focus();
  });
}
export function drawLoginQR(canvas, value) {
  runtime.LoginQR ||= createLoginQR();
  const qr = runtime.LoginQR(0, 'M');
  qr.addData(value);
  qr.make();
  const count = qr.getModuleCount();
  const scale = 5;
  const margin = 4;
  canvas.width = canvas.height = (count + margin * 2) * scale;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('无法显示二维码');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#1d1d1f';
  for (let row = 0; row < count; row++)
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col))
        context.fillRect((col + margin) * scale, (row + margin) * scale, scale, scale);
    }
}
export function loginQRData(data) {
  // The returned scan address is QR content, not an outgoing request target.
  // Do not reject an otherwise valid key just because that address uses HTTP,
  // a relative path, or a different official Bilibili login entry point.
  let url = null;
  const raw = typeof data.url === 'string' ? data.url.trim() : '';
  if (raw) {
    try {
      url = new URL(raw, 'https://passport.bilibili.com/');
    } catch (_) {
      /* Use the canonical scan page below. */
    }
  }
  const suppliedKey = typeof data.qrcode_key === 'string' ? data.qrcode_key.trim() : '';
  const key = suppliedKey || url?.searchParams.get('qrcode_key') || '';
  if (!/^[A-Za-z0-9_-]{16,256}$/.test(key)) throw new Error('未获取到二维码，请刷新重试');
  const urlKey = url?.searchParams.get('qrcode_key');
  if (
    url &&
    ['https:', 'http:'].includes(url.protocol) &&
    !url.username &&
    !url.password &&
    !url.port &&
    (/(?:^|\.)bilibili\.com$/.test(url.hostname) || url.hostname === 'b23.tv') &&
    (!urlKey || urlKey === key)
  )
    return { key, value: url.href };
  const scan = new URL('https://passport.bilibili.com/h5-app/passport/login/scan');
  scan.search = new URLSearchParams({ navhide: '1', qrcode_key: key, from: 'main_web' }).toString();
  return { key, value: scan.href };
}
export function importPanelAccounts(raw, draft) {
  const imported = accountsFrom(raw);
  const incoming = imported.accounts.map((account) => {
    const previous = runtime.state.accounts.find((old) => old.mid === account.mid);
    profileAttempts.delete(account.mid);
    return {
      ...account,
      username: account.username || previous?.username || '',
      face: account.face || previous?.face || '',
      vip: account.vip ?? previous?.vip ?? false,
    };
  });
  const mids = new Set(incoming.map((account) => account.mid));
  runtime.state = validateState({
    ...runtime.state,
    accounts: runtime.state.accounts.filter((account) => !mids.has(account.mid)).concat(incoming),
    roles: { ...runtime.state.roles, ...imported.roles },
  });
  runtime.panelDraft = { ...draft, ...imported.roles };
  runtime.panelAddingAccount = false;
  save();
  render();
  notice('账号已导入');
  void refreshAccountProfiles(true);
}
export function renderLoginForm(content, draft) {
  const context = loginContext();
  const form = el('form', null, {
    class: `card form login-form${runtime.loginMethod === 'qrcode' ? ' qrcode-form' : ''}`,
    autocomplete: 'off',
  });
  const methods = el('div', null, {
    class: 'login-tabs',
    role: 'tablist',
    'aria-label': '添加账号方式',
  });
  const methodKeys = ['qrcode', 'password', 'sms'];
  for (const [method, label] of [
    ['qrcode', '二维码'],
    ['password', '密码'],
    ['sms', '验证码'],
  ]) {
    const tab = button(
      label,
      () => {
        runtime.loginMethod = method;
        render();
      },
      'tab',
    );
    for (const [key, value] of Object.entries({
      role: 'tab',
      'aria-selected': String(runtime.loginMethod === method),
      tabindex: runtime.loginMethod === method ? '0' : '-1',
      'data-login-method': method,
      'aria-controls': 'bilibili-login-fields',
    }))
      tab.setAttribute(key, value);
    tab.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      runtime.loginMethod =
        methodKeys[
          (methodKeys.indexOf(method) + (event.key === 'ArrowRight' ? 1 : methodKeys.length - 1)) %
            methodKeys.length
        ];
      render();
      runtime.shadow.querySelector(`[data-login-method="${runtime.loginMethod}"]`)?.focus();
    });
    methods.append(tab);
  }
  const fields = el('div', null, {
    class: 'login-fields',
    id: 'bilibili-login-fields',
    role: 'tabpanel',
  });
  const status = el('div', null, {
    class: 'login-status',
    role: 'status',
    'aria-live': 'polite',
    hidden: '',
  });
  const setStatus = (message, error = false) => {
    if (context.signal.aborted) return;
    status.textContent = message;
    status.hidden = !message;
    status.classList.toggle('error', error);
  };
  let busy = false,
    submitAction = null,
    cooldownUpdate = null;
  const run = async (action) => {
    if (busy || context.signal.aborted) return;
    busy = true;
    for (const control of form.querySelectorAll('.login-submit,.sms-send,.qr-refresh'))
      control.disabled = true;
    try {
      await action();
    } catch (error) {
      if (!context.signal.aborted)
        setStatus(
          error.name === 'AbortError' ? '验证已取消' : error.message || '登录失败，请重试',
          true,
        );
    } finally {
      busy = false;
      if (!context.signal.aborted) {
        for (const control of form.querySelectorAll('.login-submit,.sms-send,.qr-refresh'))
          control.disabled = false;
        cooldownUpdate?.();
      }
    }
  };
  const complete = async (data, session = context) => {
    if (data.status !== undefined && Number(data.status) !== 0)
      throw new Error('本次登录需要额外安全验证，请使用短信或扫码登录');
    const cookies = loginCookies(session, data);
    setStatus('正在添加账号…');
    const identity = await loginRequest(session, '/x/web-interface/nav');
    if (!identity.isLogin || String(identity.mid) !== cookies.DedeUserID)
      throw new Error('账号验证失败，请重新登录');
    if (context.signal.aborted || session.signal.aborted)
      throw new DOMException('登录已取消', 'AbortError');
    const account = {
      mid: cookies.DedeUserID,
      name: String(identity.uname || ''),
      cookies,
      username: String(identity.uname || ''),
      face: safeAvatar(identity.face),
      vip: Number(identity.vipStatus ?? identity.vip?.status) === 1,
    };
    runtime.state = validateState({
      ...runtime.state,
      accounts: runtime.state.accounts.filter((old) => old.mid !== account.mid).concat(account),
    });
    profileAttempts.set(account.mid, 'done');
    save();
    // Collapse the form after success so updating the pool does not start
    // another QR login session without a user action.
    runtime.loginMethod = 'qrcode';
    runtime.panelAddingAccount = false;
    render();
    notice('账号已添加');
  };
  const captcha = async () => {
    setStatus('正在准备安全验证…');
    const data = await loginRequest(context, '/x/passport-login/captcha', null, {
      source: 'main_web',
    });
    return showLoginCaptcha(context, data);
  };
  const submit = (label) => {
    const control = el('button', label, { type: 'submit', class: 'action primary login-submit' });
    fields.append(control);
    return control;
  };
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (submitAction) void run(submitAction);
  });
  let disposeQR = null,
    disposeQRLayout = null;
  runtime.disposeLogin = () => {
    context.dispose();
    disposeQR?.();
    disposeQRLayout?.();
    for (const input of form.querySelectorAll('input,textarea')) input.value = '';
  };

  if (runtime.loginMethod === 'password') {
    const username = el('input', null, {
      type: 'text',
      placeholder: '手机号 / 邮箱',
      'aria-label': '登录账号',
      autocomplete: 'username',
      autocapitalize: 'none',
      spellcheck: 'false',
      required: '',
      maxlength: '254',
    });
    const password = el('input', null, {
      type: 'password',
      placeholder: '密码',
      'aria-label': '登录密码',
      autocomplete: 'off',
      required: '',
      maxlength: '256',
    });
    fields.append(username, password);
    submit('登录并添加');
    submitAction = async () => {
      const account = username.value.trim();
      let secret = password.value;
      if (!account || !secret) throw new Error('请输入账号和密码');
      password.value = '';
      try {
        const validation = await captcha();
        setStatus('正在登录…');
        // Fetch the short-lived key after the user has finished the captcha.
        const key = await loginRequest(context, '/x/passport-login/web/key');
        if (
          typeof key.key !== 'string' ||
          !key.key.includes('PUBLIC KEY') ||
          typeof key.hash !== 'string'
        )
          throw new Error('无法获取登录密钥');
        runtime.LoginRSA ||= createLoginRSA();
        const crypt = new runtime.LoginRSA();
        crypt.setPublicKey(key.key);
        const encrypted = crypt.encrypt(key.hash + secret);
        secret = '';
        if (!encrypted) throw new Error('密码加密失败，请重新输入');
        const data = await loginRequest(context, '/x/passport-login/web/login', {
          username: account,
          password: encrypted,
          keep: '1',
          source: 'main_web',
          go_url: 'https://www.bilibili.com/',
          ...validation,
        });
        await complete(data);
      } finally {
        secret = '';
        password.value = '';
      }
    };
  } else if (runtime.loginMethod === 'sms') {
    const phoneRow = el('div', null, { class: 'phone-row' });
    const country = el('input', null, {
      type: 'tel',
      class: 'country-code',
      value: '+86',
      'aria-label': '国家或地区区号',
      inputmode: 'tel',
      maxlength: '5',
      required: '',
    });
    const phone = el('input', null, {
      type: 'tel',
      placeholder: '手机号',
      'aria-label': '手机号',
      autocomplete: 'tel-national',
      inputmode: 'tel',
      required: '',
      maxlength: '20',
    });
    phoneRow.append(country, phone);
    const codeRow = el('div', null, { class: 'code-row' });
    const code = el('input', null, {
      type: 'text',
      placeholder: '短信验证码',
      'aria-label': '短信验证码',
      inputmode: 'numeric',
      autocomplete: 'one-time-code',
      maxlength: '8',
      required: '',
    });
    const send = el('button', '获取验证码', { type: 'button', class: 'sms-send text-button' });
    codeRow.append(code, send);
    fields.append(phoneRow, codeRow);
    submit('登录并添加');
    let ticket = null;
    const phoneValue = () => {
      const cid = country.value.trim().replace(/^\+/, '');
      const tel = phone.value.trim().replace(/[\s-]/g, '');
      if (
        !/^[1-9]\d{0,3}$/.test(cid) ||
        !/^\d{5,15}$/.test(tel) ||
        (cid === '86' && !/^1\d{10}$/.test(tel))
      )
        throw new Error('请输入正确的区号和手机号');
      return { cid, tel };
    };
    cooldownUpdate = () => {
      const seconds = Math.max(0, Math.ceil((runtime.smsCooldownUntil - Date.now()) / 1000));
      send.textContent = seconds ? `${seconds} 秒后重发` : '获取验证码';
      send.disabled = busy || seconds > 0;
    };
    const tick = () => {
      cooldownUpdate();
      context.delay(tick, 1000);
    };
    tick();
    for (const input of [country, phone])
      input.addEventListener('input', () => {
        ticket = null;
        code.value = '';
        setStatus('');
      });
    send.addEventListener(
      'click',
      () =>
        void run(async () => {
          if (Date.now() < runtime.smsCooldownUntil) return;
          const target = phoneValue();
          ticket = null;
          const validation = await captcha();
          // An input edited while captcha is open must not receive a code for the
          // old number and then submit it with the new number.
          const current = phoneValue();
          if (current.cid !== target.cid || current.tel !== target.tel)
            throw new Error('手机号已变更，请重新获取验证码');
          setStatus('正在发送验证码…');
          const data = await loginRequest(context, '/x/passport-login/web/sms/send', {
            ...target,
            source: 'main_web',
            ...validation,
          });
          if (typeof data.captcha_key !== 'string' || !data.captcha_key)
            throw new Error('验证码发送失败，请重试');
          runtime.smsCooldownUntil = Date.now() + 60000;
          const latest = phoneValue();
          if (latest.cid !== target.cid || latest.tel !== target.tel)
            throw new Error('手机号已变更，请使用原手机号接收的验证码');
          ticket = { ...target, key: data.captcha_key, expires: Date.now() + 300000 };
          setStatus('验证码已发送');
          code.focus();
        }),
    );
    submitAction = async () => {
      const target = phoneValue();
      if (
        !ticket ||
        ticket.cid !== target.cid ||
        ticket.tel !== target.tel ||
        Date.now() >= ticket.expires
      )
        throw new Error('请先获取短信验证码');
      if (!/^\d{4,8}$/.test(code.value.trim())) throw new Error('请输入正确的短信验证码');
      setStatus('正在登录…');
      const data = await loginRequest(context, '/x/passport-login/web/login/sms', {
        ...target,
        code: code.value.trim(),
        captcha_key: ticket.key,
        source: 'main_web',
        keep: 'true',
        go_url: 'https://www.bilibili.com/',
      });
      code.value = '';
      await complete(data);
    };
  } else if (runtime.loginMethod === 'qrcode') {
    const box = el('div', null, { class: 'qr-box' });
    const placeholder = el('div', '正在生成二维码…', { class: 'qr-placeholder' });
    const canvas = el('canvas', null, {
      class: 'qr-canvas',
      role: 'img',
      'aria-label': '哔哩哔哩登录二维码',
      hidden: '',
    });
    box.append(placeholder, canvas);
    fields.append(box);
    const refresh = el('button', '刷新二维码', { type: 'button', class: 'text-button qr-refresh' });
    fields.append(refresh);
    // Use the smaller of the available width and height after login controls.
    let layoutFrame = null;
    const fitQRCode = () => {
      layoutFrame = null;
      if (context.signal.aborted || !form.isConnected || !runtime.dialog.open) return;
      const pool = form.closest('.pool-pane');
      const workspace = pool.closest('.workspace');
      const formRect = form.getBoundingClientRect();
      const poolRect = pool.getBoundingClientRect();
      const style = page.getComputedStyle(form);
      const width =
        form.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const availableHeight =
        (page.matchMedia('(min-width:761px)').matches
          ? pool.clientHeight
          : workspace.clientHeight) -
        (formRect.top - poolRect.top + pool.scrollTop);
      const controlsHeight = formRect.height - box.getBoundingClientRect().height;
      const size = Math.max(80, Math.floor(Math.min(width, availableHeight - controlsHeight - 1)));
      if (form.style.getPropertyValue('--login-qr-size') !== size + 'px')
        form.style.setProperty('--login-qr-size', size + 'px');
    };
    const queueLayout = () => {
      if (layoutFrame === null) layoutFrame = page.requestAnimationFrame(fitQRCode);
    };
    const layoutObserver = new page.ResizeObserver(queueLayout);
    for (const node of [form, methods, status, refresh, content.closest('.pool-pane')])
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
      context.signal.addEventListener('abort', abort, { once: true });
      disposeQR = () => {
        context.signal.removeEventListener('abort', abort);
        session.dispose();
      };
      canvas.hidden = true;
      canvas.classList.remove('expired');
      placeholder.hidden = false;
      placeholder.textContent = '正在生成二维码…';
      setStatus('');
      const data = await loginRequest(session, '/x/passport-login/web/qrcode/generate', null, {
        source: 'main_web',
      });
      const qr = loginQRData(data);
      drawLoginQR(canvas, qr.value);
      canvas.hidden = false;
      placeholder.hidden = true;
      setStatus('');
      const expires = Date.now() + 180000;
      const expired = () => {
        canvas.classList.add('expired');
        setStatus('二维码已失效，点击刷新');
      };
      const poll = async () => {
        if (session.signal.aborted) return;
        if (Date.now() >= expires) {
          expired();
          return;
        }
        try {
          const result = await loginRequest(session, '/x/passport-login/web/qrcode/poll', null, {
            qrcode_key: qr.key,
            source: 'main_web',
          });
          if (Number(result.code) === 0) {
            await complete(result, session);
            return;
          }
          if (Number(result.code) === 86038) {
            expired();
            return;
          }
          if (Number(result.code) === 86090) setStatus('已扫码，请在手机上确认');
          else if (Number(result.code) === 86101) setStatus('');
          else throw loginError(result.code);
          session.delay(() => void poll(), 3000);
        } catch (error) {
          if (!context.signal.aborted && !session.signal.aborted) {
            canvas.classList.add('expired');
            setStatus(error.message || '扫码登录失败，请刷新二维码', true);
          }
        }
      };
      session.delay(() => void poll(), 1000);
    };
    const generate = async () => {
      await run(start);
      if (!context.signal.aborted && canvas.hidden) placeholder.textContent = '点击下方刷新二维码';
    };
    refresh.addEventListener('click', () => void generate());
    queueMicrotask(() => {
      if (!context.signal.aborted && runtime.dialog.open) void generate();
    });
  }
  form.append(methods, fields, status);
  content.append(form);
}
