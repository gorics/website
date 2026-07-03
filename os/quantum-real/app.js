(() => {
  'use strict';

  const V86_ASSETS = [
    {
      name: 'jsDelivr',
      js: 'https://cdn.jsdelivr.net/npm/v86@0.5.44/build/libv86.js',
      wasm: 'https://cdn.jsdelivr.net/npm/v86@0.5.44/build/v86.wasm',
      bios: 'https://cdn.jsdelivr.net/npm/v86@0.5.44/bios/seabios.bin',
      vga: 'https://cdn.jsdelivr.net/npm/v86@0.5.44/bios/vgabios.bin',
    },
    {
      name: 'copy.sh',
      js: 'https://copy.sh/v86/build/libv86.js',
      wasm: 'https://copy.sh/v86/build/v86.wasm',
      bios: 'https://copy.sh/v86/bios/seabios.bin',
      vga: 'https://copy.sh/v86/bios/vgabios.bin',
    },
  ];

  const BUILTIN_ISO = './assets/gorics-quantum-webboot-i386.iso';
  const FALLBACK_ISO = '../linux/1/linux.iso';

  const $ = (id) => document.getElementById(id);
  const logEl = $('log');
  const screen = $('screen');
  const status = $('status');
  const assetState = $('asset-state');
  const bootBuiltin = $('boot-builtin');
  const bootFile = $('boot-file');
  const fileInput = $('iso-file');
  const stopBtn = $('stop-vm');
  const focusBtn = $('focus-vm');
  const fullBtn = $('fullscreen');

  let emulator = null;
  let selectedRuntime = null;

  function log(message) {
    const t = new Date().toISOString().slice(11, 19);
    logEl.textContent += `\n[${t}] ${message}`;
    logEl.scrollTop = logEl.scrollHeight;
  }

  function setStatus(text, kind = '') {
    status.textContent = text;
    status.style.color = kind === 'ok' ? 'var(--ok)' : kind === 'err' ? 'var(--danger)' : 'var(--accent)';
  }

  async function headOk(url) {
    try {
      const res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
      return res.ok;
    } catch (_) {
      return false;
    }
  }

  async function loadScriptOnce(src) {
    if (document.querySelector(`script[data-v86-src="${src}"]`)) return;
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.crossOrigin = 'anonymous';
      s.dataset.v86Src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error(`script load failed: ${src}`));
      document.head.appendChild(s);
    });
  }

  async function ensureRuntime() {
    if (selectedRuntime && (window.V86Starter || window.V86)) return selectedRuntime;
    for (const runtime of V86_ASSETS) {
      try {
        log(`v86 runtime loading: ${runtime.name}`);
        await loadScriptOnce(runtime.js);
        const V86Ctor = window.V86Starter || window.V86;
        if (typeof V86Ctor === 'function') {
          selectedRuntime = runtime;
          log(`v86 runtime ready: ${runtime.name}`);
          return runtime;
        }
      } catch (error) {
        log(`${runtime.name} failed: ${error.message}`);
      }
    }
    throw new Error('v86 runtime unavailable');
  }

  function stopVm() {
    if (emulator && typeof emulator.stop === 'function') {
      try { emulator.stop(); } catch (_) {}
    }
    emulator = null;
    screen.innerHTML = '';
    setStatus('STOPPED');
    log('VM stopped.');
  }

  function bindEvents(label) {
    emulator.add_listener('emulator-ready', () => {
      setStatus('RUNNING', 'ok');
      log(`${label}: emulator-ready`);
    });
    emulator.add_listener('emulator-started', () => log(`${label}: emulator-started`));
    emulator.add_listener('emulator-stopped', () => {
      setStatus('STOPPED');
      log(`${label}: emulator-stopped`);
    });
    emulator.add_listener('download-progress', (event) => {
      if (!event || !event.total) return;
      const pct = ((event.loaded / event.total) * 100).toFixed(1);
      log(`${label}: download ${pct}%`);
    });
    emulator.add_listener('download-error', (event) => {
      setStatus('ERROR', 'err');
      log(`${label}: download-error ${event && event.url ? event.url : ''}`);
    });
  }

  async function bootFromUrl(url, label) {
    stopVm();
    setStatus('BOOTING');
    bootBuiltin.disabled = true;
    bootFile.disabled = true;
    try {
      const runtime = await ensureRuntime();
      const V86Ctor = window.V86Starter || window.V86;
      screen.innerHTML = '';
      emulator = new V86Ctor({
        wasm_path: runtime.wasm,
        bios: { url: runtime.bios },
        vga_bios: { url: runtime.vga },
        screen_container: screen,
        memory_size: 128 * 1024 * 1024,
        vga_memory_size: 8 * 1024 * 1024,
        cdrom: { url, async: true },
        autostart: true,
      });
      window.goricsQuantumVm = emulator;
      bindEvents(label);
      log(`booting ISO: ${url}`);
    } catch (error) {
      setStatus('ERROR', 'err');
      log(`boot failed: ${error.message}`);
      alert(`부팅 실패: ${error.message}`);
    } finally {
      bootBuiltin.disabled = false;
      bootFile.disabled = false;
    }
  }

  async function bootFromFile(file) {
    stopVm();
    setStatus('BOOTING');
    bootBuiltin.disabled = true;
    bootFile.disabled = true;
    try {
      const runtime = await ensureRuntime();
      const V86Ctor = window.V86Starter || window.V86;
      const buffer = await file.arrayBuffer();
      screen.innerHTML = '';
      emulator = new V86Ctor({
        wasm_path: runtime.wasm,
        bios: { url: runtime.bios },
        vga_bios: { url: runtime.vga },
        screen_container: screen,
        memory_size: 128 * 1024 * 1024,
        vga_memory_size: 8 * 1024 * 1024,
        cdrom: { buffer },
        autostart: true,
      });
      window.goricsQuantumVm = emulator;
      bindEvents(file.name);
      log(`booting local ISO: ${file.name} (${Math.round(file.size / 1024 / 1024)} MB)`);
    } catch (error) {
      setStatus('ERROR', 'err');
      log(`local boot failed: ${error.message}`);
      alert(`로컬 ISO 부팅 실패: ${error.message}`);
    } finally {
      bootBuiltin.disabled = false;
      bootFile.disabled = false;
    }
  }

  async function chooseBuiltinIso() {
    if (await headOk(BUILTIN_ISO)) return BUILTIN_ISO;
    if (await headOk(FALLBACK_ISO)) return FALLBACK_ISO;
    return null;
  }

  bootBuiltin.addEventListener('click', async () => {
    const iso = await chooseBuiltinIso();
    if (!iso) {
      setStatus('NO ISO', 'err');
      log('no bootable ISO found. Run the GitHub Actions ISO builder first.');
      alert('내장 ISO가 아직 없습니다. GitHub Actions 빌드가 끝나면 assets/gorics-quantum-webboot-i386.iso가 생성됩니다.');
      return;
    }
    await bootFromUrl(iso, iso.includes('quantum') ? 'GORICS Quantum ISO' : 'Fallback Linux ISO');
  });

  bootFile.addEventListener('click', async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) {
      alert('부팅할 ISO 파일을 먼저 선택하세요.');
      return;
    }
    await bootFromFile(file);
  });

  stopBtn.addEventListener('click', stopVm);
  focusBtn.addEventListener('click', () => screen.focus());
  fullBtn.addEventListener('click', async () => {
    if (screen.requestFullscreen) await screen.requestFullscreen();
  });

  (async () => {
    if (await headOk(BUILTIN_ISO)) {
      assetState.textContent = 'GORICS ISO 내장 완료';
      assetState.style.color = 'var(--ok)';
      log('built-in GORICS Quantum ISO detected.');
    } else if (await headOk(FALLBACK_ISO)) {
      assetState.textContent = '대체 Linux ISO 사용 가능';
      log('built-in ISO missing; fallback ISO detected.');
    } else {
      assetState.textContent = 'ISO 빌드 필요';
      assetState.style.color = 'var(--danger)';
      log('no built-in ISO yet.');
    }
  })();
})();
