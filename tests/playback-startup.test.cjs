const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

// Run the real document-start hooks without mounting the account UI or loading
// bundled login libraries. All account values and HTTP responses are fixtures.
const source = fs.readFileSync(process.env.PLAYBACK_TEST_SOURCE
  || path.join(__dirname, '..', 'bilibili-multi-account.js'), 'utf8');
const boot = source.slice(0, source.indexOf('\n  page.fetch = async function'))
  + '\n globalThis.hooks = { refreshPlayerAccess, target, transport, playbackBootstrap };\n})();';

function setup({ enabled = true, mid = '123', pathname = '/video/BVtest/', existing = false } = {}) {
  const requests = [];
  const nativeRequests = [];
  const players = [];
  const config = { version: 1, enabled,
    accounts: [{ mid: '123', cookies: { DedeUserID: '123', SESSDATA: 'fixture-session', bili_jct: 'fixture-csrf' } }],
    roles: { main: 'browser', heartbeat: 'browser', recommend: 'browser', video: mid } };
  const page = { location: { href: `https://www.bilibili.com${pathname}`, pathname },
    navigator: { sendBeacon() {} }, FormData, URLSearchParams, AbortController, AbortSignal,
    fetch: async url => {
      nativeRequests.push(url);
      return { ok: true, json: async () => ({ code: 0, data: { last_play_time: 42000, last_play_cid: 7 } }) };
    } };
  function makePlayer() {
    const listeners = new Map();
    const player = { reloads: 0,
      once(event, callback) { listeners.set(event, callback); },
      emit(event) { const callback = listeners.get(event); listeners.delete(event); callback?.(); },
      getUserInfo: () => ({ mid: Number(mid) || null }),
      reloadAccess() { this.reloads++; return Promise.resolve(); } };
    players.push(player);
    return player;
  }
  if (existing) page.player = makePlayer();
  const context = vm.createContext({ unsafeWindow: page, console, URL, Headers, FormData,
    URLSearchParams, TextEncoder, TextDecoder, DOMException, setTimeout, clearTimeout,
    document: { cookie: 'DedeUserID=999' }, GM_getValue: () => config,
    GM_addValueChangeListener() {},
    GM_xmlhttpRequest(options) {
      requests.push(options);
      queueMicrotask(() => options.onload({ status: 200, finalUrl: options.url,
        responseHeaders: 'Content-Type: application/json\r\n',
        response: new TextEncoder().encode(JSON.stringify({ code: 0, data: {
          login_mid: Number(mid), vip: { status: 1 }, last_play_time: 99000, last_play_cid: 8,
        } })).buffer }));
      return { abort() {} };
    } });
  vm.runInContext(boot, context);
  const nano = { EventType: { Player_Initialized: 'initialized' },
    createPlayer(input) { this.lastConfig = input; return makePlayer(); } };
  page.nano = nano;
  return { page, nano, hooks: context.hooks, requests, nativeRequests, players };
}

for (const options of [{}, { mid: '0' }, { enabled: false }, { mid: 'browser' }, { existing: true }]) {
  test(`initialization never reloads an active source: ${JSON.stringify(options)}`, async () => {
    const { page, players } = setup(options);
    const player = page.nano.createPlayer({ prefetch: { playUrl: { account: 'browser' }, view: { aid: 1 } } });
    page.player = player;
    for (const instance of players) instance.emit('initialized');
    await new Promise(setImmediate);
    assert.ok(players.every(instance => instance.reloads === 0), 'startup must not call reloadAccess');
  });
}

test('legacy disabled settings still route requests and discard browser stream preload', async () => {
  const { page, nano, hooks, requests } = setup({ enabled: false });
  const route = hooks.target('https://api.bilibili.com/x/player/wbi/playurl?aid=1&cid=7');
  assert.equal(route.mid, '123');
  await hooks.transport(route).promise;
  assert.ok(requests[0].cookie.includes('DedeUserID=123'));
  page.nano.createPlayer({ prefetch: { playUrl: { account: 'browser' } } });
  assert.equal(nano.lastConfig.prefetch.playUrl, undefined);
  page.__playinfo__ = { account: 'browser' };
  assert.equal(page.__playinfo__, undefined);
  await hooks.refreshPlayerAccess(page.player = page.nano.createPlayer({}));
  assert.equal(page.player.reloads, 1);
});

test('separate video account discards browser stream preload and preserves other config', () => {
  const { page, nano } = setup();
  const config = { prefetch: { playUrl: { account: 'browser' }, view: { aid: 1 } }, autoplay: true };
  page.nano.createPlayer(config);
  assert.equal(nano.lastConfig.prefetch.playUrl, undefined);
  assert.equal(nano.lastConfig.prefetch.view, config.prefetch.view);
  assert.equal(nano.lastConfig.autoplay, true);
  assert.ok(config.prefetch.playUrl, 'caller config must not be mutated');
  page.__playinfo__ = { account: 'browser' };
  assert.equal(page.__playinfo__, undefined);
});

test('browser account keeps native prefetch and existing player property', () => {
  const { page, nano } = setup({ mid: 'browser', existing: true });
  const config = { prefetch: { playUrl: { account: 'browser' } } };
  page.nano.createPlayer(config);
  assert.equal(nano.lastConfig, config);
  assert.equal(Object.getOwnPropertyDescriptor(page, 'player').get, undefined);
});

test('initial permission and stream requests route to the video account; resume uses heartbeat account', async () => {
  const { hooks, requests, nativeRequests } = setup();
  for (const endpoint of ['/x/player/wbi/v2', '/x/player/v2', '/x/player/wbi/playurl']) {
    const route = hooks.target(`https://api.bilibili.com${endpoint}?aid=1&cid=7`);
    assert.equal(route.mid, '123');
    const result = await hooks.transport(route).promise;
    const payload = JSON.parse(new TextDecoder().decode(result.response));
    assert.equal(payload.data.login_mid, 123);
    assert.equal(payload.data.vip.status, 1);
    if (!endpoint.endsWith('playurl')) {
      assert.equal(payload.data.last_play_time, 42000);
      assert.equal(payload.data.last_play_cid, 7);
    }
  }
  assert.equal(requests.length, 3);
  assert.equal(nativeRequests.length, 2);
  assert.ok(requests.every(request => request.anonymous && request.cookie.includes('DedeUserID=123')));
});

test('explicit account sync is retained and concurrent clicks share one reload', async () => {
  const { page, hooks } = setup();
  const player = page.nano.createPlayer({});
  page.player = player;
  const first = hooks.refreshPlayerAccess();
  const second = hooks.refreshPlayerAccess();
  assert.equal(first, second);
  await first;
  assert.equal(player.reloads, 1);
  await hooks.refreshPlayerAccess();
  assert.equal(player.reloads, 2);
});

test('explicit sync still detects identity mismatches and can retry after failure', async () => {
  const { page, hooks } = setup();
  const player = page.nano.createPlayer({});
  player.getUserInfo = () => ({ mid: 999 });
  await assert.rejects(hooks.refreshPlayerAccess(player), /与取流 UID 123 不一致/);
  player.getUserInfo = () => ({ mid: 123 });
  await hooks.refreshPlayerAccess(player);
  assert.equal(player.reloads, 2);
});

test('OGV SSR adapter and ordinary API callbacks remain in place', () => {
  const { page, nano } = setup();
  const ssrCallback = function () { return playurlSSRData; };
  const apiCallback = () => Promise.resolve({ code: 0 });
  page.nano.createPlayer({ requestConfig: { reqHttpPlayUrlInfo: ssrCallback } });
  assert.notEqual(nano.lastConfig.requestConfig.reqHttpPlayUrlInfo, ssrCallback);
  page.nano.createPlayer({ requestConfig: { reqHttpPlayUrlInfo: apiCallback } });
  assert.equal(nano.lastConfig.requestConfig.reqHttpPlayUrlInfo, apiCallback);
});
