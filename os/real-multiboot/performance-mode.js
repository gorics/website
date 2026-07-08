(() => {
  'use strict';

  if (globalThis.__GORICS_PERFORMANCE_MODE__) return;

  const BUILD = '20260708-r16-ultra';
  const ua = navigator.userAgent || '';
  const cores = Math.max(1, Number(navigator.hardwareConcurrency) || 2);
  const deviceMemory = Number(navigator.deviceMemory) || 0;
  const isIOS = /iPad|iPhone|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isCompact = matchMedia('(max-width: 900px)').matches || navigator.maxTouchPoints > 0;
  const lowMemory = deviceMemory > 0 && deviceMemory <= 4;
  const constrained = isIOS || lowMemory || cores <= 4;
  const profile = constrained ? 'ultra' : isCompact ? 'mobile' : 'desktop';
  const logBox = document.querySelector('#log');
  const responseCache = new Map();
  const nativeFetch = globalThis.fetch?.bind(globalThis);

  document.documentElement.classList.add('gorics-performance-mode', `gorics-profile-${profile}`);

  function requestInfo(input, init = {}) {
    try {
      const request = typeof Request !== 'undefined' && input instanceof Request ? input : null;
      const url = new URL(request ? request.url : String(input), location.href);
      const method = String(init.method || request?.method || 'GET').toUpperCase();
      const headers = new Headers(init.headers || request?.headers || undefined);
      const range = headers.get('range') || '';
      return { request, url, method, range };
    } catch {
      return null;
    }
  }

  function cacheKey(info) {
    if (!info) return '';
    const path = info.url.pathname;
    if (info.url.origin === location.origin) {
      if (info.method === 'HEAD' && (
        path.startsWith('/website/vendor/v86/') ||
        path === '/website/os/real-multiboot/assets/vmlinuz' ||
        path === '/website/os/real-multiboot/assets/initrd.img'
      )) return `HEAD:${path}`;
      if (info.method === 'GET' && !info.range && path === '/website/os/real-multiboot/assets/iso-meta.json') return `GET:${path}`;
      if (info.method === 'GET' && /^bytes=0-(1023|4095)$/i.test(info.range) && path.startsWith('/website/vendor/v86/images/')) {
        return `RANGE:${path}:${info.range.toLowerCase()}`;
      }
    }
    if (
      info.method === 'GET' &&
      /^(bytes=32768-36863|bytes=0-15)$/i.test(info.range) &&
      /\/v86-parts\/gorics-linux-gui-web-i386-r12-\d+-\d+\.iso$/i.test(path) &&
      /(?:^|\.)jsdelivr\.net$|raw\.githubusercontent\.com$|cdn\.statically\.io$/i.test(info.url.hostname)
    ) return `ISO:${info.url.origin}${path}:${info.range.toLowerCase()}`;
    return '';
  }

  if (nativeFetch) {
    globalThis.fetch = async function goricsPerformanceFetch(input, init = {}) {
      const info = requestInfo(input, init);
      const key = cacheKey(info);
      if (!key) return nativeFetch(input, init);
      if (!responseCache.has(key)) {
        const requestInit = { ...init, cache: 'force-cache' };
        responseCache.set(key, nativeFetch(input, requestInit).then((response) => {
          if (!response.ok && response.status !== 206) throw new Error(`${key} HTTP ${response.status}`);
          return response;
        }).catch((error) => {
          responseCache.delete(key);
          throw error;
        }));
      }
      return (await responseCache.get(key)).clone();
    };
  }

  if (logBox) {
    const descriptor = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent');
    const nativeGet = descriptor?.get?.bind(logBox);
    const nativeSet = descriptor?.set?.bind(logBox);
    let value = nativeGet ? nativeGet() : '';
    let timer = 0;
    let lastPaint = 0;
    let lastAccepted = 0;
    const maxCharacters = profile === 'ultra' ? 8_000 : profile === 'mobile' ? 16_000 : 48_000;
    const paintInterval = profile === 'ultra' ? 300 : profile === 'mobile' ? 180 : 100;

    const paint = () => {
      timer = 0;
      lastPaint = performance.now();
      if (nativeSet) nativeSet(value);
      if (!document.body.classList.contains('gorics-vm-active')) logBox.scrollTop = logBox.scrollHeight;
    };

    const schedulePaint = () => {
      if (timer) return;
      timer = window.setTimeout(paint, Math.max(0, paintInterval - (performance.now() - lastPaint)));
    };

    try {
      Object.defineProperty(logBox, 'textContent', {
        configurable: true,
        get: () => value,
        set: (next) => {
          const candidate = String(next ?? '');
          const appended = candidate.startsWith(value) ? candidate.slice(value.length) : candidate;
          const now = performance.now();
          const critical = /\b(ERROR|WARN)\b|state changed|boot requested|emulator-(loaded|ready|started|stopped)|screen-set-size|display ready|serial |stage step=(prepare|runtime|media|emulator|display)/i.test(appended);
          const noisyBootProgress = /download-progress|stage step=boot/i.test(appended);
          if (document.body.classList.contains('gorics-vm-active') && !critical) {
            const minimumGap = noisyBootProgress ? 1200 : 2500;
            if (now - lastAccepted < minimumGap) return;
          }
          lastAccepted = now;
          value = candidate.length > maxCharacters ? candidate.slice(-maxCharacters) : candidate;
          schedulePaint();
        },
      });
    } catch {}
  }

  const realCacheKeys = globalThis.caches?.keys?.bind(globalThis.caches);
  if (globalThis.caches?.keys) {
    try { globalThis.caches.keys = async () => []; } catch {}
  }
  const serviceWorker = navigator.serviceWorker;
  const realRegistrations = serviceWorker?.getRegistrations?.bind(serviceWorker);
  if (serviceWorker?.getRegistrations) {
    try { serviceWorker.getRegistrations = async () => []; } catch {}
  }

  const deferredCleanup = async () => {
    if (document.body.classList.contains('gorics-vm-active')) return;
    try {
      const registrations = await realRegistrations?.() || [];
      await Promise.allSettled(registrations
        .filter((item) => item.scope.includes('/os/real-multiboot/'))
        .map((item) => item.unregister()));
      const names = await realCacheKeys?.() || [];
      await Promise.allSettled(names.filter((name) => /gorics|v86|iso/i.test(name)).map((name) => caches.delete(name)));
    } catch {}
  };
  window.setTimeout(() => {
    if ('requestIdleCallback' in globalThis) requestIdleCallback(deferredCleanup, { timeout: 15000 });
    else deferredCleanup();
  }, 30000);

  const nativeSetInterval = globalThis.setInterval.bind(globalThis);
  globalThis.setInterval = (callback, delay, ...args) => {
    let nextDelay = Number(delay) || 0;
    const source = typeof callback === 'function' ? Function.prototype.toString.call(callback) : '';
    if (/completeDisplay/.test(source) && nextDelay <= 250) nextDelay = profile === 'ultra' ? 1000 : profile === 'mobile' ? 700 : 400;
    return nativeSetInterval(callback, nextDelay, ...args);
  };

  function optimizedMemory(options) {
    const hasCustomGui = Boolean(options.initrd && options.cdrom);
    const hasKernelOnly = Boolean(options.bzimage && !options.initrd);
    const hasDisk = Boolean(options.hda);
    const hasCdromOnly = Boolean(options.cdrom && !options.initrd);

    if (hasCustomGui) {
      if (profile === 'ultra') return { memory: 224, vga: 12 };
      if (profile === 'mobile') return { memory: 256, vga: 16 };
      return { memory: 320, vga: 24 };
    }
    if (hasKernelOnly) return { memory: profile === 'desktop' ? 112 : 96, vga: 4 };
    if (hasDisk) return { memory: 48, vga: 4 };
    if (hasCdromOnly) return { memory: profile === 'desktop' ? 192 : 160, vga: profile === 'desktop' ? 12 : 8 };
    return { memory: profile === 'desktop' ? 256 : 192, vga: 8 };
  }

  const optimizeOptions = (options = {}) => {
    const optimized = { ...options, disable_speaker: true };
    const target = optimizedMemory(optimized);
    const memoryCap = target.memory * 1024 * 1024;
    const vgaCap = target.vga * 1024 * 1024;
    optimized.memory_size = Math.min(Number(optimized.memory_size) || memoryCap, memoryCap);
    optimized.vga_memory_size = Math.min(Number(optimized.vga_memory_size) || vgaCap, vgaCap);
    return optimized;
  };

  const wrapConstructor = (Native) => {
    if (typeof Native !== 'function' || Native.__goricsOptimized) return Native;
    function GoricsOptimizedV86(options) {
      const optimized = optimizeOptions(options);
      globalThis.__GORICS_LAST_VM_OPTIONS__ = Object.freeze({
        memory_size: optimized.memory_size,
        vga_memory_size: optimized.vga_memory_size,
        has_initrd: Boolean(optimized.initrd),
        has_cdrom: Boolean(optimized.cdrom),
        has_bzimage: Boolean(optimized.bzimage),
        has_hda: Boolean(optimized.hda),
      });
      return new Native(optimized);
    }
    try { Object.setPrototypeOf(GoricsOptimizedV86, Native); } catch {}
    GoricsOptimizedV86.prototype = Native.prototype;
    Object.defineProperty(GoricsOptimizedV86, '__goricsOptimized', { value: true });
    return GoricsOptimizedV86;
  };

  for (const name of ['V86', 'V86Starter']) {
    let current = globalThis[name];
    if (current) current = wrapConstructor(current);
    try {
      Object.defineProperty(globalThis, name, {
        configurable: true,
        get: () => current,
        set: (value) => { current = wrapConstructor(value); },
      });
    } catch {}
  }

  const screen = document.querySelector('#screen');
  if (screen) {
    const syncRunningClass = () => document.body.classList.toggle('gorics-vm-active', screen.classList.contains('active'));
    new MutationObserver(syncRunningClass).observe(screen, { attributes: true, attributeFilter: ['class'] });
    syncRunningClass();
  }

  const warm = async () => {
    if (navigator.connection?.saveData || !nativeFetch) return;
    const version = document.querySelector('meta[name="gorics-build"]')?.content || BUILD;
    const headUrls = [
      '/website/os/real-multiboot/assets/vmlinuz',
      '/website/os/real-multiboot/assets/initrd.img',
      '/website/vendor/v86/libv86.js',
      '/website/vendor/v86/v86.wasm',
      '/website/vendor/v86/seabios.bin',
      '/website/vendor/v86/vgabios.bin',
    ].map((url) => `${url}?v=${encodeURIComponent(version)}`);
    const isoRoot = 'https://cdn.jsdelivr.net/gh/gorics/website@os-assets/os/real-multiboot/assets/v86-parts/';
    const requests = [
      ...headUrls.map((url) => fetch(url, { method: 'HEAD', cache: 'force-cache', priority: 'low' })),
      fetch(`/website/os/real-multiboot/assets/iso-meta.json?v=${encodeURIComponent(version)}`, { cache: 'force-cache', priority: 'low' }),
      fetch(`/website/vendor/v86/images/buildroot-bzimage68.bin?v=${encodeURIComponent(version)}`, {
        headers: { Range: 'bytes=0-1023' }, cache: 'force-cache', priority: 'low',
      }),
      fetch(`${isoRoot}gorics-linux-gui-web-i386-r12-0-16777216.iso?v=${encodeURIComponent(version)}`, {
        headers: { Range: 'bytes=32768-36863' }, cache: 'force-cache', priority: 'low',
      }),
      fetch(`${isoRoot}gorics-linux-gui-web-i386-r12-335544320-352321536.iso?v=${encodeURIComponent(version)}`, {
        headers: { Range: 'bytes=0-15' }, cache: 'force-cache', priority: 'low',
      }),
    ];
    await Promise.allSettled(requests);
  };
  if ('requestIdleCallback' in globalThis) requestIdleCallback(warm, { timeout: 1800 });
  else setTimeout(warm, 700);

  globalThis.__GORICS_PERFORMANCE_MODE__ = Object.freeze({
    build: BUILD,
    profile,
    isCompact,
    isIOS,
    lowMemory,
    cores,
    deviceMemory,
    preflightCache: true,
    isoProbeWarm: true,
    bootCleanupDeferred: true,
    cachedPreflights: () => responseCache.size,
  });

  console.log(`[GORICS PERFORMANCE] enabled build=${BUILD} profile=${profile} cores=${cores} memory=${deviceMemory || 'unknown'}GB`);
})();
