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
  let booting = false;
  let serialBuffer = '';

  const now = () => new Date().toISOString();
  const log = (msg, level = 'info') => {
    if (!logEl) return;
    const line = `[${now()}] [${level}] ${msg}`;
    logEl.textContent += `\n${line}`;
    logEl.scrollTop = logEl.scrollHeight;
    try { console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log']('[GORICS VM]', msg); } catch (_) {}
  };
  const fmtBytes = (n) => !n ? 'unknown' : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;
  const ctor = () => (typeof window.V86Starter === 'function' ? window.V86Starter : (typeof window.V86 === 'function' ? window.V86 : null));
  const listBootUrls = (boot) => Object.values(boot || {}).filter((v) => v && v.url).map((v) => v.url);
  const safeConfig = (cfg) => JSON.stringify(cfg, (k, v) => k === 'screen_container' ? '[HTMLElement]' : v, 2);

  function installLogButtons() {
    if (!bootBtn || document.getElementById('copy-log-btn')) return;
    const copy = document.createElement('button');
    copy.id = 'copy-log-btn'; copy.className = 'secondary'; copy.textContent = '로그 복사';
    copy.onclick = async () => {
      const text = logEl.textContent;
      try { await navigator.clipboard.writeText(text); log('로그를 클립보드에 복사함.'); }
      catch (e) { log(`로그 복사 실패: ${e.message}`, 'error'); }
    };
    const save = document.createElement('button');
    save.className = 'secondary'; save.textContent = '로그 파일';
    save.onclick = () => {
      const blob = new Blob([logEl.textContent], { type: 'text/plain;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `gorics-vm-log-${Date.now()}.txt`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      log('로그 파일 다운로드 생성.');
    };
    bootBtn.parentElement.append(copy, save);
  }

  function logEnvironment() {
    log(`page=${location.href}`);
    log(`protocol=${location.protocol} secure=${window.isSecureContext} crossOriginIsolated=${window.crossOriginIsolated}`);
    log(`ua=${navigator.userAgent}`);
    log(`wasm=${typeof WebAssembly !== 'undefined'} cores=${navigator.hardwareConcurrency || 'unknown'} memoryGB=${navigator.deviceMemory || 'unknown'}`);
    log(`config name=${conf.name}`);
    log(`config memory=${fmtBytes(conf.memory)} vga=${fmtBytes(conf.vgaMemory || 16 * 1024 * 1024)} autoboot=${conf.autoboot !== false}`);
    listBootUrls(conf.boot).forEach((url, i) => log(`config image[${i}]=${url}`));
  }

  window.addEventListener('error', (e) => log(`window.error ${e.message || e.error || 'unknown'} at ${e.filename || ''}:${e.lineno || ''}:${e.colno || ''}`, 'error'));
  window.addEventListener('unhandledrejection', (e) => log(`unhandledrejection ${e.reason && e.reason.message ? e.reason.message : e.reason}`, 'error'));

  async function probe(url, label) {
    const started = performance.now();
    log(`probe start ${label}: ${url}`);
    try {
      const res = await fetch(url, { method: 'HEAD', cache: 'no-store', mode: 'cors' });
      log(`probe HEAD ${label}: status=${res.status} ok=${res.ok} type=${res.type} size=${fmtBytes(Number(res.headers.get('content-length') || 0))} time=${Math.round(performance.now() - started)}ms`);
      if (res.ok) return true;
    } catch (e) {
      log(`probe HEAD ${label} failed: ${e.name}: ${e.message}`, 'warn');
    }
    try {
      const res = await fetch(url, { method: 'GET', cache: 'no-store', mode: 'cors', headers: { Range: 'bytes=0-0' } });
      const range = res.headers.get('content-range') || '';
      log(`probe RANGE ${label}: status=${res.status} ok=${res.ok} type=${res.type} range=${range || 'none'} size=${fmtBytes(Number((range.split('/')[1]) || res.headers.get('content-length') || 0))} time=${Math.round(performance.now() - started)}ms`);
      return res.ok || res.status === 206;
    } catch (e) {
      log(`probe RANGE ${label} failed: ${e.name}: ${e.message}`, 'error');
      return false;
    }
  }

  async function runPreflight() {
    log('preflight start');
    await probe(RUNTIME.lib, 'runtime.js');
    await probe(RUNTIME.wasm, 'runtime.wasm');
    await probe(RUNTIME.bios, 'bios');
    await probe(RUNTIME.vga, 'vga-bios');
    for (const [i, url] of listBootUrls(conf.boot).entries()) await probe(url, `guest-image-${i}`);
    log('preflight end');
  }

  const loadScript = async () => {
    if (ctor() && runtimeReady) { log('runtime already available'); return; }
    log(`inject runtime script: ${RUNTIME.lib}`);
    await new Promise((resolve, reject) => {
      const old = document.querySelector(`script[data-gorics-v86="${RUNTIME.lib}"]`);
      if (old && old.dataset.loaded === 'true') { resolve(); return; }
      const s = old || document.createElement('script');
      s.src = RUNTIME.lib; s.async = true; s.dataset.goricsV86 = RUNTIME.lib;
      s.onload = () => { s.dataset.loaded = 'true'; runtimeReady = true; log('runtime script onload'); resolve(); };
      s.onerror = () => reject(new Error(`runtime script load failed: ${RUNTIME.lib}`));
      if (!old) document.head.appendChild(s);
    });
    const Ctor = ctor();
    log(`constructor check: V86Starter=${typeof window.V86Starter} V86=${typeof window.V86}`);
    if (!Ctor) throw new Error('v86 constructor missing after script load');
  };

  const stop = () => {
    if (!emulator) { log('stop requested but no VM exists', 'warn'); return; }
    try {
      if (typeof emulator.destroy === 'function') emulator.destroy();
      else if (typeof emulator.stop === 'function') emulator.stop();
      log('VM stop/destroy called');
    } catch (e) { log(`stop failed: ${e.message}`, 'error'); }
    emulator = null; booting = false; serialBuffer = ''; screenEl.innerHTML = ''; log('VM state cleared');
  };

  function bindEvents() {
    const events = ['emulator-ready','emulator-started','emulator-stopped','download-start','download-progress','download-error','screen-set-mode','reset','cpu-event-halt','cpu-event-reset'];
    events.forEach((name) => {
      try { emulator.add_listener(name, (ev) => log(`event ${name}: ${ev ? JSON.stringify(ev, (k, v) => k === 'buffer' ? '[buffer]' : v).slice(0, 500) : ''}`, name.includes('error') ? 'error' : 'info')); }
      catch (e) { log(`listener add failed ${name}: ${e.message}`, 'warn'); }
    });
    try {
      emulator.add_listener('serial0-output-byte', (byte) => {
        const ch = String.fromCharCode(byte);
        serialBuffer += ch;
        if (serialBuffer.length > 160 || ch === '\n') {
          log(`[serial0] ${serialBuffer.replace(/\r/g, '').slice(0, 600)}`);
          serialBuffer = '';
        }
      });
      log('serial0-output-byte listener enabled');
    } catch (e) { log(`serial listener unavailable: ${e.message}`, 'warn'); }
  }

  function watchScreen() {
    const obs = new MutationObserver(() => {
      const canvas = screenEl.querySelector('canvas');
      log(`screen mutation children=${screenEl.children.length} canvas=${!!canvas} text=${screenEl.textContent.trim().slice(0, 80) || 'none'}`);
    });
    obs.observe(screenEl, { childList: true, subtree: true });
    setTimeout(() => {
      const r = screenEl.getBoundingClientRect();
      log(`screen box ${Math.round(r.width)}x${Math.round(r.height)} children=${screenEl.children.length} canvas=${!!screenEl.querySelector('canvas')}`);
    }, 1500);
  }

  const boot = async () => {
    if (booting) { log('start ignored: already running', 'warn'); return; }
    booting = true; bootBtn.disabled = true;
    log(`start requested: ${conf.name}`);
    try {
      if (emulator) stop();
      screenEl.innerHTML = '';
      await runPreflight();
      await loadScript();
      const Ctor = ctor();
      const cfg = {
        wasm_path: RUNTIME.wasm,
        bios: { url: RUNTIME.bios },
        vga_bios: { url: RUNTIME.vga },
        screen_container: screenEl,
        memory_size: conf.memory,
        vga_memory_size: conf.vgaMemory || 16 * 1024 * 1024,
        autostart: true,
        ...JSON.parse(JSON.stringify(conf.boot)),
      };
      log(`create VM config=${safeConfig(cfg)}`);
      watchScreen();
      emulator = new Ctor(cfg);
      window.goricsEmulator = emulator;
      bindEvents();
      log('VM constructor returned. Waiting for events and guest screen.');
    } catch (e) {
      booting = false;
      log(`start failed: ${e && e.stack ? e.stack : e}`, 'error');
    } finally { bootBtn.disabled = false; }
  };

  installLogButtons();
  document.getElementById('title').textContent = conf.name;
  document.getElementById('desc').textContent = conf.description;
  bootBtn.addEventListener('click', boot);
  stopBtn.addEventListener('click', stop);
  fullBtn.addEventListener('click', async () => {
    try { if (!document.fullscreenElement) return screenEl.requestFullscreen?.(); return document.exitFullscreen?.(); }
    catch (e) { log(`fullscreen failed: ${e.message}`, 'error'); }
  });
  log('[ready] verbose launcher loaded');
  logEnvironment();
  if (conf.autoboot !== false) setTimeout(boot, 500);
})();