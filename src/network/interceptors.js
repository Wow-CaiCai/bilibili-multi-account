import { page, nativeFetch, nativeBeacon } from '../core/runtime.js';
import { target } from './routing.js';
import { transport, responseHeaders } from './transport.js';
import { failureDetails } from '../player/playback.js';

export function installNetworkHooks() {
  page.fetch = async function (input, init) {
    let route;
    try {
      const url =
        typeof input === 'string' || input instanceof page.URL ? String(input) : input.url;
      route = target(url);
      if (!route) return nativeFetch.call(this, input, init);
      const request = new page.Request(input, init);
      if (request.signal.aborted) throw new DOMException('请求已取消', 'AbortError');
      let body;
      if (!['GET', 'HEAD'].includes(request.method)) {
        body = /multipart\/form-data/i.test(request.headers.get('Content-Type') || '')
          ? await request.clone().formData()
          : await request.clone().text();
      }
      const headers = new Headers(request.headers);
      if (body instanceof page.FormData || body instanceof FormData) headers.delete('Content-Type');
      const task = transport(route, { method: request.method, headers, body });
      const abort = () => task.abort();
      request.signal.addEventListener('abort', abort, { once: true });
      if (request.signal.aborted) abort();
      try {
        const r = await task.promise;
        const response = new page.Response(
          [101, 204, 205, 304].includes(r.status) || request.method === 'HEAD' ? null : r.response,
          {
            status: r.status,
            statusText: r.statusText || '',
            headers: responseHeaders(r.responseHeaders),
          },
        );
        Object.defineProperties(response, {
          url: { value: r.finalUrl || route.url.href },
          redirected: { value: false },
          type: { value: 'basic' },
        });
        return response;
      } finally {
        request.signal.removeEventListener('abort', abort);
      }
    } catch (error) {
      failureDetails(error, route, 'fetch');
      throw error;
    }
  };

  // Instrument the native prototype as well as future instances: a player or
  // another script may already hold the constructor before this script starts.
  // Replacing window.XMLHttpRequest alone misses those cached constructors.
  const NativeXHR = page.XMLHttpRequest;
  const xhrPrototype = NativeXHR.prototype;
  const xhrOriginal = Object.fromEntries(
    [
      'open',
      'send',
      'abort',
      'setRequestHeader',
      'getResponseHeader',
      'getAllResponseHeaders',
      'overrideMimeType',
    ].map((k) => [k, xhrPrototype[k]]),
  );
  const instrumentedXHR = new WeakSet();
  function instrumentXHR(xhr) {
    if (instrumentedXHR.has(xhr)) return xhr;
    instrumentedXHR.add(xhr);
    const original = xhrOriginal;
    let route,
      method,
      async,
      routed = false,
      task,
      generation = 0,
      mime = '';
    let headers = new Headers(),
      result = null,
      ready = 0,
      decoded;
    const event = (name, progress = false) =>
      xhr.dispatchEvent(
        progress ? new page.ProgressEvent(name, { lengthComputable: false }) : new page.Event(name),
      );
    const change = (value) => {
      ready = value;
      event('readystatechange');
    };
    const text = () => {
      if (decoded === undefined) {
        const type = mime || responseHeaders(result?.responseHeaders).get('Content-Type') || '';
        const encoding = /charset=([^;\s]+)/i.exec(type)?.[1] || 'utf-8';
        try {
          decoded = new TextDecoder(encoding).decode(result?.response || new ArrayBuffer(0));
        } catch (_) {
          decoded = new TextDecoder().decode(result?.response || new ArrayBuffer(0));
        }
      }
      return decoded;
    };
    const nativeGet = (name) => {
      let prototype = xhrPrototype;
      while (prototype) {
        const getter = Object.getOwnPropertyDescriptor(prototype, name)?.get;
        if (getter) return getter.call(xhr);
        prototype = Object.getPrototypeOf(prototype);
      }
      return undefined;
    };
    for (const name of [
      'readyState',
      'status',
      'statusText',
      'responseURL',
      'response',
      'responseText',
      'responseXML',
    ]) {
      Object.defineProperty(xhr, name, {
        configurable: true,
        get() {
          if (!routed) return nativeGet(name);
          if (name === 'readyState') return ready;
          if (name === 'status') return ready >= 2 ? result?.status || 0 : 0;
          if (name === 'statusText') return ready >= 2 ? result?.statusText || '' : '';
          if (name === 'responseURL') return ready >= 2 ? result?.finalUrl || route.url.href : '';
          const type = xhr.responseType;
          if (name === 'responseText' && type && type !== 'text')
            throw new DOMException('responseType 非文本', 'InvalidStateError');
          if (name === 'responseText') return ready >= 3 ? text() : '';
          if (name === 'responseXML' || (name === 'response' && type === 'document')) {
            if (ready !== 4 || !result) return null;
            const ct = mime || responseHeaders(result.responseHeaders).get('Content-Type') || '';
            if (!/xml|html/i.test(ct)) return null;
            return new page.DOMParser().parseFromString(
              text(),
              /html/i.test(ct) ? 'text/html' : 'application/xml',
            );
          }
          if (ready !== 4 || !result) return type && type !== 'text' ? null : '';
          if (type === 'arraybuffer') return result.response;
          if (type === 'blob')
            return new page.Blob([result.response], {
              type: mime || responseHeaders(result.responseHeaders).get('Content-Type') || '',
            });
          if (type === 'json') {
            try {
              return JSON.parse(text());
            } catch (_) {
              return null;
            }
          }
          return text();
        },
      });
    }
    xhr.open = function (m, url, isAsync = true, user, password) {
      ++generation;
      task?.abort();
      task = null;
      routed = false;
      result = null;
      decoded = undefined;
      ready = 0;
      mime = '';
      method = String(m).toUpperCase();
      async = isAsync !== false;
      route = target(url);
      headers = new Headers();
      return original.open.call(xhr, m, url, isAsync, user, password);
    };
    xhr.setRequestHeader = function (k, v) {
      original.setRequestHeader.call(xhr, k, v);
      headers.append(k, v);
    };
    xhr.getAllResponseHeaders = function () {
      if (!routed) return original.getAllResponseHeaders.call(xhr);
      return ready < 2
        ? ''
        : [...responseHeaders(result?.responseHeaders)].map(([k, v]) => `${k}: ${v}\r\n`).join('');
    };
    xhr.getResponseHeader = function (k) {
      return routed
        ? ready < 2
          ? null
          : responseHeaders(result?.responseHeaders).get(k)
        : original.getResponseHeader.call(xhr, k);
    };
    const originalOverride = original.overrideMimeType;
    xhr.overrideMimeType = function (value) {
      mime = String(value);
      return originalOverride.call(xhr, value);
    };
    xhr.send = function (body) {
      if (!route) return original.send.call(xhr, body);
      if (routed || xhr.readyState !== 1)
        throw new DOMException('请求状态不允许发送', 'InvalidStateError');
      if (!async)
        throw new DOMException('多账号模式不支持同步 XHR，请停用脚本后重试', 'NotSupportedError');
      routed = true;
      ready = 1;
      const mine = generation;
      event('loadstart', true);
      task = transport(route, {
        method,
        headers,
        body: /^(GET|HEAD)$/.test(method) ? null : body,
        timeout: xhr.timeout,
      });
      task.promise.then(
        (r) => {
          if (mine !== generation) return;
          result = r;
          change(2);
          if (mine !== generation) return;
          change(3);
          if (mine !== generation) return;
          event('progress', true);
          if (mine !== generation) return;
          change(4);
          if (mine !== generation) return;
          event('load', true);
          event('loadend', true);
        },
        (error) => {
          if (mine !== generation) return;
          result = null;
          change(4);
          event(
            error.name === 'TimeoutError'
              ? 'timeout'
              : error.name === 'AbortError'
                ? 'abort'
                : 'error',
            true,
          );
          event('loadend', true);
        },
      );
    };
    xhr.abort = function () {
      if (!routed) return original.abort.call(xhr);
      ++generation;
      task?.abort();
      result = null;
      decoded = undefined;
      if (ready > 0 && ready < 4) {
        change(4);
        event('abort', true);
        event('loadend', true);
      }
      ready = 0;
    };
    return xhr;
  }
  xhrPrototype.open = function (...args) {
    const xhr = instrumentXHR(this);
    return xhr.open(...args);
  };
  if (nativeBeacon)
    page.navigator.sendBeacon = function (url, data) {
      const route = target(url);
      if (!route) return nativeBeacon.call(this, url, data);
      // GM requests may be cancelled when the tab closes; see README.
      const headers = new Headers();
      if (typeof data === 'string') headers.set('Content-Type', 'text/plain;charset=UTF-8');
      const send = (body) =>
        transport(route, { method: 'POST', headers, body }).promise.catch(() => {});
      if (data instanceof page.Blob && /json|x-www-form-urlencoded/i.test(data.type)) {
        headers.set('Content-Type', data.type);
        data
          .text()
          .then(send)
          .catch(() => {});
      } else send(data);
      return true;
    };
}
