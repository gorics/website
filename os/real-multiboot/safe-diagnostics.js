(() => {
  'use strict';

  if (globalThis.__GORICS_SAFE_DIAGNOSTICS__) return;
  Object.defineProperty(globalThis, '__GORICS_SAFE_DIAGNOSTICS__', { value: true });

  const build = document.querySelector('meta[name="gorics-build"]')?.content?.trim() || 'dev';
  const startedAt = performance.now();
  const entries = [];
  const counters = { lines: 0, warnings: 0, errors: 0 };
  const MAX_ENTRIES = 600;

  function serialise(value) {
    if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack };
    if (value == null || ['string', 'number', 'boolean'].includes(typeof value)) return value;
    try {
      return JSON.parse(JSON.stringify(value, (key, item) => {
        if (/authorization|cookie|token|secret|password|api[-_]?key/i.test(key)) return '<redacted>';
        if (item instanceof Error) return { name: item.name, message: item.message, stack: item.stack };
        if (item instanceof ArrayBuffer) return { type: 'ArrayBuffer', byteLength: item.byteLength };
        if (ArrayBuffer.isView(item)) return { type: item.constructor.name, byteLength: item.byteLength };
        return item;
      }));
    } catch {
      return String(value);
    }
  }

  function emit(level, category, message, data) {
    counters.lines += 1;
    if (level === 'warn') counters.warnings += 1;
    if (level === 'error') counters.errors += 1;
    const elapsed = Math.round(performance.now() - startedAt);
    const payload = data === undefined ? '' : ` | ${JSON.stringify(serialise(data))}`;
    const line = `[+${elapsed}ms] [${level.toUpperCase()}] [${category}] ${message}${payload}`;
    entries.push(line);
    if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
    const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
    console[method](`[GORICS/${category}]`, message, data ?? '');
  }

  const api = Object.freeze({
    build,
    counters,
    entries,
    info: (category, message, data) => emit('info', category, message, data),
    warn: (category, message, data) => emit('warn', category, message, data),
    error: (category, message, data) => emit('error', category, message, data),
    exportText: () => {
      const appLog = document.querySelector('#log')?.textContent || '';
      return `${appLog}\n${entries.join('\n')}`.trim();
    },
  });
  Object.defineProperty(globalThis, 'GORICS_DIAG', { value: api, configurable: false });

  // Keep Fetch and XMLHttpRequest completely native. Wrapping every v86 range
  // and progress event created measurable main-thread overhead on phones.
  window.addEventListener('error', (event) => emit('error', 'WINDOW', event.message || 'window error', {
    filename: event.filename,
    line: event.lineno,
    column: event.colno,
    error: event.error,
  }));
  window.addEventListener('unhandledrejection', (event) => emit('error', 'PROMISE', 'unhandled rejection', event.reason));
  window.addEventListener('offline', () => emit('warn', 'NETWORK', 'browser offline'));
  window.addEventListener('online', () => emit('info', 'NETWORK', 'browser online'));

  emit('info', 'BOOTSTRAP', 'low-overhead diagnostics installed; native fetch and XMLHttpRequest preserved', {
    build,
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    secureContext: globalThis.isSecureContext,
    wasm: Boolean(globalThis.WebAssembly),
    viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
  });
})();
