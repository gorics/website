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
  const BUILTIN_SHA = './assets/gorics-quantum-webboot-i386.iso.sha256';
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

  const downloadIso = document.querySelector('a[href="./assets/gorics-quantum-webboot-i386.iso"]');
  const downloadSha = document.querySelector('a[href="./assets/gorics-quantum-webboot-i386.iso.sha256"]');

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
      if (res.ok) return true;
    } catch (_) {}
    try {
      const res = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-0' }, cache: 'no-store' });
      return res.ok || res.status === 206;
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
    if (await headOk(BUILTIN_ISO)) return { url: BUILTIN_ISO, label: 'GORICS Quantum ISO', sha: BUILTIN_SHA };
    if (await headOk(FALLBACK_ISO)) return { url: FALLBACK_ISO, label: 'Fallback Linux ISO', sha: null };
    return null;
  }

  async function refreshLinks() {
    const picked = await chooseBuiltinIso();
    if (!picked) {
      assetState.textContent = 'ISO 빌드 필요';
      assetState.style.color = 'var(--danger)';
      if (downloadIso) {
        downloadIso.href = '#';
        downloadIso.removeAttribute('download');
        downloadIso.setAttribute('aria-disabled', 'true');
      }
      if (downloadSha) {
        downloadSha.href = '#';
        downloadSha.removeAttribute('download');
        downloadSha.setAttribute('aria-disabled', 'true');
      }
      log('no built-in or fallback ISO found.');
      return null;
    }

    assetState.textContent = picked.url === BUILTIN_ISO ? 'GORICS ISO 내장 완료' : '대체 Linux ISO 사용 가능';
    assetState.style.color = picked.url === BUILTIN_ISO ? 'var(--ok)' : 'var(--accent)';
    if (downloadIso) {
      downloadIso.href = picked.url;
      downloadIso.setAttribute('download', '');
      downloadIso.removeAttribute('aria-disabled');
    }
    if (downloadSha) {
      if (picked.sha && await headOk(picked.sha)) {
        downloadSha.href = picked.sha;
        downloadSha.setAttribute('download', '');
        downloadSha.removeAttribute('aria-disabled');
      } else {
        downloadSha.href = '#';
        downloadSha.removeAttribute('download');
        downloadSha.setAttribute('aria-disabled', 'true');
        downloadSha.textContent = 'SHA256 없음';
      }
    }
    log(`${picked.label} ready: ${picked.url}`);
    return picked;
  }

  bootBuiltin.addEventListener('click', async () => {
    const picked = await refreshLinks();
    if (!picked) {
      setStatus('NO ISO', 'err');
      alert('사용 가능한 ISO가 없습니다. GitHub Actions ISO 빌드 또는 기존 Linux ISO 경로를 확인하세요.');
      return;
    }
    await bootFromUrl(picked.url, picked.label);
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

  refreshLinks();
})();
