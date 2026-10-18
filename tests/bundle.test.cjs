const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: root });
const source = fs.readFileSync(path.join(root, 'dist/bilibili-multi-account.user.js'), 'utf8');

function setup(topFrame = false) {
  const calls = [],
    requests = [],
    listeners = [],
    menus = [],
    observers = [];
  class XHR extends EventTarget {
    open(...args) {
      this.openArgs = args;
    }
    send() {}
    abort() {}
    setRequestHeader() {}
    getResponseHeader() {
      return null;
    }
    getAllResponseHeaders() {
      return '';
    }
    overrideMimeType() {}
    get readyState() {
      return this.openArgs ? 1 : 0;
    }
  }
  // Keep an instance created before installation to verify prototype patching.
  const existingXHR = new XHR();
  const page = {
    self: {},
    top: {},
    location: { href: 'https://www.bilibili.com/video/BVtest/', pathname: '/video/BVtest/' },
    XMLHttpRequest: XHR,
    navigator: {
      sendBeacon: (...args) => {
        calls.push(args);
        return true;
      },
    },
    fetch: async (...args) => {
      calls.push(args);
      return new Response(JSON.stringify({ code: 0, data: { isLogin: false } }));
    },
    URL,
    Request,
    Response,
    FormData,
    Blob,
    URLSearchParams,
    AbortController,
    AbortSignal,
    Event,
    ProgressEvent: class extends Event {},
  };
  if (topFrame) page.top = page.self;
  const config = {
    version: 1,
    enabled: true,
    accounts: [
      {
        mid: '123',
        cookies: { DedeUserID: '123', SESSDATA: 'fixture-session', bili_jct: 'fixture-csrf' },
      },
    ],
    roles: { main: 'browser', heartbeat: 'browser', recommend: 'browser', video: '123' },
  };
  const context = vm.createContext({
    unsafeWindow: page,
    console,
    URL,
    Headers,
    FormData,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    DOMException,
    setTimeout,
    clearTimeout,
    document: { cookie: 'DedeUserID=999', documentElement: null },
    MutationObserver: class {
      observe(...args) {
        observers.push(args);
      }
    },
    GM_getValue: (key) => {
      assert.equal(key, 'bilibili-web-accounts-v1');
      return config;
    },
    GM_setValue() {},
    GM_registerMenuCommand: (...args) => menus.push(args),
    GM_addValueChangeListener: (_key, callback) => listeners.push(callback),
    GM_xmlhttpRequest(options) {
      requests.push(options);
      queueMicrotask(() =>
        options.onload({
          status: 200,
          finalUrl: options.url,
          responseHeaders: 'Content-Type: application/json\r\n',
          response: new TextEncoder().encode(JSON.stringify({ code: 0, data: { fixture: true } }))
            .buffer,
        }),
      );
      return { abort() {} };
    },
  });
  vm.runInContext(source, context);
  return { page, existingXHR, config, calls, requests, listeners, menus, observers };
}

test('installable bundle preserves userscript permissions and package version', () => {
  const expected = fs
    .readFileSync(path.join(root, 'userscript.meta.js'), 'utf8')
    .trim()
    .replace(/^(\/\/ @version\s+).*$/m, `$1${require('../package.json').version.replace(/\.0$/, '')}`);
  assert.ok(source.startsWith(expected + '\n'));
  assert.equal(source.match(/==UserScript==/g).length, 1);
  assert.ok(!source.includes('globalThis.hooks'));
  assert.match(source, /Copyright \(c\) 2015 Form\.io/);
  assert.match(source, /Copyright \(c\) 2009 Kazuhiko Arase/);
});

test('full bundle routes fetch while preserving native requests and remote account changes', async () => {
  const { page, calls, requests, listeners, config, menus } = setup();
  assert.equal(menus.length, 0, 'iframe must not mount account controls');
  const url = 'https://api.bilibili.com/x/player/playurl?aid=1&cid=7';
  const response = await page.fetch(url);
  assert.equal((await response.json()).data.fixture, true);
  assert.equal(response.url, url);
  assert.equal(requests[0].anonymous, true);
  assert.match(requests[0].cookie, /DedeUserID=123/);
  await page.fetch('https://example.com/unrelated');
  assert.equal(calls.length, 1);
  listeners[0]('', null, { ...config, roles: { ...config.roles, video: 'browser' } }, true);
  await page.fetch(url);
  assert.equal(calls.length, 2);
  assert.equal(requests.length, 1);
});

test('full bundle instruments existing XHR instances and completes routed requests', async () => {
  const { existingXHR: xhr, requests } = setup();
  const done = new Promise((resolve) => xhr.addEventListener('loadend', resolve, { once: true }));
  xhr.open('GET', 'https://api.bilibili.com/x/player/playurl?aid=1&cid=7');
  xhr.responseType = 'json';
  xhr.send();
  await done;
  assert.equal(xhr.readyState, 4);
  assert.equal(xhr.status, 200);
  assert.equal(xhr.response.data.fixture, true);
  assert.equal(requests.length, 1);
});

test('top-frame document-start registers menu and waits for the document root', async () => {
  const { menus, observers } = setup(true);
  await new Promise(setImmediate);
  assert.equal(menus.length, 1);
  assert.equal(menus[0][0], '哔哩哔哩账号管理');
  assert.equal(typeof menus[0][1], 'function');
  assert.equal(observers.length, 1);
});
