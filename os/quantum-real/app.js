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
      js: '/website/vendor/v86/libv86.js',
      wasm: '/website/vendor/v86/v86.wasm',
      bios: '/website/vendor/v86/seabios.bin',
      vga: '/website/vendor/v86/vgabios.bin',
    },
  ];

  const BUILTIN_ISO = './assets/gorics-quantum-webboot-i386.iso';
  const BUILTIN_SHA = './assets/gorics-quantum-webboot-i386.iso.sha256';
  const FALLBACK_ISO = '../linux/1/linux.iso';
  const MIN_ISO_BYTES = 1024 * 1024;
  const DIRECT_LINUX = {
    label: 'GORICS Instant Linux',
    bzimage: 'https://copy.sh/v86/images/buildroot-bzimage.bin',
    initrd: 'https://copy.sh/v86/images/buildroot-rootfs.ext2',
    cmdline: 'rw root=/dev/ram0 console=ttyS0 console=tty0 init=/bin/sh',
  };

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

  async function isoInfo(url) {
    try {
      const res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
      if (!res.ok) return { ok: false, size: 0 };
      const size = Number(res.headers.get('content-length') || 0);
      if (size && size < MIN_ISO_BYTES) return { ok: false, size };
      return { ok: true, size };
    } catch (_) {}
    try {
      const res = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-0' }, cache: 'no-store' });
      if (!(res.ok || res.status === 206)) return { ok: false, size: 0 };
      const range = res.headers.get('content-range') || '';
      const size = Number(range.split('/')[1] || res.headers.get('content-length') || 0);
      if (size && size < MIN_ISO_BYTES) return { ok: false, size };
      return { ok: true, size };
    } catch (_) {
      return { ok: false, size: 0 };
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

  async function startVm(config, label) {
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
        autostart: true,
        ...config,
      });
      window.goricsQuantumVm = emulator;
      bindEvents(label);
      log(`booting: ${label}`);
    } catch (error) {
      setStatus('ERROR', 'err');
      log(`boot failed: ${error.message}`);
      alert(`부팅 실패: ${error.message}`);
    } finally {
      bootBuiltin.disabled = false;
      bootFile.disabled = false;
    }
  }

  async function bootFromUrl(url, label) {
    await startVm({ cdrom: { url, async: true } }, label);
  }

  async function bootDirectLinux() {
    await startVm({
      bzimage: { url: DIRECT_LINUX.bzimage, async: true },
      initrd: { url: DIRECT_LINUX.initrd, async: true },
      cmdline: DIRECT_LINUX.cmdline,
    }, DIRECT_LINUX.label);
  }

  async function bootFromFile(file) {
    try {
      const buffer = await file.arrayBuffer();
      await startVm({ cdrom: { buffer } }, file.name);
      log(`local ISO loaded: ${file.name} (${Math.round(file.size / 1024 / 1024)} MB)`);
    } catch (error) {
      setStatus('ERROR', 'err');
      log(`local ISO read failed: ${error.message}`);
      alert(`로컬 ISO 읽기 실패: ${error.message}`);
    }
  }

  async function chooseBootSource() {
    const builtIn = await isoInfo(BUILTIN_ISO);
    if (builtIn.ok) return { type: 'iso', url: BUILTIN_ISO, label: 'GORICS Quantum ISO', sha: BUILTIN_SHA, size: builtIn.size };
    if (builtIn.size > 0) log(`ignored invalid built-in ISO: ${builtIn.size} bytes`);
    const fallback = await isoInfo(FALLBACK_ISO);
    if (fallback.ok) return { type: 'iso', url: FALLBACK_ISO, label: 'Fallback Linux ISO', sha: null, size: fallback.size };
    return { type: 'direct', label: DIRECT_LINUX.label, sha: null, size: 0 };
  }

  async function refreshLinks() {
    const picked = await chooseBootSource();
    const hasIso = picked.type === 'iso';

    assetState.textContent = hasIso
      ? (picked.url === BUILTIN_ISO ? 'GORICS ISO 내장 완료' : '대체 Linux ISO 사용 가능')
      : '즉시 Linux 커널 부팅 가능';
    assetState.style.color = picked.url === BUILTIN_ISO ? 'var(--ok)' : 'var(--accent)';
    bootBuiltin.textContent = hasIso ? '사용 가능한 OS 부팅' : 'Instant Linux 부팅';

    if (downloadIso) {
      if (hasIso) {
        downloadIso.href = picked.url;
        downloadIso.setAttribute('download', '');
        downloadIso.removeAttribute('aria-disabled');
      } else {
        downloadIso.href = '#';
        downloadIso.removeAttribute('download');
        downloadIso.setAttribute('aria-disabled', 'true');
      }
    }

    if (downloadSha) {
      if (picked.sha && await headOk(picked.sha)) {
        downloadSha.href = picked.sha;
        downloadSha.setAttribute('download', '');
        downloadSha.removeAttribute('aria-disabled');
        downloadSha.textContent = 'SHA256';
      } else {
        downloadSha.href = '#';
        downloadSha.removeAttribute('download');
        downloadSha.setAttribute('aria-disabled', 'true');
        downloadSha.textContent = hasIso ? 'SHA256 없음' : '직접 커널 부팅';
      }
    }

    log(`${picked.label} ready.`);
    return picked;
  }

  bootBuiltin.addEventListener('click', async () => {
    const picked = await refreshLinks();
    if (picked.type === 'iso') {
      await bootFromUrl(picked.url, picked.label);
    } else {
      await bootDirectLinux();
    }
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
