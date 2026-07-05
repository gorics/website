(() => {
  'use strict';

  const V86_RUNTIME = {
    name: 'copy.sh v86 runtime',
    lib: 'https://copy.sh/v86/build/libv86.js',
    wasm: 'https://copy.sh/v86/build/v86.wasm',
    bios: 'https://copy.sh/v86/bios/seabios.bin',
    vga: 'https://copy.sh/v86/bios/vgabios.bin',
  };

  const OFFICIAL_V86_BASE = 'https://copy.sh/v86/';

  const OS_PRESETS = [
    {
      id: 'dsl-linux-gui',
      label: 'Damn Small Linux GUI ISO (기본 GUI)',
      detail: 'DSL 4.11.rc2 실제 Linux GUI ISO입니다. 실패 시 Tiny Linux로 자동 대체합니다.',
      memorySize: 256 * 1024 * 1024,
      vgaMemorySize: 16 * 1024 * 1024,
      officialProfile: 'dsl',
      fallbackPresetId: 'tiny-linux-iso',
      setup: { cdrom: { url: 'https://i.copy.sh/dsl-4.11.rc2.iso', size: 52824064, async: true } },
    },
    {
      id: 'tiny-linux-iso',
      label: 'Tiny v86 Linux ISO',
      detail: 'v86 공식 테스트용 작은 Linux ISO입니다.',
      memorySize: 128 * 1024 * 1024,
      vgaMemorySize: 8 * 1024 * 1024,
      officialProfile: 'linux',
      fallbackPresetId: 'buildroot-kernel',
      setup: { cdrom: { url: 'https://i.copy.sh/linux4.iso', size: 7731200, async: true } },
    },
    {
      id: 'buildroot-kernel',
      label: 'Buildroot Linux 6.8 (빠른 검증용)',
      detail: '가장 빠르게 부팅 확인 가능한 Linux 커널입니다. GUI는 아니지만 v86 호환성 확인에 안정적입니다.',
      memorySize: 128 * 1024 * 1024,
      vgaMemorySize: 8 * 1024 * 1024,
      officialProfile: 'buildroot',
      setup: { bzimage: { url: 'https://i.copy.sh/buildroot-bzimage68.bin', size: 10068480, async: false }, cmdline: 'rw root=/dev/ram0 console=ttyS0 console=tty0' },
    },
    {
      id: 'freedos',
      label: 'FreeDOS 7.22',
      detail: '작고 안정적인 플로피 이미지입니다.',
      memorySize: 64 * 1024 * 1024,
      vgaMemorySize: 4 * 1024 * 1024,
      officialProfile: 'freedos',
      setup: { fda: { url: 'https://i.copy.sh/freedos722.img', size: 737280, async: false } },
    },
    {
      id: 'windows101',
      label: 'Windows 1.01',
      detail: 'v86 공식 테스트 Windows 이미지입니다.',
      memorySize: 64 * 1024 * 1024,
      vgaMemorySize: 4 * 1024 * 1024,
      officialProfile: 'windows1',
      setup: { fda: { url: 'https://i.copy.sh/windows101.img', size: 1474560, async: false } },
    },
  ];

  const logEl = document.getElementById('log');
  const selectEl = document.getElementById('os-select');
  const bootBtn = document.getElementById('boot-btn');
  const stopBtn = document.getElementById('stop-btn');
  const fullscreenBtn = document.getElementById('fullscreen-btn');
  const screenEl = document.getElementById('screen');
  const hintEl = document.getElementById('preset-detail');

  let emulator = null;
  let runtimeReady = false;
  let autoBooted = false;
  let serialBuffer = '';
  let screenObserver = null;
  let bootToken = 0;
  let fallbackInProgress = false;

  const now = () => new Date().toISOString();
  const ctor = () => (typeof window.V86Starter === 'function' ? window.V86Starter : (typeof window.V86 === 'function' ? window.V86 : null));
  const fmtBytes = (n) => !n ? 'unknown' : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;
  const selectedPreset = () => OS_PRESETS.find((item) => item.id === selectEl.value) || OS_PRESETS[0];
  const cloneSetup = (setup) => JSON.parse(JSON.stringify(setup));
  const bootUrls = (setup) => Object.values(setup || {}).filter((v) => v && v.url).map((v) => v.url);
  const safeConfig = (cfg) => JSON.stringify(cfg, (k, v) => k === 'screen_container' ? '[HTMLElement]' : v, 2);
  const officialUrl = (profile) => `${OFFICIAL_V86_BASE}?profile=${encodeURIComponent(profile)}`;

  function appendLog(message, level = 'info') {
    const line = `[${now()}] [${level}] ${message}`;
    if (logEl) {
      logEl.textContent += `\n${line}`;
      logEl.scrollTop = logEl.scrollHeight;
    }
    try { console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log']('[GORICS multiboot]', message); } catch (_) {}
  }

  function installLogButtons() {
    if (!bootBtn || document.getElementById('copy-log-btn')) return;
    const copy = document.createElement('button');
    copy.id = 'copy-log-btn';
    copy.className = 'secondary';
    copy.type = 'button';
    copy.textContent = '로그 복사';
    copy.onclick = async () => {
      try { await navigator.clipboard.writeText(logEl.textContent); appendLog('로그 복사 완료.'); }
      catch (e) { appendLog(`로그 복사 실패: ${e.message}`, 'error'); }
    };

    const save = document.createElement('button');
    save.className = 'secondary';
    save.type = 'button';
    save.textContent = '로그 파일';
    save.onclick = () => {
      const blob = new Blob([logEl.textContent], { type: 'text/plain;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `gorics-multiboot-log-${Date.now()}.txt`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      appendLog('로그 파일 생성.');
    };

    const official = document.createElement('a');
    official.id = 'official-v86-link';
    official.className = 'btn secondary official-v86-link';
    official.target = '_blank';
    official.rel = 'noopener noreferrer';
    official.textContent = '공식 프로필';
    bootBtn.parentElement.append(copy, save, official);
  }

  function updatePresetDetail() {
    const preset = selectedPreset();
    const official = document.getElementById('official-v86-link');
    if (hintEl) hintEl.textContent = `${preset.detail} / RAM ${fmtBytes(preset.memorySize)} / VGA ${fmtBytes(preset.vgaMemorySize)} / 이미지 ${bootUrls(preset.setup).join(', ')}`;
    if (official) official.href = officialUrl(preset.officialProfile);
    appendLog(`preset selected id=${preset.id} label=${preset.label}`);
  }

  function logEnvironment() {
    appendLog('[ready] verbose diagnostics enabled.');
    appendLog(`page=${location.href}`);
    appendLog(`protocol=${location.protocol} secure=${window.isSecureContext} crossOriginIsolated=${window.crossOriginIsolated}`);
    appendLog(`ua=${navigator.userAgent}`);
    appendLog(`wasm=${typeof WebAssembly !== 'undefined'} cores=${navigator.hardwareConcurrency || 'unknown'} memoryGB=${navigator.deviceMemory || 'unknown'}`);
    appendLog(`runtime lib=${V86_RUNTIME.lib}`);
  }

  window.addEventListener('error', (e) => appendLog(`window.error ${e.message || e.error || 'unknown'} at ${e.filename || ''}:${e.lineno || ''}:${e.colno || ''}`, 'error'));
  window.addEventListener('unhandledrejection', (e) => appendLog(`unhandledrejection ${e.reason && e.reason.message ? e.reason.message : e.reason}`, 'error'));

  async function probe(url, label) {
    const started = performance.now();
    appendLog(`probe start ${label}: ${url}`);
    try {
      const res = await fetch(url, { method: 'HEAD', cache: 'no-store', mode: 'cors' });
      appendLog(`probe HEAD ${label}: status=${res.status} ok=${res.ok} type=${res.type} size=${fmtBytes(Number(res.headers.get('content-length') || 0))} time=${Math.round(performance.now() - started)}ms`);
      if (res.ok) return true;
    } catch (e) { appendLog(`probe HEAD ${label} failed: ${e.name}: ${e.message}`, 'warn'); }
    try {
      const res = await fetch(url, { method: 'GET', cache: 'no-store', mode: 'cors', headers: { Range: 'bytes=0-0' } });
      const range = res.headers.get('content-range') || '';
      appendLog(`probe RANGE ${label}: status=${res.status} ok=${res.ok} type=${res.type} range=${range || 'none'} time=${Math.round(performance.now() - started)}ms`);
      return res.ok || res.status === 206;
    } catch (e) { appendLog(`probe RANGE ${label} failed: ${e.name}: ${e.message}`, 'warn'); return false; }
  }

  async function runDiagnostics(preset) {
    const checks = [
      ['runtime.js', V86_RUNTIME.lib],
      ['runtime.wasm', V86_RUNTIME.wasm],
      ['bios', V86_RUNTIME.bios],
      ['vga-bios', V86_RUNTIME.vga],
      ...bootUrls(preset.setup).map((url, i) => [`guest-image-${i}`, url]),
    ];
    appendLog(`diagnostics start preset=${preset.id}`);
    const results = await Promise.all(checks.map(async ([name, url]) => [name, await probe(url, name)]));
    const failed = results.filter(([, ok]) => !ok).map(([name]) => name);
    appendLog(`diagnostics end failed=${failed.length ? failed.join(',') : 'none'}`, failed.length ? 'warn' : 'info');
  }

  const loadScript = (src) => new Promise((resolve, reject) => {
    if (ctor() && runtimeReady) { appendLog('runtime already loaded'); resolve(); return; }
    const existing = document.querySelector(`script[data-v86-src="${src}"]`);
    if (existing && existing.dataset.loaded === 'true') { runtimeReady = true; appendLog('runtime script tag already loaded'); resolve(); return; }
    const script = existing || document.createElement('script');
    script.src = src;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.dataset.v86Src = src;
    script.onload = () => { script.dataset.loaded = 'true'; runtimeReady = true; appendLog('runtime script onload'); resolve(); };
    script.onerror = () => reject(new Error(`v86 runtime script failed: ${src}`));
    if (!existing) { appendLog(`inject runtime script ${src}`); document.head.appendChild(script); }
  });

  async function ensureV86Runtime() {
    await loadScript(V86_RUNTIME.lib);
    appendLog(`constructor check V86Starter=${typeof window.V86Starter} V86=${typeof window.V86}`);
    if (!ctor()) throw new Error('V86 constructor missing');
    return V86_RUNTIME;
  }

  function clearScreen() {
    if (screenObserver) { try { screenObserver.disconnect(); } catch (_) {} screenObserver = null; }
    screenEl.innerHTML = '';
    screenEl.classList.remove('has-vm');
  }

  function stopMachine() {
    bootToken++;
    fallbackInProgress = false;
    if (emulator) {
      try {
        if (typeof emulator.destroy === 'function') emulator.destroy();
        else if (typeof emulator.stop === 'function') emulator.stop();
        appendLog('VM stop/destroy called');
      } catch (error) { appendLog(`stop error: ${error.message}`, 'error'); }
    }
    emulator = null;
    serialBuffer = '';
    clearScreen();
    appendLog('VM state cleared');
  }

  function watchScreen() {
    if (screenObserver) screenObserver.disconnect();
    screenObserver = new MutationObserver(() => {
      if (screenEl.children.length) screenEl.classList.add('has-vm');
      appendLog(`screen mutation children=${screenEl.children.length} canvas=${!!screenEl.querySelector('canvas')} text=${screenEl.textContent.trim().slice(0, 80) || 'none'}`);
    });
    screenObserver.observe(screenEl, { childList: true, subtree: true });
    setTimeout(() => {
      const r = screenEl.getBoundingClientRect();
      appendLog(`screen box ${Math.round(r.width)}x${Math.round(r.height)} children=${screenEl.children.length} canvas=${!!screenEl.querySelector('canvas')}`);
    }, 1500);
  }

  function fallbackFrom(preset, token, reason) {
    if (fallbackInProgress || !preset.fallbackPresetId) return;
    const fallback = OS_PRESETS.find((item) => item.id === preset.fallbackPresetId);
    if (!fallback) return;
    fallbackInProgress = true;
    appendLog(`fallback scheduled ${preset.id} -> ${fallback.id} reason=${reason}`, 'warn');
    setTimeout(() => {
      if (token === bootToken) bootMachine(fallback, `fallback from ${preset.id}`);
    }, 1200);
  }

  function bindLogs(preset, token) {
    const events = ['emulator-loaded','emulator-ready','emulator-started','emulator-stopped','download-start','download-progress','download-error','screen-set-mode','reset','cpu-event-halt','cpu-event-reset'];
    events.forEach((name) => {
      try {
        emulator.add_listener(name, (ev) => {
          if (token !== bootToken) return;
          if (name === 'download-error') {
            appendLog(`event ${name}: ${ev ? JSON.stringify(ev, (k, v) => k === 'buffer' ? '[buffer]' : v).slice(0, 500) : ''}`, 'error');
            fallbackFrom(preset, token, 'download-error');
            return;
          }
          appendLog(`event ${name}: ${ev ? JSON.stringify(ev, (k, v) => k === 'buffer' ? '[buffer]' : v).slice(0, 500) : ''}`, name.includes('error') ? 'error' : 'info');
        });
      } catch (e) { appendLog(`listener add failed ${name}: ${e.message}`, 'warn'); }
    });

    try {
      emulator.add_listener('serial0-output-byte', (byte) => {
        if (token !== bootToken) return;
        const ch = String.fromCharCode(byte);
        serialBuffer += ch;
        if (serialBuffer.length > 160 || ch === '\n') {
          appendLog(`[serial0] ${serialBuffer.replace(/\r/g, '').slice(0, 600)}`);
          serialBuffer = '';
        }
      });
      appendLog('serial0-output-byte listener enabled');
    } catch (e) { appendLog(`serial listener unavailable: ${e.message}`, 'warn'); }

    appendLog(`listeners attached for ${preset.id}`);
  }

  async function bootMachine(preset = selectedPreset(), reason = 'manual') {
    const token = ++bootToken;
    fallbackInProgress = false;
    bootBtn.disabled = true;
    appendLog(`start requested preset=${preset.id} ${preset.label} reason=${reason}`);
    try {
      if (emulator) stopMachine();
      clearScreen();
      const runtime = await ensureV86Runtime();
      runDiagnostics(preset).catch((e) => appendLog(`diagnostics failed: ${e.message}`, 'warn'));
      const config = {
        wasm_path: runtime.wasm,
        bios: { url: runtime.bios },
        vga_bios: { url: runtime.vga },
        autostart: true,
        screen_container: screenEl,
        memory_size: preset.memorySize,
        vga_memory_size: preset.vgaMemorySize,
        disable_speaker: true,
        ...cloneSetup(preset.setup),
      };
      appendLog(`create VM config=${safeConfig(config)}`);
      watchScreen();
      emulator = new (ctor())(config);
      screenEl.classList.add('has-vm');
      window.goricsEmulator = emulator;
      bindLogs(preset, token);
      appendLog('VM constructor returned. Waiting for events and guest screen.');
    } catch (error) {
      appendLog(`start failed: ${error && error.stack ? error.stack : error}`, 'error');
      fallbackFrom(preset, token, 'exception');
    } finally {
      if (token === bootToken) bootBtn.disabled = false;
    }
  }

  installLogButtons();
  OS_PRESETS.forEach((preset) => {
    const option = document.createElement('option');
    option.value = preset.id;
    option.textContent = preset.label;
    selectEl.appendChild(option);
  });
  selectEl.value = 'dsl-linux-gui';
  updatePresetDetail();
  logEnvironment();
  selectEl.addEventListener('change', updatePresetDetail);
  bootBtn.addEventListener('click', () => bootMachine());
  stopBtn.addEventListener('click', stopMachine);
  fullscreenBtn.addEventListener('click', async () => {
    try {
      const target = screenEl.closest('.screen-wrap') || screenEl;
      if (!document.fullscreenElement && target.requestFullscreen) { await target.requestFullscreen(); return; }
      if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen();
    } catch (error) { appendLog(`fullscreen failed: ${error.message}`, 'error'); }
  });
  window.setTimeout(() => {
    if (autoBooted || emulator) return;
    autoBooted = true;
    appendLog('auto start triggered');
    bootMachine();
  }, 600);
})();