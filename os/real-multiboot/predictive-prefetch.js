(() => {
  'use strict';

  if (globalThis.__GORICS_PREDICTIVE_PREFETCH__) return;

  const BUILD = '20260708-r17-predictive';
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection || {};
  const saveData = Boolean(connection.saveData);
  const slowNetwork = /(^|-)2g$|slow-2g/i.test(String(connection.effectiveType || ''));
  const compact = matchMedia('(max-width: 900px)').matches || navigator.maxTouchPoints > 0;
  const maxConcurrent = compact ? 2 : 4;
  const active = new Map();
  const finished = new Map();
  let queue = [];
  let backgroundController = new AbortController();
  const urgentController = new AbortController();
  let running = 0;
  let scheduledSelection = 0;
  let bytesWarmed = 0;

  const runtimeAssets = [
    '/website/vendor/v86/libv86.js',
    '/website/vendor/v86/v86.wasm',
    '/website/vendor/v86/seabios.bin',
    '/website/vendor/v86/vgabios.bin',
  ];

  const presetAssets = Object.freeze({
    gorics: [
      '/website/os/real-multiboot/assets/vmlinuz',
      '/website/os/real-multiboot/assets/initrd.img',
    ],
    buildroot: ['/website/vendor/v86/images/buildroot-bzimage68.bin'],
    'buildroot-serial': ['/website/vendor/v86/images/buildroot-bzimage68.bin'],
    dsl: ['/website/vendor/v86/images/linux4.iso'],
    'dsl-high': ['/website/vendor/v86/images/linux4.iso'],
    tiny: ['/website/vendor/v86/images/linux.iso'],
    freedos: ['/website/vendor/v86/images/freedos722.img'],
  });

  const stats = {
    build: BUILD,
    compact,
    saveData,
    slowNetwork,
    queued: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    bytesWarmed: 0,
    active: 0,
    lastPreset: 'gorics',
  };

  function normalizedUrl(url) {
    const absolute = new URL(url, location.href);
    const deploy = document.querySelector('meta[name="gorics-build"]')?.content || BUILD;
    absolute.searchParams.set('v', deploy);
    return absolute.href;
  }

  async function consume(job) {
    const response = await fetch(job.url, {
      cache: 'force-cache',
      credentials: 'same-origin',
      priority: job.priority,
      signal: job.urgent ? urgentController.signal : backgroundController.signal,
    });
    if (!response.ok) throw new Error(`${new URL(job.url).pathname} HTTP ${response.status}`);
    const buffer = await response.arrayBuffer();
    bytesWarmed += buffer.byteLength;
    stats.bytesWarmed = bytesWarmed;
    return buffer.byteLength;
  }

  function pump() {
    while (running < maxConcurrent && queue.length) {
      const job = queue.shift();
      if (finished.has(job.url) || active.has(job.url)) continue;
      running += 1;
      stats.active = running;
      const promise = consume(job)
        .then((size) => {
          finished.set(job.url, { size, at: performance.now(), urgent: job.urgent });
          stats.completed += 1;
          return size;
        })
        .catch((error) => {
          if (error?.name === 'AbortError') {
            stats.cancelled += 1;
          } else {
            finished.set(job.url, { error: String(error), at: performance.now(), urgent: job.urgent });
            stats.failed += 1;
          }
          return 0;
        })
        .finally(() => {
          active.delete(job.url);
          running -= 1;
          stats.active = running;
          pump();
        });
      active.set(job.url, { promise, urgent: job.urgent });
    }
  }

  function enqueue(urls, urgent = false) {
    if (saveData && !urgent) return;
    for (const rawUrl of urls) {
      const url = normalizedUrl(rawUrl);
      if (finished.has(url) || active.has(url) || queue.some((item) => item.url === url)) continue;
      queue.push({ url, priority: urgent ? 'high' : 'low', urgent });
      stats.queued += 1;
    }
    if (urgent) queue.sort((a, b) => Number(b.urgent) - Number(a.urgent));
    pump();
  }

  function cancelBackgroundWork() {
    if (!active.size && !queue.some((item) => !item.urgent)) return;
    backgroundController.abort();
    backgroundController = new AbortController();
    queue = queue.filter((item) => item.urgent);
  }

  function warmPreset(key, urgent = false) {
    const preset = presetAssets[key] ? key : 'gorics';
    stats.lastPreset = preset;
    const assets = [...runtimeAssets, ...presetAssets[preset]];
    if (!urgent) {
      enqueue(assets, false);
      return;
    }
    cancelBackgroundWork();
    setTimeout(() => enqueue(assets, true), 0);
  }

  function schedulePresetWarm(key) {
    clearTimeout(scheduledSelection);
    scheduledSelection = setTimeout(() => warmPreset(key, true), 120);
  }

  const select = document.querySelector('#os-select');
  const bootButton = document.querySelector('#boot-btn');

  select?.addEventListener('change', () => schedulePresetWarm(select.value), { passive: true });
  bootButton?.addEventListener('pointerenter', () => warmPreset(select?.value || 'gorics', true), { passive: true });
  bootButton?.addEventListener('pointerdown', () => warmPreset(select?.value || 'gorics', true), { passive: true });
  bootButton?.addEventListener('touchstart', () => warmPreset(select?.value || 'gorics', true), { passive: true });
  window.addEventListener('pagehide', () => {
    backgroundController.abort();
    urgentController.abort();
  }, { once: true });

  const initialWarm = () => {
    enqueue(runtimeAssets, false);
    if (!slowNetwork || !compact) enqueue(presetAssets.gorics, false);
  };

  if ('requestIdleCallback' in globalThis) {
    requestIdleCallback(initialWarm, { timeout: 700 });
  } else {
    setTimeout(initialWarm, 250);
  }

  globalThis.__GORICS_PREDICTIVE_PREFETCH__ = Object.freeze({
    ...stats,
    warmPreset,
    getStats: () => ({
      ...stats,
      bytesWarmed,
      active: running,
      queueDepth: queue.length,
      finished: finished.size,
    }),
  });

  console.log(`[GORICS PREFETCH] enabled build=${BUILD} compact=${compact} saveData=${saveData} network=${connection.effectiveType || 'unknown'}`);
})();
