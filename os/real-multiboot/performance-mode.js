(() => {
  'use strict';

  if (globalThis.__GORICS_PERFORMANCE_MODE__) return;

  const BUILD = document.querySelector('meta[name="gorics-build"]')?.content || '20260710-r19-stability';
  const ua = navigator.userAgent || '';
  const cores = Math.max(1, Number(navigator.hardwareConcurrency) || 2);
  const deviceMemory = Number(navigator.deviceMemory) || 0;
  const isIOS = /iPad|iPhone|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isCompact = matchMedia('(max-width: 900px)').matches || navigator.maxTouchPoints > 0;
  const lowMemory = deviceMemory > 0 && deviceMemory <= 4;
  const profile = isIOS || lowMemory || cores <= 4 ? 'compact' : (deviceMemory >= 8 && cores >= 8 ? 'desktop' : 'balanced');

  document.documentElement.classList.add('gorics-performance-mode', `gorics-profile-${profile}`);

  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const canWarm = !connection?.saveData && !/2g/.test(connection?.effectiveType || '');
  const warmUrls = [
    '/website/vendor/v86/libv86.js',
    '/website/vendor/v86/v86.wasm',
    '/website/vendor/v86/seabios.bin',
    '/website/vendor/v86/vgabios.bin',
    '/website/os/real-multiboot/assets/iso-meta.json',
  ];

  async function warmRuntime() {
    if (!canWarm || document.visibilityState !== 'visible') return;
    const requests = warmUrls.map((url) => fetch(`${url}?v=${encodeURIComponent(BUILD)}`, {
      cache: 'force-cache',
      priority: 'low',
    }).catch(() => null));
    await Promise.allSettled(requests);
  }

  function shieldDestructiveCleanup() {
    const cacheApi = globalThis.caches;
    const workerApi = navigator.serviceWorker;
    const nativeKeys = cacheApi?.keys?.bind(cacheApi);
    const nativeRegistrations = workerApi?.getRegistrations?.bind(workerApi);
    try { if (cacheApi?.keys) cacheApi.keys = async () => []; } catch {}
    try { if (workerApi?.getRegistrations) workerApi.getRegistrations = async () => []; } catch {}
    setTimeout(() => {
      try { if (cacheApi && nativeKeys) cacheApi.keys = nativeKeys; } catch {}
      try { if (workerApi && nativeRegistrations) workerApi.getRegistrations = nativeRegistrations; } catch {}
    }, 0);
  }

  document.querySelector('#boot-btn')?.addEventListener('click', shieldDestructiveCleanup, { capture: true });

  const scheduleWarm = () => {
    if ('requestIdleCallback' in globalThis) requestIdleCallback(warmRuntime, { timeout: 2500 });
    else setTimeout(warmRuntime, 900);
  };

  if (document.readyState === 'complete') scheduleWarm();
  else window.addEventListener('load', scheduleWarm, { once: true, passive: true });

  let resizeFrame = 0;
  const syncViewport = () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      const height = window.visualViewport?.height || window.innerHeight;
      document.documentElement.style.setProperty('--app-height', `${Math.max(320, Math.round(height))}px`);
      window.goricsPointerCalibration?.recalibrate?.();
    });
  };

  window.addEventListener('resize', syncViewport, { passive: true });
  window.visualViewport?.addEventListener('resize', syncViewport, { passive: true });
  window.visualViewport?.addEventListener('scroll', syncViewport, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) syncViewport();
  });
  syncViewport();

  globalThis.__GORICS_PERFORMANCE_MODE__ = Object.freeze({
    build: BUILD,
    profile,
    isCompact,
    isIOS,
    lowMemory,
    cores,
    deviceMemory,
    globalFetchPatched: false,
    cacheDeletionEnabled: false,
    cleanupShield: true,
    constructorPatched: false,
  });

  console.log(`[GORICS PERFORMANCE] enabled build=${BUILD} profile=${profile} cores=${cores} memory=${deviceMemory || 'unknown'}GB`);
})();
