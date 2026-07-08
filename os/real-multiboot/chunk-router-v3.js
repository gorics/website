(() => {
  'use strict';
  if (globalThis.__goricsChunkRouterV3) return;
  Object.defineProperty(globalThis, '__goricsChunkRouterV3', { value: true });

  const NativeXHR = globalThis.XMLHttpRequest;
  const nativeFetch = globalThis.fetch.bind(globalThis);
  const roots = [
    'https://cdn.jsdelivr.net/gh/gorics/website@os-assets/os/real-multiboot/assets/v86-parts/',
    'https://cdn.statically.io/gh/gorics/website/os-assets/os/real-multiboot/assets/v86-parts/',
    'https://raw.githubusercontent.com/gorics/website/os-assets/os/real-multiboot/assets/v86-parts/',
  ];
  const stem = 'gorics-linux-gui-web-i386';
  const patterns = [
    new RegExp(`^${stem}-(\\d+)-(\\d+)\\.iso$`),
    new RegExp(`^${stem}\\.iso-(\\d+)-(\\d+)\\.iso$`),
    new RegExp(`^${stem}\\.iso-(\\d+)-(\\d+)$`),
  ];
  let routes = 0;

  function log(message) {
    const box = document.querySelector('#log');
    const line = `[${new Date().toISOString()}] ${message}`;
    if (box) {
      box.textContent += `\n${line}`;
      box.scrollTop = box.scrollHeight;
    }
    console.log('[GORICS CHUNK]', message);
  }

  function parseAsset(input) {
    let url;
    try { url = new URL(String(input), location.href); } catch { return null; }
    const filename = decodeURIComponent(url.pathname.split('/').pop() || '');
    for (const pattern of patterns) {
      const match = filename.match(pattern);
      if (match) return {
        start: match[1],
        search: url.search,
        name: `${stem}.iso-${match[1]}-${match[2]}`,
      };
    }
    return null;
  }

  function urls(asset) {
    return roots.map(root => `${root}${asset.name}${asset.search || ''}`);
  }
  const ok = status => status === 200 || status === 206;
  const call = (fn, self, event) => { if (typeof fn === 'function') fn.call(self, event); };

  class RoutedXHR {
    constructor() {
      this._xhr = null;
      this._method = 'GET';
      this._source = '';
      this._urls = [];
      this._index = 0;
      this._async = true;
      this._user = undefined;
      this._password = undefined;
      this._headers = [];
      this._body = null;
      this._responseType = '';
      this._timeout = 0;
      this._credentials = false;
      this._mime = null;
      this._sent = false;
      this._aborted = false;
      this._generation = 0;
      this._listeners = new Map();
      for (const event of ['readystatechange', 'loadstart', 'progress', 'abort', 'error', 'load', 'timeout', 'loadend']) this[`on${event}`] = null;
    }

    open(method, url, async = true, user, password) {
      this._method = method;
      this._source = String(url);
      const asset = parseAsset(url);
      this._urls = asset ? urls(asset) : [this._source];
      this._index = 0;
      this._async = async !== false;
      this._user = user;
      this._password = password;
      this._headers = [];
      this._body = null;
      this._sent = false;
      this._aborted = false;
      if (asset && (++routes <= 12 || asset.start === '335544320')) log(`ISO chunk route ${asset.name}`);
      this._openCurrent();
    }

    _openCurrent() {
      const generation = ++this._generation;
      const xhr = new NativeXHR();
      this._xhr = xhr;
      xhr.onreadystatechange = event => {
        if (generation !== this._generation) return;
        if (xhr.readyState === 4 && this._shouldRetry()) return this._retry(`HTTP ${xhr.status || 0}`);
        this._emit('readystatechange', event);
      };
      xhr.onloadstart = event => this._forward(generation, 'loadstart', event);
      xhr.onprogress = event => this._forward(generation, 'progress', event);
      xhr.onabort = event => {
        if (generation === this._generation && this._aborted) {
          this._emit('abort', event);
          this._emit('loadend', event);
        }
      };
      xhr.onerror = event => {
        if (generation !== this._generation) return;
        if (this._canRetry()) return this._retry('network error');
        this._emit('error', event);
      };
      xhr.ontimeout = event => {
        if (generation !== this._generation) return;
        if (this._canRetry()) return this._retry('timeout');
        this._emit('timeout', event);
      };
      xhr.onload = event => {
        if (generation !== this._generation) return;
        if (this._shouldRetry()) return this._retry(`HTTP ${xhr.status || 0}`);
        this._emit('load', event);
      };
      xhr.onloadend = event => {
        if (generation === this._generation && !this._shouldRetry()) this._emit('loadend', event);
      };

      if (this._user !== undefined) xhr.open(this._method, this._urls[this._index], this._async, this._user, this._password);
      else xhr.open(this._method, this._urls[this._index], this._async);
      xhr.responseType = this._responseType;
      xhr.withCredentials = this._credentials;
      xhr.timeout = this._timeout || (this._urls.length > 1 ? 35000 : 0);
      if (this._mime && xhr.overrideMimeType) xhr.overrideMimeType(this._mime);
      for (const [name, value] of this._headers) xhr.setRequestHeader(name, value);
    }

    _forward(generation, type, event) {
      if (generation === this._generation) this._emit(type, event);
    }
    _emit(type, event) {
      call(this[`on${type}`], this, event);
      const set = this._listeners.get(type);
      if (!set) return;
      for (const listener of [...set]) {
        if (typeof listener === 'function') listener.call(this, event);
        else listener?.handleEvent?.call(listener, event);
      }
    }
    _canRetry() { return !this._aborted && this._index + 1 < this._urls.length; }
    _shouldRetry() { return !ok(this._xhr?.status || 0) && this._canRetry(); }
    _retry(reason) {
      if (!this._canRetry()) return;
      const previous = new URL(this._urls[this._index]).hostname;
      this._index += 1;
      const next = new URL(this._urls[this._index]).hostname;
      log(`ISO chunk retry ${previous} -> ${next} (${reason})`);
      const old = this._xhr;
      this._generation += 1;
      try { old?.abort(); } catch {}
      this._openCurrent();
      if (this._sent) this._xhr.send(this._body);
    }

    send(body = null) { this._body = body; this._sent = true; this._xhr.send(body); }
    abort() { this._aborted = true; this._generation += 1; this._xhr?.abort(); }
    setRequestHeader(name, value) { this._headers.push([name, value]); this._xhr.setRequestHeader(name, value); }
    getResponseHeader(name) { return this._xhr?.getResponseHeader(name) ?? null; }
    getAllResponseHeaders() { return this._xhr?.getAllResponseHeaders() ?? ''; }
    overrideMimeType(value) { this._mime = value; this._xhr?.overrideMimeType?.(value); }
    addEventListener(type, listener) {
      if (!this._listeners.has(type)) this._listeners.set(type, new Set());
      this._listeners.get(type).add(listener);
    }
    removeEventListener(type, listener) { this._listeners.get(type)?.delete(listener); }
    dispatchEvent(event) { this._emit(event.type, event); return true; }

    get readyState() { return this._xhr?.readyState ?? 0; }
    get status() { return this._xhr?.status ?? 0; }
    get statusText() { return this._xhr?.statusText ?? ''; }
    get response() { return this._xhr?.response ?? null; }
    get responseText() { return this._xhr?.responseText ?? ''; }
    get responseXML() { return this._xhr?.responseXML ?? null; }
    get responseURL() { return this._xhr?.responseURL ?? ''; }
    get upload() { return this._xhr?.upload; }
    get responseType() { return this._responseType; }
    set responseType(value) { this._responseType = value; if (this._xhr) this._xhr.responseType = value; }
    get timeout() { return this._timeout; }
    set timeout(value) { this._timeout = Number(value) || 0; if (this._xhr) this._xhr.timeout = this._timeout; }
    get withCredentials() { return this._credentials; }
    set withCredentials(value) { this._credentials = Boolean(value); if (this._xhr) this._xhr.withCredentials = this._credentials; }
  }

  for (const key of ['UNSENT', 'OPENED', 'HEADERS_RECEIVED', 'LOADING', 'DONE']) {
    Object.defineProperty(RoutedXHR, key, { value: NativeXHR[key] });
    Object.defineProperty(RoutedXHR.prototype, key, { value: NativeXHR[key] });
  }
  globalThis.XMLHttpRequest = RoutedXHR;

  globalThis.fetch = async function(input, init) {
    const source = input instanceof Request ? input.url : String(input);
    const asset = parseAsset(source);
    if (!asset) return nativeFetch(input, init);
    let response = null;
    let error = null;
    const candidates = urls(asset);
    for (let index = 0; index < candidates.length; index += 1) {
      const target = candidates[index];
      try {
        const request = input instanceof Request ? new Request(target, input) : target;
        response = await nativeFetch(request, input instanceof Request ? undefined : init);
        if (ok(response.status)) {
          if (index > 0) log(`ISO probe fallback selected ${new URL(target).hostname}`);
          return response;
        }
        error = new Error(`HTTP ${response.status}`);
      } catch (caught) { error = caught; }
      if (index + 1 < candidates.length) log(`ISO probe retry ${new URL(target).hostname}: ${error?.message || error}`);
    }
    if (response) return response;
    throw error || new Error('all ISO chunk sources failed');
  };

  log('ISO chunk resilient router v3 installed (jsDelivr -> Statically -> raw GitHub)');
})();
