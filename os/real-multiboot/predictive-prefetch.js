(() => {
  'use strict';

  if (globalThis.__GORICS_PREDICTIVE_PREFETCH__) return;

  const BUILD = document.querySelector('meta[name="gorics-build"]')?.content || '20260710-r19-stability';
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection || {};
  const disabled = Boolean(connection.saveData) || /slow-2g|(^|-)2g$/i.test(String(connection.effectiveType || ''));
  const presetAssets = Object.freeze({
    gorics: ['/website/os/real-multiboot/assets/vmlinuz', '/website/os/real-multiboot/assets/initrd.img'],
    buildroot: ['/website/vendor/v86/images/buildroot-bzimage68.bin'],
    'buildroot-serial': ['/website/vendor/v86/images/buildroot-bzimage68.bin'],
    dsl: ['/website/vendor/v86/images/linux4.iso'],
    'dsl-high': ['/website/vendor/v86/images/linux4.iso'],
    tiny: ['/website/vendor/v86/images/linux.iso'],
    freedos: ['/website/vendor/v86/images/freedos722.img'],
  });

  let controller = null;
  let timer = 0;
  const warmed = new Set();
  const stats = { build: BUILD, disabled, requests: 0, completed: 0, failed: 0, lastPreset: 'gorics' };

  function versioned(raw) {
    const url = new URL(raw, location.href);
    url.searchParams.set('v', BUILD);
    return url.href;
  }

  async function probe(raw, signal) {
    const url = versioned(raw);
    if (warmed.has(url)) return;
    stats.requests += 1;
    const response = await fetch(url, {
      cache: 'force-cache',
      headers: { Range: 'bytes=0-65535' },
      priority: 'low',
      signal,
    });
    if (![200, 206].includes(response.status)) throw new Error(`HTTP ${response.status}`);
    await response.arrayBuffer();
    warmed.add(url);
    stats.completed += 1;
  }

  function warmPreset(key, immediate = false) {
    if (disabled) return;
    const preset = presetAssets[key] ? key : 'gorics';
    stats.lastPreset = preset;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      const jobs = presetAssets[preset].map((asset) => probe(asset, signal).catch((error) => {
        if (error?.name !== 'AbortError') stats.failed += 1;
      }));
      await Promise.allSettled(jobs);
    }, immediate ? 0 : 180);
  }

  const select = document.querySelector('#os-select');
  const bootButton = document.querySelector('#boot-btn');
  select?.addEventListener('change', () => warmPreset(select.value), { passive: true });
  bootButton?.addEventListener('pointerenter', () => warmPreset(select?.value || 'gorics'), { passive: true });
  bootButton?.addEventListener('pointerdown', () => warmPreset(select?.value || 'gorics', true), { passive: true });
  bootButton?.addEventListener('touchstart', () => warmPreset(select?.value || 'gorics', true), { passive: true });
  window.addEventListener('pagehide', () => controller?.abort(), { once: true });

  globalThis.__GORICS_PREDICTIVE_PREFETCH__ = Object.freeze({
    build: BUILD,
    disabled,
    warmPreset,
    getStats: () => ({ ...stats, warmed: warmed.size }),
  });

  console.log(`[GORICS PREFETCH] intent-only build=${BUILD} disabled=${disabled}`);
})();
