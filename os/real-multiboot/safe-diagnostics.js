(() => {
  'use strict';

  if (globalThis.__GORICS_SAFE_DIAGNOSTICS__) return;
  Object.defineProperty(globalThis, '__GORICS_SAFE_DIAGNOSTICS__', { value: true });

  const build = document.querySelector('meta[name="gorics-build"]')?.content?.trim() || 'dev';
  const startedAt = performance.now();
  const nativeConsole = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };
  const counters = { lines: 0, fetch: 0, xhr: 0, warnings: 0, errors: 0, progressSuppressed: 0 };
  const entries = [];
  const xhrMeta = new WeakMap();
  const pendingDomLines = [];
  let sequence = 0;
  let toolbarInstalled = false;
  let renderScheduled = false;

  function cleanUrl(value) {
    try {
      const url = new URL(String(value), location.href);
      for (const key of [...url.searchParams.keys()]) url.searchParams.set(key, '<redacted>');
      url.hash = '';
      return url.href;
    } catch {
      return String(value);
    }
  }

  function plain(value, depth = 0, seen = new WeakSet()) {
    if (value == null || ['string', 'number', 'boolean'].includes(typeof value)) return value;
    if (typeof value === 'bigint') return `${value}n`;
    if (typeof value === 'function') return `[Function ${value.name || 'anonymous'}]`;
    if (depth > 4) return '[MaxDepth]';
    if (typeof value !== 'object') return String(value);
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack };
    if (value instanceof ArrayBuffer) return { type: 'ArrayBuffer', byteLength: value.byteLength };
    if (ArrayBuffer.isView(value)) return { type: value.constructor.name, byteLength: value.byteLength };
    if (value instanceof Event) return { type: value.type, timeStamp: value.timeStamp, isTrusted: value.isTrusted };
    if (Array.isArray(value)) return value.slice(0, 50).map((item) => plain(item, depth + 1, seen));
    const out = {};
    for (const key of Object.keys(value).slice(0, 60)) {
      if (/authorization|cookie|token|secret|password|api[-_]?key/i.test(key)) out[key] = '<redacted>';
      else {
        try { out[key] = plain(value[key], depth + 1, seen); }
        catch (error) { out[key] = `[Unreadable: ${error?.message || error}]`; }
      }
    }
    return out;
  }

  function flushDomLines() {
    renderScheduled = false;
    if (!pendingDomLines.length) return;
    const box = document.querySelector('#log');
    const lines = pendingDomLines.splice(0, pendingDomLines.length);
    if (!box) return;
    const prefix = box.textContent ? '\n' : '';
    box.append(document.createTextNode(`${prefix}${lines.join('\n')}`));
    box.scrollTop = box.scrollHeight;
  }

  function queueDomLine(line) {
    pendingDomLines.push(line);
    if (renderScheduled) return;
    renderScheduled = true;
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(flushDomLines);
    else setTimeout(flushDomLines, 16);
  }

  function emit(level, category, message, data) {
    const id = ++sequence;
    const elapsed = (performance.now() - startedAt).toFixed(1).padStart(9, ' ');
    let payload = '';
    if (data !== undefined) {
      try { payload = ` | ${JSON.stringify(plain(data))}`; }
      catch (error) { payload = ` | {"serializationError":${JSON.stringify(error?.message || String(error))}}`; }
    }
    const line = `[${new Date().toISOString()}] [+${elapsed}ms] [${String(id).padStart(6, '0')}] [${level.toUpperCase()}] [${category}] ${message}${payload}`;
    entries.push(line);
    if (entries.length > 20000) entries.splice(0, entries.length - 20000);
    counters.lines += 1;
    if (level === 'warn') counters.warnings += 1;
    if (level === 'error') counters.errors += 1;
    queueDomLine(line);
    (level === 'error' ? nativeConsole.error : level === 'warn' ? nativeConsole.warn : nativeConsole.log)(`[GORICS/${category}]`, message, data ?? '');
  }

  const api = Object.freeze({
    build,
    counters,
    entries,
    info: (category, message, data) => emit('info', category, message, data),
    warn: (category, message, data) => emit('warn', category, message, data),
    error: (category, message, data) => emit('error', category, message, data),
    exportText: () => {
      flushDomLines();
      return document.querySelector('#log')?.textContent || entries.join('\n');
    },
  });
  Object.defineProperty(globalThis, 'GORICS_DIAG', { value: api, configurable: false });

  const nativeFetch = globalThis.fetch?.bind(globalThis);
  if (nativeFetch) {
    globalThis.fetch = async function goricsDiagnosticFetch(input, init) {
      const id = ++counters.fetch;
      const url = cleanUrl(input instanceof Request ? input.url : input);
      const began = performance.now();
      emit('info', 'FETCH', `#${id} start`, { method: init?.method || (input instanceof Request ? input.method : 'GET'), url });
      try {
        const response = await nativeFetch(input, init);
        emit(response.ok || response.status === 206 ? 'info' : 'warn', 'FETCH', `#${id} response`, {
          url,
          status: response.status,
          ok: response.ok,
          durationMs: Number((performance.now() - began).toFixed(2)),
          contentLength: response.headers.get('content-length'),
          contentRange: response.headers.get('content-range'),
          contentType: response.headers.get('content-type'),
        });
        return response;
      } catch (error) {
        emit('error', 'FETCH', `#${id} failed`, { url, durationMs: Number((performance.now() - began).toFixed(2)), error });
        throw error;
      }
    };
  }

  function progressSnapshot(xhr, meta, event) {
    let status = 0;
    let responseType = '';
    try { status = xhr.status; } catch {}
    try { responseType = xhr.responseType; } catch {}
    return {
      method: meta.method,
      url: meta.url,
      status,
      responseType,
      loaded: event.loaded,
      total: event.total,
      lengthComputable: event.lengthComputable,
      durationMs: meta.began ? Number((performance.now() - meta.began).toFixed(2)) : null,
    };
  }

  function shouldLogProgress(meta, event) {
    const now = performance.now();
    const loaded = Number(event.loaded) || 0;
    const total = Number(event.total) || 0;
    const percent = total > 0 ? Math.floor(loaded * 100 / total) : -1;
    const completed = total > 0 && loaded >= total;
    const elapsedEnough = now - meta.lastProgressAt >= 750;
    const bytesEnough = loaded - meta.lastProgressLoaded >= 4 * 1024 * 1024;
    const percentEnough = percent >= 0 && (meta.lastProgressPercent < 0 || percent - meta.lastProgressPercent >= 10);
    if (!completed && !elapsedEnough && !bytesEnough && !percentEnough) {
      counters.progressSuppressed += 1;
      return false;
    }
    meta.lastProgressAt = now;
    meta.lastProgressLoaded = loaded;
    meta.lastProgressPercent = percent;
    return true;
  }

  const NativeXHR = globalThis.XMLHttpRequest;
  if (NativeXHR?.prototype?.open && NativeXHR?.prototype?.send) {
    const nativeOpen = NativeXHR.prototype.open;
    const nativeSend = NativeXHR.prototype.send;
    NativeXHR.prototype.open = function goricsDiagnosticOpen(method, url, ...rest) {
      const meta = {
        id: ++counters.xhr,
        method: String(method).toUpperCase(),
        url: cleanUrl(url),
        began: 0,
        listeners: false,
        lastProgressAt: 0,
        lastProgressLoaded: 0,
        lastProgressPercent: -1,
      };
      xhrMeta.set(this, meta);
      emit('info', 'XHR', `#${meta.id} open`, { method: meta.method, url: meta.url, async: rest[0] !== false });
      return nativeOpen.call(this, method, url, ...rest);
    };
    NativeXHR.prototype.send = function goricsDiagnosticSend(body) {
      const meta = xhrMeta.get(this) || {
        id: ++counters.xhr,
        method: 'GET',
        url: '<unknown>',
        began: 0,
        listeners: false,
        lastProgressAt: 0,
        lastProgressLoaded: 0,
        lastProgressPercent: -1,
      };
      xhrMeta.set(this, meta);
      meta.began = performance.now();
      if (!meta.listeners) {
        meta.listeners = true;
        for (const type of ['loadstart', 'progress', 'abort', 'error', 'timeout', 'load', 'loadend']) {
          this.addEventListener(type, (event) => {
            const snapshot = progressSnapshot(this, meta, event);
            try {
              window.dispatchEvent(new CustomEvent('gorics:xhr-event', { detail: { id: meta.id, type, ...snapshot } }));
            } catch {}
            if (type === 'progress' && !shouldLogProgress(meta, event)) return;
            const level = type === 'error' || type === 'timeout' ? 'error' : type === 'abort' ? 'warn' : 'info';
            emit(level, 'XHR', `#${meta.id} ${type}`, snapshot);
          });
        }
      }
      emit('info', 'XHR', `#${meta.id} send`, { method: meta.method, url: meta.url, bodyBytes: body?.byteLength ?? body?.size ?? null });
      return nativeSend.call(this, body);
    };
  }

  function installToolbar() {
    if (toolbarInstalled) return;
    const panel = document.querySelector('.log-panel');
    const box = document.querySelector('#log');
    if (!panel || !box) return;
    toolbarInstalled = true;
    const bar = document.createElement('div');
    bar.style.cssText = 'display:flex;gap:.45rem;align-items:center;flex-wrap:wrap;margin:0 0 .55rem';
    const status = document.createElement('span');
    status.style.cssText = 'font:12px/1.4 ui-monospace,SFMono-Regular,Consolas,monospace;color:#94a3b8;margin-right:auto';
    const refresh = () => {
      status.textContent = `safe diagnostics · lines ${counters.lines} · fetch ${counters.fetch} · xhr ${counters.xhr} · warn ${counters.warnings} · error ${counters.errors} · sampled ${counters.progressSuppressed}`;
    };
    bar.appendChild(status);
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = '전체 로그 복사';
    button.className = 'small secondary';
    button.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(api.exportText()); emit('info', 'UI', 'full diagnostic log copied'); }
      catch (error) { emit('error', 'UI', 'diagnostic log copy failed', error); }
      refresh();
    });
    bar.appendChild(button);
    panel.insertBefore(bar, panel.firstChild);
    refresh();
    setInterval(refresh, 1000);
  }

  window.addEventListener('error', (event) => emit('error', 'WINDOW', event.message || 'window error', { filename: event.filename, lineno: event.lineno, colno: event.colno, error: event.error }));
  window.addEventListener('unhandledrejection', (event) => emit('error', 'PROMISE', 'unhandled rejection', event.reason));
  window.addEventListener('online', () => emit('info', 'NETWORK', 'browser online'));
  window.addEventListener('offline', () => emit('warn', 'NETWORK', 'browser offline'));
  document.addEventListener('visibilitychange', () => emit('info', 'EVENT', 'visibility changed', { visibility: document.visibilityState }));

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installToolbar, { once: true });
  else installToolbar();

  emit('info', 'BOOTSTRAP', 'safe diagnostics installed with sampled progress and batched DOM output', {
    build,
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    secureContext: globalThis.isSecureContext,
    wasm: Boolean(globalThis.WebAssembly),
    viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
  });
})();