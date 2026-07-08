(() => {
  'use strict';

  if (globalThis.__GORICS_DIAGNOSTICS_V5__) return;
  Object.defineProperty(globalThis, '__GORICS_DIAGNOSTICS_V5__', { value: true });

  const BUILD = '20260708-r5diag';
  const startedAt = performance.now();
  const nativeConsole = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };
  const nativeFetch = globalThis.fetch.bind(globalThis);
  const NativeXHR = globalThis.XMLHttpRequest;
  const entries = [];
  const pendingLines = [];
  const counters = {
    lines: 0,
    fetch: 0,
    xhr: 0,
    errors: 0,
    warnings: 0,
    resources: 0,
    longTasks: 0,
    vmEvents: 0,
    serialLines: 0,
  };

  let sequence = 0;
  let flushScheduled = false;
  let autoScroll = true;
  let vmAttached = null;
  let vmSerialBuffer = '';
  let heartbeat = 0;
  let lastHeartbeatAt = performance.now();
  let toolbar = null;
  let statusNode = null;

  const SECRET_KEYS = /authorization|cookie|set-cookie|token|secret|password|passwd|api[-_]?key/i;
  const MAX_ENTRIES = 20000;
  const MAX_VALUE = 3000;

  function elapsed() {
    return `+${(performance.now() - startedAt).toFixed(1).padStart(9, ' ')}ms`;
  }

  function sanitizeUrl(value) {
    try {
      const url = new URL(String(value), location.href);
      const queryKeys = [...url.searchParams.keys()];
      url.search = queryKeys.length ? `?${queryKeys.map((key) => `${encodeURIComponent(key)}=<redacted>`).join('&')}` : '';
      url.hash = '';
      return url.href;
    } catch {
      return String(value).replace(/([?&](?:token|key|secret|password|auth)=)[^&#]*/gi, '$1<redacted>');
    }
  }

  function normalize(value, depth = 0, seen = new WeakSet()) {
    if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
    if (typeof value === 'string') return value.length > MAX_VALUE ? `${value.slice(0, MAX_VALUE)}…<truncated>` : value;
    if (typeof value === 'bigint') return `${value}n`;
    if (typeof value === 'function') return `[Function ${value.name || 'anonymous'}]`;
    if (typeof value === 'symbol') return String(value);
    if (depth > 5) return '[MaxDepth]';
    if (typeof value !== 'object') return String(value);
    if (seen.has(value)) return '[Circular]';
    seen.add(value);

    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack,
        cause: normalize(value.cause, depth + 1, seen),
      };
    }
    if (value instanceof URL) return sanitizeUrl(value.href);
    if (value instanceof Headers) {
      const result = {};
      for (const [key, val] of value.entries()) result[key] = SECRET_KEYS.test(key) ? '<redacted>' : val;
      return result;
    }
    if (value instanceof Event) {
      return {
        type: value.type,
        timeStamp: value.timeStamp,
        isTrusted: value.isTrusted,
        target: value.target?.nodeName || value.target?.constructor?.name || null,
      };
    }
    if (ArrayBuffer.isView(value)) return { type: value.constructor.name, byteLength: value.byteLength };
    if (value instanceof ArrayBuffer) return { type: 'ArrayBuffer', byteLength: value.byteLength };
    if (Array.isArray(value)) return value.slice(0, 100).map((item) => normalize(item, depth + 1, seen));

    const result = {};
    for (const key of Object.keys(value).slice(0, 100)) {
      try {
        result[key] = SECRET_KEYS.test(key) ? '<redacted>' : normalize(value[key], depth + 1, seen);
      } catch (error) {
        result[key] = `[Unreadable: ${error?.message || error}]`;
      }
    }
    return result;
  }

  function stringify(data) {
    if (data === undefined) return '';
    try {
      const text = JSON.stringify(normalize(data));
      return text.length > 12000 ? `${text.slice(0, 12000)}…<truncated>` : text;
    } catch (error) {
      return JSON.stringify({ serializationError: error?.message || String(error) });
    }
  }

  function updateStatus() {
    if (!statusNode) return;
    statusNode.textContent = `lines ${counters.lines.toLocaleString()} · fetch ${counters.fetch} · xhr ${counters.xhr} · warn ${counters.warnings} · error ${counters.errors} · vm ${counters.vmEvents}`;
  }

  function flush() {
    flushScheduled = false;
    const box = document.querySelector('#log');
    if (!box || !pendingLines.length) return;
    const text = pendingLines.splice(0).join('\n');
    box.textContent += `${box.textContent ? '\n' : ''}${text}`;
    if (autoScroll) box.scrollTop = box.scrollHeight;
    updateStatus();
  }

  function scheduleFlush() {
    if (flushScheduled) return;
    flushScheduled = true;
    requestAnimationFrame(flush);
  }

  function emit(level, category, message, data) {
    const id = ++sequence;
    const iso = new Date().toISOString();
    const payload = stringify(data);
    const line = `[${iso}] [${elapsed()}] [${String(id).padStart(6, '0')}] [${level.toUpperCase()}] [${category}] ${message}${payload ? ` | ${payload}` : ''}`;
    entries.push({ id, iso, elapsedMs: performance.now() - startedAt, level, category, message, data: normalize(data) });
    if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
    pendingLines.push(line);
    counters.lines += 1;
    if (level === 'warn') counters.warnings += 1;
    if (level === 'error') counters.errors += 1;
    scheduleFlush();
    (level === 'error' ? nativeConsole.error : level === 'warn' ? nativeConsole.warn : nativeConsole.log)(`[GORICS/${category}]`, message, data ?? '');
    return id;
  }

  const api = {
    build: BUILD,
    entries,
    counters,
    log: (category, message, data) => emit('info', category, message, data),
    info: (category, message, data) => emit('info', category, message, data),
    warn: (category, message, data) => emit('warn', category, message, data),
    error: (category, message, data) => emit('error', category, message, data),
    snapshot,
    sanitizeUrl,
    exportText() {
      flush();
      return document.querySelector('#log')?.textContent || entries.map((entry) => JSON.stringify(entry)).join('\n');
    },
  };
  Object.defineProperty(globalThis, 'GORICS_DIAG', { value: api, configurable: false, writable: false });

  function addButton(label, title, handler) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.title = title;
    button.style.cssText = 'font:inherit;padding:.45rem .7rem;border:1px solid #334155;border-radius:.5rem;background:#111827;color:#e5e7eb;cursor:pointer';
    button.addEventListener('click', handler);
    toolbar.appendChild(button);
    return button;
  }

  function installToolbar() {
    const panel = document.querySelector('.log-panel');
    const box = document.querySelector('#log');
    if (!panel || !box || toolbar) return;
    toolbar = document.createElement('div');
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', 'Diagnostic log controls');
    toolbar.style.cssText = 'display:flex;gap:.45rem;align-items:center;flex-wrap:wrap;margin:0 0 .55rem';
    statusNode = document.createElement('span');
    statusNode.style.cssText = 'font:12px/1.4 ui-monospace,SFMono-Regular,Consolas,monospace;color:#94a3b8;margin-right:auto';
    toolbar.appendChild(statusNode);

    const autoButton = addButton('Auto-scroll: ON', 'Toggle automatic scrolling', () => {
      autoScroll = !autoScroll;
      autoButton.textContent = `Auto-scroll: ${autoScroll ? 'ON' : 'OFF'}`;
      emit('info', 'UI', 'auto-scroll changed', { enabled: autoScroll });
    });
    addButton('Snapshot', 'Record a complete diagnostic snapshot', () => void snapshot('manual'));
    addButton('Copy', 'Copy all logs to clipboard', async () => {
      try {
        await navigator.clipboard.writeText(api.exportText());
        emit('info', 'UI', 'log copied to clipboard', { characters: api.exportText().length });
      } catch (error) {
        emit('error', 'UI', 'log copy failed', error);
      }
    });
    addButton('Download', 'Download logs as a text file', () => {
      const text = api.exportText();
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `gorics-real-multiboot-${new Date().toISOString().replace(/[:.]/g, '-')}.log`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      emit('info', 'UI', 'log download created', { bytes: blob.size });
    });
    addButton('Clear', 'Clear the visible log while retaining counters', () => {
      box.textContent = '';
      emit('warn', 'UI', 'visible log cleared by user');
    });
    panel.insertBefore(toolbar, box);
    updateStatus();
  }

  function requestMeta(input, init = {}) {
    const request = input instanceof Request ? input : null;
    const headers = new Headers(init.headers || request?.headers || {});
    return {
      method: String(init.method || request?.method || 'GET').toUpperCase(),
      url: sanitizeUrl(request?.url || input),
      mode: init.mode || request?.mode || null,
      cache: init.cache || request?.cache || null,
      credentials: init.credentials || request?.credentials || null,
      redirect: init.redirect || request?.redirect || null,
      referrerPolicy: init.referrerPolicy || request?.referrerPolicy || null,
      range: headers.get('range'),
      contentType: headers.get('content-type'),
      hasSignal: Boolean(init.signal || request?.signal),
      signalAborted: Boolean((init.signal || request?.signal)?.aborted),
    };
  }

  globalThis.fetch = async function diagnosticFetch(input, init) {
    const requestId = ++counters.fetch;
    const began = performance.now();
    const meta = requestMeta(input, init);
    emit('info', 'FETCH', `#${requestId} start`, meta);
    try {
      const response = await nativeFetch(input, init);
      const durationMs = performance.now() - began;
      const length = Number(response.headers.get('content-length')) || null;
      emit(response.ok || response.status === 206 ? 'info' : 'warn', 'FETCH', `#${requestId} response`, {
        ...meta,
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        type: response.type,
        redirected: response.redirected,
        responseUrl: sanitizeUrl(response.url),
        durationMs: Number(durationMs.toFixed(2)),
        contentLength: length,
        contentRange: response.headers.get('content-range'),
        acceptRanges: response.headers.get('accept-ranges'),
        contentType: response.headers.get('content-type'),
        cacheControl: response.headers.get('cache-control'),
        age: response.headers.get('age'),
        etag: response.headers.get('etag'),
        serverTiming: response.headers.get('server-timing'),
        estimatedMbps: length && durationMs > 0 ? Number(((length * 8) / durationMs / 1000).toFixed(3)) : null,
      });
      return response;
    } catch (error) {
      emit('error', 'FETCH', `#${requestId} failed`, {
        ...meta,
        durationMs: Number((performance.now() - began).toFixed(2)),
        error,
      });
      throw error;
    }
  };

  if (NativeXHR) {
    class DiagnosticXHR extends NativeXHR {
      constructor() {
        super();
        this.__diagId = ++counters.xhr;
        this.__diagMeta = { method: null, url: null, startedAt: null };
        for (const type of ['loadstart', 'progress', 'abort', 'error', 'load', 'timeout', 'loadend']) {
          this.addEventListener(type, (event) => {
            const durationMs = this.__diagMeta.startedAt == null ? null : performance.now() - this.__diagMeta.startedAt;
            const level = type === 'error' || type === 'timeout' ? 'error' : type === 'abort' ? 'warn' : 'info';
            emit(level, 'XHR', `#${this.__diagId} ${type}`, {
              method: this.__diagMeta.method,
              url: this.__diagMeta.url,
              readyState: this.readyState,
              status: this.status,
              responseType: this.responseType,
              loaded: event.loaded,
              total: event.total,
              lengthComputable: event.lengthComputable,
              durationMs: durationMs == null ? null : Number(durationMs.toFixed(2)),
            });
          });
        }
        this.addEventListener('readystatechange', () => {
          emit('info', 'XHR', `#${this.__diagId} readyState`, {
            readyState: this.readyState,
            status: this.status,
            url: this.__diagMeta.url,
          });
        });
      }
      open(method, url, ...rest) {
        this.__diagMeta.method = String(method).toUpperCase();
        this.__diagMeta.url = sanitizeUrl(url);
        emit('info', 'XHR', `#${this.__diagId} open`, { method: this.__diagMeta.method, url: this.__diagMeta.url, async: rest[0] !== false });
        return super.open(method, url, ...rest);
      }
      send(body) {
        this.__diagMeta.startedAt = performance.now();
        emit('info', 'XHR', `#${this.__diagId} send`, {
          method: this.__diagMeta.method,
          url: this.__diagMeta.url,
          bodyType: body?.constructor?.name || null,
          bodyBytes: body?.byteLength ?? body?.size ?? (typeof body === 'string' ? body.length : null),
          timeout: this.timeout,
          withCredentials: this.withCredentials,
        });
        return super.send(body);
      }
    }
    for (const key of ['UNSENT', 'OPENED', 'HEADERS_RECEIVED', 'LOADING', 'DONE']) {
      Object.defineProperty(DiagnosticXHR, key, { value: NativeXHR[key] });
      Object.defineProperty(DiagnosticXHR.prototype, key, { value: NativeXHR[key] });
    }
    globalThis.XMLHttpRequest = DiagnosticXHR;
  }

  function environmentSnapshot() {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    return {
      build: BUILD,
      page: sanitizeUrl(location.href),
      origin: location.origin,
      referrer: sanitizeUrl(document.referrer || ''),
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      vendor: navigator.vendor,
      language: navigator.language,
      languages: navigator.languages,
      cookieEnabled: navigator.cookieEnabled,
      onLine: navigator.onLine,
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemoryGB: navigator.deviceMemory,
      maxTouchPoints: navigator.maxTouchPoints,
      webdriver: navigator.webdriver,
      crossOriginIsolated: globalThis.crossOriginIsolated,
      secureContext: globalThis.isSecureContext,
      wasm: typeof WebAssembly !== 'undefined',
      sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
      offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
      serviceWorker: 'serviceWorker' in navigator,
      caches: 'caches' in globalThis,
      screen: {
        width: screen.width,
        height: screen.height,
        availWidth: screen.availWidth,
        availHeight: screen.availHeight,
        colorDepth: screen.colorDepth,
        pixelDepth: screen.pixelDepth,
        orientation: screen.orientation?.type,
        orientationAngle: screen.orientation?.angle,
      },
      viewport: {
        innerWidth: innerWidth,
        innerHeight: innerHeight,
        outerWidth: outerWidth,
        outerHeight: outerHeight,
        devicePixelRatio,
        visualViewport: globalThis.visualViewport ? {
          width: visualViewport.width,
          height: visualViewport.height,
          scale: visualViewport.scale,
          offsetLeft: visualViewport.offsetLeft,
          offsetTop: visualViewport.offsetTop,
        } : null,
      },
      connection: connection ? {
        effectiveType: connection.effectiveType,
        type: connection.type,
        downlinkMbps: connection.downlink,
        rttMs: connection.rtt,
        saveData: connection.saveData,
      } : null,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      visibility: document.visibilityState,
      readyState: document.readyState,
    };
  }

  async function snapshot(reason = 'automatic') {
    emit('info', 'SNAPSHOT', `snapshot requested: ${reason}`, environmentSnapshot());
    try {
      if (navigator.storage?.estimate) emit('info', 'STORAGE', 'storage estimate', await navigator.storage.estimate());
    } catch (error) {
      emit('warn', 'STORAGE', 'storage estimate unavailable', error);
    }
    try {
      if (globalThis.caches?.keys) emit('info', 'CACHE', 'cache names', await caches.keys());
    } catch (error) {
      emit('warn', 'CACHE', 'cache enumeration unavailable', error);
    }
    try {
      if (navigator.serviceWorker?.getRegistrations) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        emit('info', 'SW', 'service worker registrations', registrations.map((registration) => ({
          scope: registration.scope,
          active: registration.active?.scriptURL ? sanitizeUrl(registration.active.scriptURL) : null,
          waiting: registration.waiting?.scriptURL ? sanitizeUrl(registration.waiting.scriptURL) : null,
          installing: registration.installing?.scriptURL ? sanitizeUrl(registration.installing.scriptURL) : null,
        })));
      }
    } catch (error) {
      emit('warn', 'SW', 'service worker enumeration unavailable', error);
    }
    const nav = performance.getEntriesByType('navigation')[0];
    if (nav) emit('info', 'PERF', 'navigation timing', nav.toJSON ? nav.toJSON() : nav);
    const memory = performance.memory;
    if (memory) emit('info', 'MEMORY', 'JavaScript heap', {
      usedJSHeapSize: memory.usedJSHeapSize,
      totalJSHeapSize: memory.totalJSHeapSize,
      jsHeapSizeLimit: memory.jsHeapSizeLimit,
    });
  }

  function attachVm(vm) {
    if (!vm || vmAttached === vm || typeof vm.add_listener !== 'function') return;
    vmAttached = vm;
    emit('info', 'VM', 'v86 instance detected and diagnostic listeners attached', {
      constructor: vm.constructor?.name,
      methods: Object.keys(vm).filter((key) => typeof vm[key] === 'function').slice(0, 100),
    });

    const events = [
      'emulator-loaded', 'emulator-ready', 'emulator-started', 'emulator-stopped',
      'download-progress', 'download-error', 'screen-set-mode', 'screen-set-size',
      'mouse-enable', 'mouse-disable', 'keyboard-code', 'ide-read-start', 'ide-read-end',
      'ide-write-start', 'ide-write-end', 'eth-receive-end', 'eth-transmit-end',
      '9p-attach', '9p-read-start', '9p-read-end', '9p-write-start', '9p-write-end',
    ];
    for (const name of events) {
      try {
        vm.add_listener(name, (data) => {
          counters.vmEvents += 1;
          emit(name.includes('error') ? 'error' : 'info', 'VM-EVENT', name, data);
        });
      } catch (error) {
        emit('warn', 'VM', `listener rejected: ${name}`, error);
      }
    }
    try {
      vm.add_listener('serial0-output-byte', (byte) => {
        const character = String.fromCharCode(Number(byte) & 0xff);
        if (character === '\n' || character === '\r') {
          const line = vmSerialBuffer.trimEnd();
          vmSerialBuffer = '';
          if (line) {
            counters.serialLines += 1;
            emit(/error|fail|panic|warn|segfault|fatal/i.test(line) ? 'warn' : 'info', 'SERIAL0', `line ${counters.serialLines}`, line.slice(0, 4000));
          }
        } else if (vmSerialBuffer.length < 16000) {
          vmSerialBuffer += character;
        }
      });
    } catch (error) {
      emit('warn', 'VM', 'serial listener unavailable', error);
    }
  }

  function installPerformanceObservers() {
    if (!('PerformanceObserver' in globalThis)) return;
    const supported = PerformanceObserver.supportedEntryTypes || [];
    const observe = (type, callback) => {
      if (!supported.includes(type)) return;
      try {
        const observer = new PerformanceObserver((list) => callback(list.getEntries()));
        observer.observe({ type, buffered: true });
        emit('info', 'PERF', `observer installed: ${type}`);
      } catch (error) {
        emit('warn', 'PERF', `observer failed: ${type}`, error);
      }
    };
    observe('resource', (items) => {
      for (const item of items) {
        counters.resources += 1;
        emit(item.duration > 5000 ? 'warn' : 'info', 'RESOURCE', `#${counters.resources} ${item.initiatorType || 'resource'}`, {
          name: sanitizeUrl(item.name),
          startTime: Number(item.startTime.toFixed(2)),
          durationMs: Number(item.duration.toFixed(2)),
          fetchStart: Number(item.fetchStart?.toFixed?.(2) || 0),
          responseStart: Number(item.responseStart?.toFixed?.(2) || 0),
          responseEnd: Number(item.responseEnd?.toFixed?.(2) || 0),
          transferSize: item.transferSize,
          encodedBodySize: item.encodedBodySize,
          decodedBodySize: item.decodedBodySize,
          protocol: item.nextHopProtocol,
          renderBlockingStatus: item.renderBlockingStatus,
        });
      }
    });
    observe('longtask', (items) => {
      for (const item of items) {
        counters.longTasks += 1;
        emit('warn', 'LONGTASK', `main thread blocked #${counters.longTasks}`, {
          startTime: Number(item.startTime.toFixed(2)),
          durationMs: Number(item.duration.toFixed(2)),
          attribution: item.attribution,
        });
      }
    });
    observe('paint', (items) => items.forEach((item) => emit('info', 'PAINT', item.name, { startTime: Number(item.startTime.toFixed(2)) })));
    observe('largest-contentful-paint', (items) => items.forEach((item) => emit('info', 'LCP', 'largest contentful paint', { startTime: Number(item.startTime.toFixed(2)), size: item.size })));
    observe('layout-shift', (items) => items.forEach((item) => {
      if (!item.hadRecentInput) emit('warn', 'CLS', 'layout shift', { value: item.value, startTime: Number(item.startTime.toFixed(2)) });
    }));
  }

  function installEventLogging() {
    const simpleEvents = [
      ['window', globalThis, 'load'], ['window', globalThis, 'pageshow'], ['window', globalThis, 'pagehide'],
      ['window', globalThis, 'online'], ['window', globalThis, 'offline'], ['window', globalThis, 'focus'], ['window', globalThis, 'blur'],
      ['document', document, 'DOMContentLoaded'], ['document', document, 'visibilitychange'], ['document', document, 'fullscreenchange'],
      ['screen', screen.orientation, 'change'], ['connection', navigator.connection, 'change'], ['visualViewport', globalThis.visualViewport, 'resize'],
    ];
    for (const [scope, target, type] of simpleEvents) {
      target?.addEventListener?.(type, (event) => emit('info', 'EVENT', `${scope}.${type}`, {
        event,
        visibility: document.visibilityState,
        online: navigator.onLine,
        fullscreen: Boolean(document.fullscreenElement),
        viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      }), { passive: true });
    }
    let resizeTimer = null;
    globalThis.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => emit('info', 'EVENT', 'window.resize settled', environmentSnapshot().viewport), 120);
    }, { passive: true });
    document.addEventListener('keydown', (event) => emit('info', 'INPUT', 'keydown', {
      code: event.code,
      repeat: event.repeat,
      ctrl: event.ctrlKey,
      alt: event.altKey,
      shift: event.shiftKey,
      meta: event.metaKey,
      target: event.target?.id || event.target?.nodeName,
    }), { capture: true });
    document.addEventListener('pointerdown', (event) => emit('info', 'INPUT', 'pointerdown', {
      pointerType: event.pointerType,
      button: event.button,
      buttons: event.buttons,
      x: Math.round(event.clientX),
      y: Math.round(event.clientY),
      target: event.target?.id || event.target?.nodeName,
    }), { capture: true, passive: true });
  }

  globalThis.addEventListener('error', (event) => {
    emit('error', 'GLOBAL', 'uncaught error', {
      message: event.message,
      filename: sanitizeUrl(event.filename || ''),
      lineno: event.lineno,
      colno: event.colno,
      error: event.error,
      target: event.target?.src ? sanitizeUrl(event.target.src) : event.target?.href ? sanitizeUrl(event.target.href) : event.target?.nodeName,
    });
  }, true);
  globalThis.addEventListener('unhandledrejection', (event) => emit('error', 'PROMISE', 'unhandled rejection', event.reason));
  globalThis.addEventListener('rejectionhandled', (event) => emit('warn', 'PROMISE', 'rejection handled late', { promise: String(event.promise) }));
  document.addEventListener('securitypolicyviolation', (event) => emit('error', 'CSP', 'security policy violation', {
    blockedURI: sanitizeUrl(event.blockedURI),
    violatedDirective: event.violatedDirective,
    effectiveDirective: event.effectiveDirective,
    originalPolicy: event.originalPolicy,
    sourceFile: sanitizeUrl(event.sourceFile),
    lineNumber: event.lineNumber,
    columnNumber: event.columnNumber,
  }));

  installPerformanceObservers();
  installEventLogging();

  const vmWatcher = setInterval(() => {
    installToolbar();
    attachVm(globalThis.goricsRealLinuxIso);
    heartbeat += 1;
    const now = performance.now();
    if (now - lastHeartbeatAt >= 5000) {
      lastHeartbeatAt = now;
      const canvas = document.querySelector('#screen canvas');
      emit('info', 'HEARTBEAT', `tick ${heartbeat}`, {
        documentReadyState: document.readyState,
        visibility: document.visibilityState,
        online: navigator.onLine,
        vmDetected: Boolean(globalThis.goricsRealLinuxIso),
        vmAttached: Boolean(vmAttached),
        screenChildren: document.querySelector('#screen')?.childElementCount || 0,
        canvas: canvas ? { width: canvas.width, height: canvas.height, clientWidth: canvas.clientWidth, clientHeight: canvas.clientHeight } : null,
        pendingLogLines: pendingLines.length,
        counters: { ...counters },
        heap: performance.memory ? {
          used: performance.memory.usedJSHeapSize,
          total: performance.memory.totalJSHeapSize,
          limit: performance.memory.jsHeapSizeLimit,
        } : null,
      });
    }
  }, 500);

  globalThis.addEventListener('pagehide', () => clearInterval(vmWatcher), { once: true });

  emit('info', 'BOOTSTRAP', 'GORICS exhaustive diagnostics installed', {
    build: BUILD,
    localOnly: true,
    maxEntries: MAX_ENTRIES,
    redaction: 'URL query values and secret-like header/object keys are redacted',
  });
  emit('info', 'ENV', 'initial environment', environmentSnapshot());
  queueMicrotask(() => void snapshot('startup'));
})();
