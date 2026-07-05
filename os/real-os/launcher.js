(() => {
  'use strict';

  const conf = window.REAL_OS_CONFIG;
  if (!conf) throw new Error('REAL_OS_CONFIG is required');

  const RUNTIME = {
    lib: 'https://copy.sh/v86/build/libv86.js',
    wasm: 'https://copy.sh/v86/build/v86.wasm',
    bios: 'https://copy.sh/v86/bios/seabios.bin',
    vga: 'https://copy.sh/v86/bios/vgabios.bin',
  };

  const logEl = document.getElementById('log');
  const screenEl = document.getElementById('screen');
  const bootBtn = document.getElementById('boot-btn');
  const stopBtn = document.getElementById('stop-btn');
  const fullBtn = document.getElementById('full-btn');

  let emulator = null;
  let runtimeReady = false;

  const log = (msg) => {
    const t = new Date().toISOString().slice(11, 19);
    logEl.textContent += `\n[${t}] ${msg}`;
    logEl.scrollTop = logEl.scrollHeight;
  };

  const loadScript = async () => {
    if ((window.V86Starter || window.V86) && runtimeReady) return;
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = RUNTIME.lib;
      s.async = true;
      s.onload = () => { runtimeReady = true; resolve(); };
      s.onerror = () => reject(new Error('v86 runtime load failed'));
      document.head.appendChild(s);
    });
  };

  const stop = () => {
    if (!emulator) return log('실행 중 VM 없음.');
    try {
      if (typeof emulator.destroy === 'function') emulator.destroy();
      else if (typeof emulator.stop === 'function') emulator.stop();
    } catch (e) {
      log(`stop 실패: ${e.message}`);
    }
    emulator = null;
    screenEl.innerHTML = '';
    log('VM 종료.');
  };

  const boot = async () => {
    bootBtn.disabled = true;
    log(`${conf.name} 부팅 시작...`);
    try {
      if (emulator) stop();
      screenEl.innerHTML = '';
      await loadScript();
      const Ctor = window.V86Starter || window.V86;
      if (!Ctor) throw new Error('v86 ctor missing');

      emulator = new Ctor({
        wasm_path: RUNTIME.wasm,
        bios: { url: RUNTIME.bios },
        vga_bios: { url: RUNTIME.vga },
        screen_container: screenEl,
        memory_size: conf.memory,
        vga_memory_size: conf.vgaMemory || 16 * 1024 * 1024,
        autostart: true,
        ...conf.boot,
      });

      window.goricsEmulator = emulator;
      emulator.add_listener('emulator-ready', () => log('emulator-ready'));
      emulator.add_listener('emulator-started', () => log('emulator-started'));
      emulator.add_listener('emulator-stopped', () => log('emulator-stopped'));
      emulator.add_listener('download-error', (ev) => log(`download-error ${ev && ev.url ? ev.url : ''}`));
      emulator.add_listener('download-progress', (ev) => {
        if (!ev || !ev.total) return;
        log(`download ${((ev.loaded / ev.total) * 100).toFixed(1)}%`);
      });
    } catch (e) {
      log(`부팅 실패: ${e.message}`);
    } finally {
      bootBtn.disabled = false;
    }
  };

  bootBtn.addEventListener('click', boot);
  stopBtn.addEventListener('click', stop);
  fullBtn.addEventListener('click', async () => {
    if (!document.fullscreenElement) return screenEl.requestFullscreen?.();
    return document.exitFullscreen?.();
  });

  document.getElementById('title').textContent = conf.name;
  document.getElementById('desc').textContent = conf.description;
  log('[ready] launcher loaded');
  if (conf.autoboot !== false) setTimeout(boot, 500);
})();
