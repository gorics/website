(() => {
  'use strict';

  if (globalThis.__goricsChunkRouterV4) return;
  Object.defineProperty(globalThis, '__goricsChunkRouterV4', { value: true });

  const NativeXHR = globalThis.XMLHttpRequest;
  const nativeFetch = globalThis.fetch.bind(globalThis);
  const roots = [
    'https://cdn.jsdelivr.net/gh/gorics/website@os-assets/os/real-multiboot/assets/v86-parts/',
    'https://fastly.jsdelivr.net/gh/gorics/website@os-assets/os/real-multiboot/assets/v86-parts/',
    'https://gcore.jsdelivr.net/gh/gorics/website@os-assets/os/real-multiboot/assets/v86-parts/',
    'https://cdn.statically.io/gh/gorics/website/os-assets/os/real-multiboot/assets/v86-parts/',
    'https://raw.githubusercontent.com/gorics/website/os-assets/os/real-multiboot/assets/v86-parts/',
  ];
  const stem = 'gorics-linux-gui-web-i386';
  const publishedBase = `${stem}.iso`;
  const patterns = [
    new RegExp(`^${stem}-(\\d+)-(\\d+)\\.iso$`),
    new RegExp(`^${stem}\\.iso-(\\d+)-(\\d+)\\.iso$`),
    new RegExp(`^${stem}\\.iso-(\\d+)-(\\d+)$`),
  ];
  let preferredRoot = null;
  let routeCount = 0;

  function pageLog(message) {
    const line = `[${new Date().toISOString()}] ${message}`;
    const box = document.querySelector('#log');
    if (box) {
      box.textContent += `\n${line}`;
      box.scrollTop = box.scrollHeight;
    }
    console.log('[GORICS CHUNK]', message);
  }

  function ascii(bytes, start, length) {
    return String.fromCharCode(...bytes.slice(start, start + length));
  }

  function parseAsset(input) {
    let parsed;
    try { parsed = new URL(String(input), location.href); } catch { return null; }
    const filename = decodeURIComponent(parsed.pathname.split('/').pop() || '');
    for (const pattern of patterns) {
      const match = filename.match(pattern);
      if (!match) continue;
      const sourceRoot = roots.find(root => parsed.href.startsWith(root)) || preferredRoot || roots[0];
      return {
        start: Number(match[1]),
        end: Number(match[2]),
        search: parsed.search,
        sourceRoot,
        publishedName: `${publishedBase}-${match[1]}-${match[2]}`,
      };
    }
    return null;
  }

  function assetUrl(asset, root) {
    return `${root}${asset.publishedName}${asset.search || ''}`;
  }

  function orderedRoots(asset) {
    const first = preferredRoot || asset.sourceRoot || roots[0];
    return [first, ...roots.filter(root => root !== first)];
  }

  function parseRange(headers) {
    const value = headers instanceof Headers ? headers.get('range') : null;
    const match = /^bytes=(\d+)-(\d+)$/.exec(value || '');
    if (!match) return null;
    const start = Number(match[1]);
    const end = Number(match[2]);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end < start) return null;
    return { start, end, length: end - start + 1 };
  }

  async function normalizedResponse(response, range, asset, root) {
    if (!response.ok && response.status !== 206) throw new Error(`HTTP ${response.status}`);
    if (!range) return response;

    const bytes = new Uint8Array(await response.arrayBuffer());
    let selected;
    if (response.status === 206 && bytes.length === range.length) selected = bytes;
    else if (response.status === 200 && bytes.length >= range.end + 1) selected = bytes.slice(range.start, range.end + 1);
    else if (bytes.length === range.length) selected = bytes;
    else throw new Error(`range body mismatch status=${response.status} bytes=${bytes.length} expected=${range.length}`);

    if (range.start === 32768 && range.end >= 36863) {
      if (selected.length < 4096 || ascii(selected, 1, 5) !== 'CD001') throw new Error('ISO9660 descriptor missing');
      if (ascii(selected, 2049, 5) !== 'CD001' || !ascii(selected, 2055, 32).includes('EL TORITO')) {
        throw new Error('El Torito descriptor missing');
      }
      pageLog(`ISO9660 and El Torito verified from ${new URL(root).hostname}`);
    }

    const headers = new Headers(response.headers);
    headers.set('content-length', String(selected.length));
    headers.set('content-range', `bytes ${range.start}-${range.end}/*`);
    headers.set('accept-ranges', 'bytes');
    return new Response(selected, { status: 206, statusText: 'Partial Content', headers });
  }

  async function fetchAsset(asset, requestInit = {}) {
    const headers = new Headers(requestInit.headers || {});
    const range = parseRange(headers);
    let lastError = null;

    for (const root of orderedRoots(asset)) {
      const target = assetUrl(asset, root);
      try {
        const response = await nativeFetch(target, { ...requestInit, headers });
        const normalized = await normalizedResponse(response, range, asset, root);
        preferredRoot = root;
        if (root !== asset.sourceRoot) pageLog(`ISO chunk fallback selected ${new URL(root).hostname} ${asset.publishedName}`);
        return normalized;
      } catch (error) {
        lastError = error;
        pageLog(`ISO chunk source rejected ${new URL(root).hostname} ${asset.publishedName}: ${error?.message || error}`);
      }
    }
    throw lastError || new Error(`all ISO chunk sources failed for ${asset.publishedName}`);
  }

  class RoutedXMLHttpRequest {
    constructor() {
      this.onreadystatechange = null;
      this.onloadstart = null;
      this.onprogress = null;
      this.onabort = null;
      this.onerror = null;
      this.onload = null;
      this.ontimeout = null;
      this.onloadend = null;
      this._listeners = new Map();
      this._native = null;
      this._asset = null;
      this._method = 'GET';
      this._url = '';
      this._async = true;
      this._user = undefined;
      this._password = undefined;
      this._headers = new Headers();
      this._body = null;
      this._responseType = '';
      this._timeout = 0;
      this._withCredentials = false;
      this._mimeType = null;
      this._readyState = NativeXHR.UNSENT;
      this._status = 0;
      this._statusText = '';
      this._response = null;
      this._responseText = '';
      this._responseURL = '';
      this._responseHeaders = new Headers();
      this._controller = null;
      this._timeoutId = null;
      this._aborted = false;
      this._sent = false;
    }

    open(method, url, async = true, user, password) {
      this._method = method;
      this._url = String(url);
      this._async = async !== false;
      this._user = user;
      this._password = password;
      this._asset = parseAsset(url);
      this._aborted = false;
      this._sent = false;

      if (!this._asset) {
        const native = new NativeXHR();
        this._native = native;
        for (const type of ['readystatechange', 'loadstart', 'progress', 'abort', 'error', 'load', 'timeout', 'loadend']) {
          native[`on${type}`] = event => this._emit(type, event);
        }
        if (user !== undefined) native.open(method, url, async, user, password);
        else native.open(method, url, async);
        native.responseType = this._responseType;
        native.withCredentials = this._withCredentials;
        native.timeout = this._timeout;
        if (this._mimeType && native.overrideMimeType) native.overrideMimeType(this._mimeType);
        return;
      }

      routeCount += 1;
      if (routeCount <= 20 || this._asset.start === 335544320) pageLog(`ISO chunk route ${this._asset.publishedName}`);
      this._readyState = NativeXHR.OPENED;
      queueMicrotask(() => this._emit('readystatechange', new Event('readystatechange')));
    }

    setRequestHeader(name, value) {
      if (this._native) return this._native.setRequestHeader(name, value);
      this._headers.append(name, value);
    }

    send(body = null) {
      this._body = body;
      this._sent = true;
      if (this._native) return this._native.send(body);
      if (!this._asset) throw new DOMException('InvalidStateError', 'InvalidStateError');
      void this._sendAsset();
    }

    async _sendAsset() {
      this._controller = new AbortController();
      this._emit('loadstart', new ProgressEvent('loadstart'));
      if (this._timeout > 0) {
        this._timeoutId = setTimeout(() => {
          if (this._controller && !this._aborted) this._controller.abort('timeout');
        }, this._timeout);
      }

      try {
        const response = await fetchAsset(this._asset, {
          method: this._method,
          headers: this._headers,
          body: this._body,
          signal: this._controller.signal,
          cache: 'no-store',
          credentials: this._withCredentials ? 'include' : 'same-origin',
        });
        if (this._aborted) return;

        this._status = response.status;
        this._statusText = response.statusText;
        this._responseURL = response.url || assetUrl(this._asset, preferredRoot || this._asset.sourceRoot);
        this._responseHeaders = new Headers(response.headers);
        this._readyState = NativeXHR.HEADERS_RECEIVED;
        this._emit('readystatechange', new Event('readystatechange'));

        const buffer = await response.arrayBuffer();
        if (this._aborted) return;
        this._readyState = NativeXHR.LOADING;
        this._emit('readystatechange', new Event('readystatechange'));
        this._emit('progress', new ProgressEvent('progress', { lengthComputable: true, loaded: buffer.byteLength, total: buffer.byteLength }));

        if (this._responseType === '' || this._responseType === 'text') {
          this._responseText = new TextDecoder().decode(buffer);
          this._response = this._responseText;
        } else if (this._responseType === 'json') {
          this._responseText = new TextDecoder().decode(buffer);
          this._response = JSON.parse(this._responseText);
        } else if (this._responseType === 'blob') {
          this._response = new Blob([buffer], { type: response.headers.get('content-type') || '' });
        } else {
          this._response = buffer;
        }

        this._readyState = NativeXHR.DONE;
        this._emit('readystatechange', new Event('readystatechange'));
        this._emit('load', new ProgressEvent('load', { lengthComputable: true, loaded: buffer.byteLength, total: buffer.byteLength }));
        this._emit('loadend', new ProgressEvent('loadend', { lengthComputable: true, loaded: buffer.byteLength, total: buffer.byteLength }));
      } catch (error) {
        if (this._aborted) return;
        const timedOut = this._controller?.signal.aborted && this._controller.signal.reason === 'timeout';
        this._readyState = NativeXHR.DONE;
        this._emit('readystatechange', new Event('readystatechange'));
        this._emit(timedOut ? 'timeout' : 'error', new ProgressEvent(timedOut ? 'timeout' : 'error'));
        this._emit('loadend', new ProgressEvent('loadend'));
      } finally {
        if (this._timeoutId) clearTimeout(this._timeoutId);
        this._timeoutId = null;
      }
    }

    abort() {
      if (this._native) return this._native.abort();
      if (this._aborted) return;
      this._aborted = true;
      if (this._timeoutId) clearTimeout(this._timeoutId);
      this._controller?.abort('abort');
      this._readyState = NativeXHR.UNSENT;
      this._status = 0;
      this._emit('abort', new ProgressEvent('abort'));
      this._emit('loadend', new ProgressEvent('loadend'));
    }

    _emit(type, event) {
      const handler = this[`on${type}`];
      if (typeof handler === 'function') handler.call(this, event);
      const listeners = this._listeners.get(type);
      if (!listeners) return;
      for (const listener of [...listeners]) {
        if (typeof listener === 'function') listener.call(this, event);
        else listener?.handleEvent?.call(listener, event);
      }
    }

    addEventListener(type, listener) {
      if (!this._listeners.has(type)) this._listeners.set(type, new Set());
      this._listeners.get(type).add(listener);
    }
    removeEventListener(type, listener) { this._listeners.get(type)?.delete(listener); }
    dispatchEvent(event) { this._emit(event.type, event); return true; }

    get readyState() { return this._native ? this._native.readyState : this._readyState; }
    get status() { return this._native ? this._native.status : this._status; }
    get statusText() { return this._native ? this._native.statusText : this._statusText; }
    get response() { return this._native ? this._native.response : this._response; }
    get responseText() { return this._native ? this._native.responseText : this._responseText; }
    get responseXML() { return this._native ? this._native.responseXML : null; }
    get responseURL() { return this._native ? this._native.responseURL : this._responseURL; }
    get upload() { return this._native?.upload || null; }

    get responseType() { return this._native ? this._native.responseType : this._responseType; }
    set responseType(value) { this._responseType = value; if (this._native) this._native.responseType = value; }
    get timeout() { return this._native ? this._native.timeout : this._timeout; }
    set timeout(value) { this._timeout = Number(value) || 0; if (this._native) this._native.timeout = this._timeout; }
    get withCredentials() { return this._native ? this._native.withCredentials : this._withCredentials; }
    set withCredentials(value) { this._withCredentials = Boolean(value); if (this._native) this._native.withCredentials = this._withCredentials; }

    getResponseHeader(name) {
      return this._native ? this._native.getResponseHeader(name) : this._responseHeaders.get(name);
    }
    getAllResponseHeaders() {
      if (this._native) return this._native.getAllResponseHeaders();
      return [...this._responseHeaders.entries()].map(([key, value]) => `${key}: ${value}\r\n`).join('');
    }
    overrideMimeType(value) {
      this._mimeType = value;
      this._native?.overrideMimeType?.(value);
    }
  }

  for (const key of ['UNSENT', 'OPENED', 'HEADERS_RECEIVED', 'LOADING', 'DONE']) {
    Object.defineProperty(RoutedXMLHttpRequest, key, { value: NativeXHR[key] });
    Object.defineProperty(RoutedXMLHttpRequest.prototype, key, { value: NativeXHR[key] });
  }

  globalThis.XMLHttpRequest = RoutedXMLHttpRequest;

  globalThis.fetch = async function(input, init) {
    const originalUrl = input instanceof Request ? input.url : String(input);
    const asset = parseAsset(originalUrl);
    if (!asset) return nativeFetch(input, init);
    const headers = input instanceof Request ? input.headers : new Headers(init?.headers || {});
    const requestInit = input instanceof Request
      ? { method: input.method, headers, body: ['GET', 'HEAD'].includes(input.method) ? undefined : await input.clone().arrayBuffer(), signal: input.signal }
      : { ...(init || {}), headers };
    return fetchAsset(asset, requestInit);
  };

  pageLog('ISO chunk router v4 installed (fetch-backed XHR + verified multi-CDN failover)');
})();
