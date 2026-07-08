(() => {
  'use strict';

  if (globalThis.__GORICS_PERFORMANCE_MODE__) return;
  const BUILD = '20260708-r15-performance';
  const isCompact = matchMedia('(max-width: 900px)').matches || navigator.maxTouchPoints > 0;
  const lowMemory = Number(navigator.deviceMemory || 0) > 0 && Number(navigator.deviceMemory) <= 4;
  const logBox = document.querySelector('#log');

  globalThis.__GORICS_PERFORMANCE_MODE__ = Object.freeze({ build: BUILD, isCompact, lowMemory });
  document.documentElement.classList.add('gorics-performance-mode');

  // app.js historically used `log.textContent += line`, which copies and lays out
  // the entire log on every message. Keep a virtual bounded string and paint it
  // at most ten times per second instead.
  if (logBox) {
    const descriptor = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent');
    const nativeGet = descriptor?.get?.bind(logBox);
    const nativeSet = descriptor?.set?.bind(logBox);
    let value = nativeGet ? nativeGet() : '';
    let timer = 0;
    let lastPaint = 0;
    const maxCharacters = isCompact ? 32_000 : 80_000;

    const paint = () => {
      timer = 0;
      lastPaint = performance.now();
      if (nativeSet) nativeSet(value);
      logBox.scrollTop = logBox.scrollHeight;
    };

    const schedulePaint = () => {
      if (timer) return;
      const wait = Math.max(0, 100 - (performance.now() - lastPaint));
      timer = window.setTimeout(paint, wait);
    };

    try {
      Object.defineProperty(logBox, 'textContent', {
        configurable: true,
        get: () => value,
        set: (next) => {
          value = String(next ?? '');
          if (value.length > maxCharacters) {
            const cut = value.indexOf('\n', value.length - maxCharacters);
            value = value.slice(cut >= 0 ? cut + 1 : -maxCharacters);
          }
          schedulePaint();
        },
      });
    } catch {
      // Older WebKit can reject an own accessor on a DOM node. The rest of the
      // performance patches still apply.
    }
  }

  // The assets are immutable per deployment. Run expensive Cache API cleanup
  // only once per tab instead of on every VM restart.
  if (globalThis.caches?.keys) {
    const nativeKeys = globalThis.caches.keys.bind(globalThis.caches);
    globalThis.caches.keys = async () => {
      const key = `gorics-cache-scan:${BUILD}`;
      try {
        if (sessionStorage.getItem(key) === 'done') return [];
        const names = await nativeKeys();
        sessionStorage.setItem(key, 'done');
        return names;
      } catch {
        return nativeKeys();
      }
    };
  }

  // app.js checks display readiness every 250 ms. On touch devices that causes
  // needless style/layout reads while v86 is already using the main thread.
  const nativeSetInterval = globalThis.setInterval.bind(globalThis);
  globalThis.setInterval = (callback, delay, ...args) => {
    let nextDelay = Number(delay) || 0;
    if (isCompact && nextDelay <= 250 && typeof callback === 'function' && /completeDisplay/.test(Function.prototype.toString.call(callback))) {
      nextDelay = 750;
    }
    return nativeSetInterval(callback, nextDelay, ...args);
  };

  // Cap the large GUI VM on phones/tablets. 256 MB + 16 MB VGA avoids iOS
  // memory pressure while leaving desktop allocations unchanged.
  const optimizeOptions = (options = {}) => {
    if (!isCompact && !lowMemory) return options;
    const optimized = { ...options, disable_speaker: true };
    const memoryCap = (isCompact || lowMemory ? 256 : 320) * 1024 * 1024;
    const vgaCap = 16 * 1024 * 1024;
    if (Number(optimized.memory_size) > memoryCap) optimized.memory_size = memoryCap;
    if (Number(optimized.vga_memory_size) > vgaCap) optimized.vga_memory_size = vgaCap;
    return optimized;
  };

  const wrapConstructor = (Native) => {
    if (typeof Native !== 'function' || Native.__goricsOptimized) return Native;
    function GoricsOptimizedV86(options) {
      return new Native(optimizeOptions(options));
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

  // Hide the heavy live log while a VM is rendering on compact devices.
  const screen = document.querySelector('#screen');
  if (screen && isCompact) {
    const syncRunningClass = () => document.body.classList.toggle('gorics-vm-active', screen.classList.contains('active'));
    new MutationObserver(syncRunningClass).observe(screen, { attributes: true, attributeFilter: ['class'] });
    syncRunningClass();
  }

  // Warm immutable runtime assets during idle time. Skip this on data-saver
  // connections to avoid competing with a user's immediate boot request.
  const warm = () => {
    if (navigator.connection?.saveData) return;
    const version = document.querySelector('meta[name="gorics-build"]')?.content || BUILD;
    const urls = [
      `/website/vendor/v86/libv86.js?v=${version}`,
      `/website/vendor/v86/v86.wasm?v=${version}`,
      `/website/vendor/v86/seabios.bin?v=${version}`,
      `/website/vendor/v86/vgabios.bin?v=${version}`,
    ];
    Promise.allSettled(urls.map((url) => fetch(url, { cache: 'force-cache', priority: 'low' }).then((response) => {
      if (!response.ok) throw new Error(`${url} HTTP ${response.status}`);
      return response.arrayBuffer();
    }))).catch(() => {});
  };
  if ('requestIdleCallback' in globalThis) requestIdleCallback(warm, { timeout: 2500 });
  else setTimeout(warm, 1200);

  console.log(`[GORICS PERFORMANCE] enabled build=${BUILD} compact=${isCompact} lowMemory=${lowMemory}`);
})();
