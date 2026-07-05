(() => {
  'use strict';

  const V86_RUNTIME = {
    name: 'copy.sh v86 runtime',
    lib: 'https://copy.sh/v86/build/libv86.js',
    wasm: 'https://copy.sh/v86/build/v86.wasm',
    bios: 'https://copy.sh/v86/bios/seabios.bin',
    vga: 'https://copy.sh/v86/bios/vgabios.bin',
  };

  const OS_PRESETS = [
    { id: 'dsl-linux-iso', label: 'Damn Small Linux GUI ISO (기본 / 실제 GUI)', detail: 'GUI 데스크톱 확인용 ISO입니다. 느릴 수 있으니 로그의 다운로드/이벤트를 확인하세요.', memorySize: 192 * 1024 * 1024, vgaMemorySize: 16 * 1024 * 1024, setup: { cdrom: { url: 'https://i.copy.sh/linux4.iso', async: true } } },
    { id: 'buildroot-kernel', label: 'Buildroot Linux (빠른 검증용)', detail: '가장 빠르게 부팅 확인 가능한 Linux 커널입니다. GUI는 아니지만 v86 동작 확인에 가장 안정적입니다.', memorySize: 128 * 1024 * 1024, vgaMemorySize: 8 * 1024 * 1024, setup: { bzimage: { url: 'https://i.copy.sh/buildroot-bzimage68.bin', async: true }, cmdline: 'rw root=/dev/ram0 console=ttyS0 console=tty0' } },
    { id: 'browser-linux-iso', label: 'Tiny v86 Linux ISO', detail: 'v86 공식 테스트용 작은 Linux ISO입니다.', memorySize: 128 * 1024 * 1024, vgaMemorySize: 8 * 1024 * 1024, setup: { cdrom: { url: 'https://i.copy.sh/linux.iso', async: true } } },
    { id: 'freedos', label: 'FreeDOS 7.22', detail: '작고 안정적인 HDD 이미지입니다.', memorySize: 64 * 1024 * 1024, vgaMemorySize: 4 * 1024 * 1024, setup: { hda: { url: 'https://i.copy.sh/freedos722.img', async: true } } },
    { id: 'windows101', label: 'Windows 1.01', detail: 'v86 공식 테스트 Windows 이미지입니다.', memorySize: 64 * 1024 * 1024, vgaMemorySize: 4 * 1024 * 1024, setup: { hda: { url: 'https://i.copy.sh/windows101.img', async: true } } },
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

  const now = () => new Date().toISOString();
  const appendLog = (message, level = 'info') => {
    const line = `[${now()}] [${level}] ${message}`;
    logEl.textContent += `\n${line}`;
    logEl.scrollTop = logEl.scrollHeight;
    try { console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log']('[GORICS multiboot]', message); } catch (_) {}
  };
  const ctor = () => (typeof window.V86Starter === 'function' ? window.V86Starter : (typeof window.V86 === 'function' ? window.V86 : null));
  const fmtBytes = (n) => !n ? 'unknown' : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;
  const selectedPreset = () => OS_PRESETS.find((item) => item.id === selectEl.value) || OS_PRESETS[0];
  const cloneSetup = (setup) => JSON.parse(JSON.stringify(setup));
  const bootUrls = (setup) => Object.values(setup || {}).filter((v) => v && v.url).map((v) => v.url);
  const safeConfig = (cfg) => JSON.stringify(cfg, (k, v) => k === 'screen_container' ? '[HTMLElement]' : v, 2);

  function installLogButtons() {
    if (document.getElementById('copy-log-btn')) return;
    const copy = document.createElement('button'); copy.id = 'copy-log-btn'; copy.className = 'secondary'; copy.textContent = '로그 복사';
    copy.onclick = async () => { try { await navigator.clipboard.writeText(logEl.textContent); appendLog('로그 복사 완료.'); } catch (e) { appendLog(`로그 복사 실패: ${e.message}`, 'error'); } };
    const save = document.createElement('button'); save.className = 'secondary'; save.textContent = '로그 파일';
    save.onclick = () => { const blob = new Blob([logEl.textContent], { type: 'text/plain;charset=utf-8' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `gorics-multiboot-log-${Date.now()}.txt`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); appendLog('로그 파일 생성.'); };
    bootBtn.parentElement.append(copy, save);
  }

  function updatePresetDetail() {
    const preset = selectedPreset();
    if (hintEl) hintEl.textContent = `${preset.detail} / RAM ${fmtBytes(preset.memorySize)} / VGA ${fmtBytes(preset.vgaMemorySize)}`;
    appendLog(`preset selected id=${preset.id} label=${preset.label}`);
  }

  function logEnvironment() {
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
      appendLog(`probe RANGE ${label}: status=${res.status} ok=${res.ok} type=${res.type} range=${range || 'none'} size=${fmtBytes(Number(range.split('/')[1] || res.headers.get('content-length') || 0))} time=${Math.round(performance.now() - started)}ms`);
      return res.ok || res.status === 206;
    } catch (e) { appendLog(`probe RANGE ${label} failed: ${e.name}: ${e.message}`, 'error'); return false; }
  }

  async function runPreflight(preset) {
    appendLog(`preflight start preset=${preset.id}`);
    await probe(V86_RUNTIME.lib, 'runtime.js');
    await probe(V86_RUNTIME.wasm, 'runtime.wasm');
    await probe(V86_RUNTIME.bios, 'bios');
    await probe(V86_RUNTIME.vga, 'vga-bios');
    for (const [i, url] of bootUrls(preset.setup).entries()) await probe(url, `guest-image-${i}`);
    appendLog('preflight end');
  }

  const loadScript = (src) => new Promise((resolve, reject) => {
    if (ctor() && runtimeReady) { appendLog('runtime already loaded'); resolve(); return; }
    const existing = document.querySelector(`script[data-v86-src="${src}"]`);
    if (existing && existing.dataset.loaded === 'true') { runtimeReady = true; appendLog('runtime script tag already loaded'); resolve(); return; }
    const script = existing || document.createElement('script');
    script.src = src; script.async = true; script.dataset.v86Src = src;
    script.onload = () => { script.dataset.loaded = 'true'; runtimeReady = true; appendLog('runtime script onload'); resolve(); };
    script.onerror = () => reject(new Error(`v86 runtime script failed: ${src}`));
    if (!existing) { appendLog(`inject runtime script ${src}`); document.head.appendChild(script); }
  });

  const ensureV86Runtime = async () => {
    await loadScript(V86_RUNTIME.lib);
    appendLog(`constructor check V86Starter=${typeof window.V86Starter} V86=${typeof window.V86}`);
    if (!ctor()) throw new Error('V86 constructor missing');
    return V86_RUNTIME;
  };

  function stopMachine() {
    if (!emulator) { appendLog('stop requested but no VM', 'warn'); return; }
    try { if (typeof emulator.destroy === 'function') emulator.destroy(); else if (typeof emulator.stop === 'function') emulator.stop(); appendLog('VM stop/destroy called'); }
    catch (error) { appendLog(`stop error: ${error.message}`, 'error'); }
    emulator = null; screenEl.innerHTML = ''; serialBuffer = ''; appendLog('VM state cleared');
  }

  function bindLogs(preset) {
    const events = ['emulator-ready','emulator-started','emulator-stopped','download-start','download-progress','download-error','screen-set-mode','reset','cpu-event-halt','cpu-event-reset'];
    events.forEach((name) => {
      try { emulator.add_listener(name, (ev) => appendLog(`event ${name}: ${ev ? JSON.stringify(ev, (k, v) => k === 'buffer' ? '[buffer]' : v).slice(0, 500) : ''}`, name.includes('error') ? 'error' : 'info')); }
      catch (e) { appendLog(`listener add failed ${name}: ${e.message}`, 'warn'); }
    });
    try {
      emulator.add_listener('serial0-output-byte', (byte) => {
        const ch = String.fromCharCode(byte); serialBuffer += ch;
        if (serialBuffer.length > 160 || ch === '\n') { appendLog(`[serial0] ${serialBuffer.replace(/\r/g, '').slice(0, 600)}`); serialBuffer = ''; }
      });
      appendLog('serial0-output-byte listener enabled');
    } catch (e) { appendLog(`serial listener unavailable: ${e.message}`, 'warn'); }
    appendLog(`listeners attached for ${preset.id}`);
  }

  function watchScreen() {
    const obs = new MutationObserver(() => appendLog(`screen mutation children=${screenEl.children.length} canvas=${!!screenEl.querySelector('canvas')} text=${screenEl.textContent.trim().slice(0, 80) || 'none'}`));
    obs.observe(screenEl, { childList: true, subtree: true });
    setTimeout(() => { const r = screenEl.getBoundingClientRect(); appendLog(`screen box ${Math.round(r.width)}x${Math.round(r.height)} children=${screenEl.children.length} canvas=${!!screenEl.querySelector('canvas')}`); }, 1500);
  }

  async function bootMachine() {
    const preset = selectedPreset();
    bootBtn.disabled = true;
    appendLog(`start requested preset=${preset.id} ${preset.label}`);
    try {
      if (emulator) stopMachine();
      screenEl.innerHTML = '';
      await runPreflight(preset);
      const runtime = await ensureV86Runtime();
      const config = { wasm_path: runtime.wasm, bios: { url: runtime.bios }, vga_bios: { url: runtime.vga }, autostart: true, screen_container: screenEl, memory_size: preset.memorySize, vga_memory_size: preset.vgaMemorySize, ...cloneSetup(preset.setup) };
      appendLog(`create VM config=${safeConfig(config)}`);
      watchScreen();
      emulator = new (ctor())(config);
      window.goricsEmulator = emulator;
      bindLogs(preset);
      appendLog('VM constructor returned. Waiting for events and guest screen.');
    } catch (error) { appendLog(`start failed: ${error && error.stack ? error.stack : error}`, 'error'); }
    finally { bootBtn.disabled = false; }
  }

  installLogButtons();
  OS_PRESETS.forEach((preset) => { const option = document.createElement('option'); option.value = preset.id; option.textContent = preset.label; selectEl.appendChild(option); });
  selectEl.value = 'dsl-linux-iso';
  updatePresetDetail();
  logEnvironment();
  selectEl.addEventListener('change', updatePresetDetail);
  bootBtn.addEventListener('click', bootMachine);
  stopBtn.addEventListener('click', stopMachine);
  fullscreenBtn.addEventListener('click', async () => { try { if (!document.fullscreenElement && screenEl.requestFullscreen) { await screenEl.requestFullscreen(); return; } if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen(); } catch (error) { appendLog(`fullscreen failed: ${error.message}`, 'error'); } });
  window.setTimeout(() => { if (autoBooted || emulator) return; autoBooted = true; appendLog('auto start triggered'); bootMachine(); }, 600);
})();