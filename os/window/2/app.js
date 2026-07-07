(() => {
  'use strict';

  const statusEl = document.getElementById('status');
  const logEl = document.getElementById('log');
  const screenEl = document.getElementById('screen_container');
  const retryBtn = document.getElementById('retryBtn');
  const focusBtn = document.getElementById('focusBtn');
  const fullBtn = document.getElementById('fullBtn');

  const RUNTIME = {
    lib: '/website/vendor/v86/libv86.js',
    wasm: '/website/vendor/v86/v86.wasm',
    bios: '/website/vendor/v86/seabios.bin',
    vga: '/website/vendor/v86/vgabios.bin',
  };

  const LOCAL_CANDIDATES = [
    { url: './assets/boot.img', label: 'local assets/boot.img', type: 'hda' },
    { url: './assets/windows.img', label: 'local assets/windows.img', type: 'hda' },
    { url: './assets/windows98.img', label: 'local assets/windows98.img', type: 'hda' },
    { url: './assets/boot.iso', label: 'local assets/boot.iso', type: 'cdrom' },
  ];

  const REMOTE_FALLBACK = { url: '/website/vendor/v86/images/windows101.img', label: 'remote v86 Windows 1.01 image', type: 'hda' };

  let emulator = null;
  let started = false;
  let runtimeReady = false;
  let serialBuffer = '';

  const now = () => new Date().toISOString();
  const fmtBytes = (n) => !n ? 'unknown' : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;
  const ctor = () => (typeof window.V86Starter === 'function' ? window.V86Starter : (typeof window.V86 === 'function' ? window.V86 : null));
  const safeConfig = (cfg) => JSON.stringify(cfg, (k, v) => k === 'screen_container' ? '[HTMLElement]' : v, 2);

  function setStatus(text) { if (statusEl) statusEl.textContent = text; }
  function log(msg, level = 'info') {
    if (!logEl) return;
    const line = `[${now()}] [${level}] ${msg}`;
    logEl.textContent += `${line}\n`;
    logEl.scrollTop = logEl.scrollHeight;
    try { console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log']('[GORICS Windows VM]', msg); } catch (_) {}
  }

  function installLogButtons() {
    if (!retryBtn || document.getElementById('copyLogBtn')) return;
    const copy = document.createElement('button'); copy.id = 'copyLogBtn'; copy.textContent = '로그 복사';
    copy.onclick = async () => { try { await navigator.clipboard.writeText(logEl.textContent); log('로그 복사 완료.'); } catch (e) { log(`로그 복사 실패: ${e.message}`, 'error'); } };
    const save = document.createElement('button'); save.textContent = '로그 파일';
    save.onclick = () => { const blob = new Blob([logEl.textContent], { type: 'text/plain;charset=utf-8' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `gorics-windows-vm-log-${Date.now()}.txt`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); log('로그 파일 생성.'); };
    retryBtn.parentElement.append(copy, save);
  }

  function logEnvironment() {
    log(`page=${location.href}`);
    log(`protocol=${location.protocol} secure=${window.isSecureContext} crossOriginIsolated=${window.crossOriginIsolated}`);
    log(`ua=${navigator.userAgent}`);
    log(`wasm=${typeof WebAssembly !== 'undefined'} cores=${navigator.hardwareConcurrency || 'unknown'} memoryGB=${navigator.deviceMemory || 'unknown'}`);
    log(`runtime lib=${RUNTIME.lib}`);
    log(`fallback=${REMOTE_FALLBACK.url}`);
  }

  window.addEventListener('error', (e) => log(`window.error ${e.message || e.error || 'unknown'} at ${e.filename || ''}:${e.lineno || ''}:${e.colno || ''}`, 'error'));
  window.addEventListener('unhandledrejection', (e) => log(`unhandledrejection ${e.reason && e.reason.message ? e.reason.message : e.reason}`, 'error'));

  async function probe(url, label) {
    const t = performance.now();
    log(`probe start ${label}: ${url}`);
    try {
      const res = await fetch(url, { method: 'HEAD', cache: 'no-store', mode: 'cors' });
      log(`probe HEAD ${label}: status=${res.status} ok=${res.ok} type=${res.type} size=${fmtBytes(Number(res.headers.get('content-length') || 0))} time=${Math.round(performance.now() - t)}ms`);
      if (res.ok) return true;
    } catch (e) { log(`probe HEAD ${label} failed: ${e.name}: ${e.message}`, 'warn'); }
    try {
      const res = await fetch(url, { method: 'GET', cache: 'no-store', mode: 'cors', headers: { Range: 'bytes=0-0' } });
      const range = res.headers.get('content-range') || '';
      log(`probe RANGE ${label}: status=${res.status} ok=${res.ok} type=${res.type} range=${range || 'none'} size=${fmtBytes(Number(range.split('/')[1] || res.headers.get('content-length') || 0))} time=${Math.round(performance.now() - t)}ms`);
      return res.ok || res.status === 206;
    } catch (e) { log(`probe RANGE ${label} failed: ${e.name}: ${e.message}`, 'error'); return false; }
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (ctor() && runtimeReady) { log('runtime already available'); resolve(); return; }
      const existing = document.querySelector(`script[data-v86-src="${src}"]`);
      if (existing && existing.dataset.loaded === 'true') { runtimeReady = true; log('runtime tag already loaded'); resolve(); return; }
      const script = existing || document.createElement('script');
      script.src = src; script.async = true; script.dataset.v86Src = src;
      script.onload = () => { script.dataset.loaded = 'true'; runtimeReady = true; log('runtime script onload'); resolve(); };
      script.onerror = () => reject(new Error(`runtime script load failed: ${src}`));
      if (!existing) { log(`inject runtime script ${src}`); document.head.appendChild(script); }
    });
  }

  async function ensureV86() {
    await probe(RUNTIME.lib, 'runtime.js');
    await probe(RUNTIME.wasm, 'runtime.wasm');
    await probe(RUNTIME.bios, 'bios');
    await probe(RUNTIME.vga, 'vga-bios');
    await loadScript(RUNTIME.lib);
    log(`constructor check V86Starter=${typeof window.V86Starter} V86=${typeof window.V86}`);
    const V86Ctor = ctor();
    if (!V86Ctor) throw new Error('V86 constructor missing');
    return V86Ctor;
  }

  async function exists(item) {
    const ok = await probe(item.url, item.label);
    log(`candidate ${item.label} ok=${ok}`);
    return ok;
  }

  async function findBootAsset() {
    for (const item of LOCAL_CANDIDATES) {
      if (await exists(item)) return item;
    }
    log('로컬 이미지 없음. 원격 테스트 이미지 검사로 이동.', 'warn');
    await probe(REMOTE_FALLBACK.url, REMOTE_FALLBACK.label);
    return REMOTE_FALLBACK;
  }

  function makeConfig(asset) {
    const cfg = { wasm_path: RUNTIME.wasm, memory_size: 96 * 1024 * 1024, vga_memory_size: 8 * 1024 * 1024, screen_container: screenEl, bios: { url: RUNTIME.bios }, vga_bios: { url: RUNTIME.vga }, autostart: true };
    if (asset.type === 'cdrom' || asset.url.endsWith('.iso')) cfg.cdrom = { url: asset.url, async: true };
    else cfg.hda = { url: asset.url, async: true };
    return cfg;
  }

  function attachListeners(instance, asset) {
    const events = ['emulator-ready','emulator-started','emulator-stopped','download-start','download-progress','download-error','screen-set-mode','reset','cpu-event-halt','cpu-event-reset'];
    events.forEach((name) => {
      try { instance.add_listener(name, (ev) => { if (name === 'download-progress' && ev && ev.total) setStatus(`다운로드 ${((ev.loaded / ev.total) * 100).toFixed(1)}%`); log(`event ${name}: ${ev ? JSON.stringify(ev, (k, v) => k === 'buffer' ? '[buffer]' : v).slice(0, 500) : ''}`, name.includes('error') ? 'error' : 'info'); }); }
      catch (e) { log(`listener add failed ${name}: ${e.message}`, 'warn'); }
    });
    try {
      instance.add_listener('serial0-output-byte', (byte) => {
        const ch = String.fromCharCode(byte); serialBuffer += ch;
        if (serialBuffer.length > 160 || ch === '\n') { log(`[serial0] ${serialBuffer.replace(/\r/g, '').slice(0, 600)}`); serialBuffer = ''; }
      });
      log('serial0-output-byte listener enabled');
    } catch (e) { log(`serial listener unavailable: ${e.message}`, 'warn'); }
    log(`listeners attached asset=${asset.label}`);
  }

  function watchScreen() {
    const obs = new MutationObserver(() => log(`screen mutation children=${screenEl.children.length} canvas=${!!screenEl.querySelector('canvas')} text=${screenEl.textContent.trim().slice(0, 80) || 'none'}`));
    obs.observe(screenEl, { childList: true, subtree: true });
    setTimeout(() => { const r = screenEl.getBoundingClientRect(); log(`screen box ${Math.round(r.width)}x${Math.round(r.height)} children=${screenEl.children.length} canvas=${!!screenEl.querySelector('canvas')}`); }, 1500);
  }

  async function boot() {
    if (started) { log('start ignored: already running', 'warn'); return; }
    started = true; setStatus('진단 시작');
    if (window.location.protocol === 'file:') { setStatus('CORS 오류'); log('file:// 실행 불가. HTTP/HTTPS에서 열어야 함.', 'error'); started = false; return; }
    try {
      setStatus('런타임 검사');
      const V86Ctor = await ensureV86();
      setStatus('이미지 검사');
      const asset = await findBootAsset();
      log(`asset selected: ${asset.label} ${asset.url}`);
      const config = makeConfig(asset);
      log(`create VM config=${safeConfig(config)}`);
      screenEl.innerHTML = '';
      watchScreen();
      setStatus('VM 생성');
      emulator = new V86Ctor(config);
      window.goricsWindowsEmulator = emulator;
      attachListeners(emulator, asset);
      setStatus('실행 중');
      log('VM constructor returned. Waiting for events and guest screen.');
    } catch (error) {
      setStatus('실행 실패');
      log(`start failed: ${error && error.stack ? error.stack : error}`, 'error');
      started = false;
    }
  }

  installLogButtons();
  if (retryBtn) retryBtn.addEventListener('click', () => window.location.reload());
  if (focusBtn) focusBtn.addEventListener('click', () => { screenEl.tabIndex = 0; screenEl.focus(); log('screen focused'); });
  if (fullBtn) fullBtn.addEventListener('click', async () => { try { if (screenEl.requestFullscreen) await screenEl.requestFullscreen(); } catch (err) { log(`fullscreen failed: ${err && err.message ? err.message : err}`, 'error'); } });
  log('[ready] verbose diagnostics enabled');
  logEnvironment();
  boot();
})();