(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const logBox = $('#log');
  const screen = $('#screen');
  const boot = $('#boot-btn');
  const stop = $('#stop-btn');
  const full = $('#fullscreen-btn');
  const urlBox = $('#iso-url');
  const actions = $('.actions');

  const assetName = 'gorics-linux-gui-web-i386.iso';
  const chunkSize = 16 * 1024 * 1024;
  const chunkRoots = [
    'https://cdn.jsdelivr.net/gh/gorics/website@os-assets/os/real-multiboot/assets/v86-parts/',
    'https://fastly.jsdelivr.net/gh/gorics/website@os-assets/os/real-multiboot/assets/v86-parts/',
    'https://gcore.jsdelivr.net/gh/gorics/website@os-assets/os/real-multiboot/assets/v86-parts/',
    'https://raw.githubusercontent.com/gorics/website/os-assets/os/real-multiboot/assets/v86-parts/',
  ];
  let isoBase = chunkRoots[0] + assetName;
  const metaUrl = new URL('./assets/iso-meta.json', location.href).href;
  const kernelUrl = new URL('./assets/vmlinuz', location.href).href;
  const initrdUrl = new URL('./assets/initrd.img', location.href).href;
  const runtime = '/website/vendor/v86/libv86.js';
  const wasm = '/website/vendor/v86/v86.wasm';
  const bios = '/website/vendor/v86/seabios.bin';
  const vga = '/website/vendor/v86/vgabios.bin';
  const version = 'r2';

  let vm = null;
  let state = 'idle';
  let token = 0;
  let serial = '';
  let inputLogged = false;
  let lastTouch = null;

  const keyboardButton = document.createElement('button');
  keyboardButton.id = 'keyboard-btn';
  keyboardButton.type = 'button';
  keyboardButton.className = 'secondary';
  keyboardButton.textContent = 'Keyboard';
  if (actions && !$('#keyboard-btn')) actions.insertBefore(keyboardButton, stop || full || null);

  const phoneKeyboard = document.createElement('input');
  phoneKeyboard.id = 'phone-keyboard';
  phoneKeyboard.className = 'phone_keyboard';
  phoneKeyboard.type = 'text';
  phoneKeyboard.inputMode = 'text';
  phoneKeyboard.autocomplete = 'off';
  phoneKeyboard.autocapitalize = 'off';
  phoneKeyboard.autocorrect = 'off';
  phoneKeyboard.spellcheck = false;
  phoneKeyboard.setAttribute('aria-label', 'Virtual keyboard input');
  document.body.appendChild(phoneKeyboard);

  if (urlBox) urlBox.textContent = 'Selecting a healthy ISO chunk CDN…';

  function log(text) {
    const line = `[${new Date().toISOString()}] ${text}`;
    if (logBox) {
      logBox.textContent += `\n${line}`;
      logBox.scrollTop = logBox.scrollHeight;
    }
    console.log('[GORICS ISO]', text);
  }

  function setState(next) {
    state = next;
    if (boot) {
      boot.disabled = next !== 'idle';
      boot.textContent = next === 'idle' ? 'Run ISO' : next === 'loading' ? 'Checking ISO' : next === 'starting' ? 'Starting' : 'Running';
    }
    if (stop) stop.disabled = next === 'idle';
    keyboardButton.disabled = next !== 'running';
  }

  function focusScreen() {
    try { screen?.focus({ preventScroll: true }); } catch { screen?.focus(); }
  }

  function constructor() {
    return window.V86 || globalThis.V86 || window.V86Starter || globalThis.V86Starter;
  }

  function loadRuntime() {
    return new Promise((resolve, reject) => {
      if (constructor()) return resolve(constructor());
      const script = document.createElement('script');
      script.src = `${runtime}?v=${version}`;
      script.async = false;
      script.onload = () => setTimeout(() => constructor() ? resolve(constructor()) : reject(new Error('v86 constructor missing')), 60);
      script.onerror = () => reject(new Error(`runtime load failed ${runtime}`));
      document.head.appendChild(script);
    });
  }

  async function clearOldWorkers() {
    try {
      const registrations = await navigator.serviceWorker?.getRegistrations?.() || [];
      for (const registration of registrations) {
        if (registration.scope.includes('/os/real-multiboot/')) await registration.unregister();
      }
      const names = await globalThis.caches?.keys?.() || [];
      for (const name of names) {
        if (/gorics|v86|iso/i.test(name)) await globalThis.caches.delete(name);
      }
    } catch (error) {
      log(`old worker cleanup skipped ${error.message}`);
    }
  }

  async function loadMetadata() {
    log('loading legacy Pages chunk metadata');
    const response = await fetch(`${metaUrl}?v=${version}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`ISO metadata HTTP ${response.status}`);
    const meta = await response.json();
    if (meta.name !== assetName) throw new Error(`unexpected ISO ${meta.name}`);
    if (meta.architecture !== 'i386') throw new Error(`unexpected architecture ${meta.architecture}`);
    if (!Number.isFinite(meta.size) || meta.size <= 0) throw new Error(`invalid ISO size ${meta.size}`);
    if (meta.chunk_size !== chunkSize) throw new Error(`invalid chunk size ${meta.chunk_size}`);
    if (!Number.isInteger(meta.parts) || meta.parts < 1) throw new Error(`invalid part count ${meta.parts}`);
    log(`ISO size=${meta.size} parts=${meta.parts} sha256=${String(meta.sha256).slice(0, 16)}...`);
    return meta;
  }

  function ascii(bytes, start, length) {
    return String.fromCharCode(...bytes.slice(start, start + length));
  }

  function partUrl(base, start, end) {
    const slash = base.lastIndexOf('/');
    const dot = base.lastIndexOf('.');
    if (dot <= slash) return `${base}-${start}-${end}`;
    return `${base.slice(0, dot)}-${start}-${end}${base.slice(dot)}`;
  }

  async function rangeFetch(url, range) {
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const join = url.includes('?') ? '&' : '?';
        const response = await fetch(`${url}${join}v=${version}-${attempt}-${Date.now()}`, {
          cache: 'no-store',
          headers: { Range: `bytes=${range}` },
        });
        if (response.status !== 200 && response.status !== 206) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response;
      } catch (error) {
        lastError = error;
        if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 700));
      }
    }
    throw lastError || new Error('chunk request failed');
  }

  async function selectChunkSource(meta) {
    const finalStart = (meta.parts - 1) * chunkSize;
    const failures = [];
    for (const root of chunkRoots) {
      const candidate = root + assetName;
      const label = new URL(root).hostname;
      try {
        const firstPart = partUrl(candidate, 0, chunkSize);
        log(`probing ${label} first ISO chunk ${firstPart.split('/').pop()}`);
        const firstResponse = await rangeFetch(firstPart, '32768-36863');
        let firstBytes = new Uint8Array(await firstResponse.arrayBuffer());
        if (firstResponse.status === 200 && firstBytes.length >= 36864) firstBytes = firstBytes.slice(32768, 36864);
        if (firstBytes.length !== 4096) throw new Error(`first probe size ${firstBytes.length}`);
        if (ascii(firstBytes, 1, 5) !== 'CD001') throw new Error('ISO9660 descriptor missing');
        if (ascii(firstBytes, 2049, 5) !== 'CD001' || !ascii(firstBytes, 2055, 32).includes('EL TORITO')) {
          throw new Error('El Torito record missing');
        }

        const finalPart = partUrl(candidate, finalStart, finalStart + chunkSize);
        log(`probing ${label} final ISO chunk ${finalPart.split('/').pop()}`);
        const finalResponse = await rangeFetch(finalPart, '0-15');
        const finalBytes = new Uint8Array(await finalResponse.arrayBuffer());
        if (finalBytes.length < 16) throw new Error(`final probe size ${finalBytes.length}`);

        isoBase = candidate;
        if (urlBox) urlBox.textContent = `${isoBase} (automatic CDN failover)`;
        log(`selected ISO chunk source ${label}; first and final chunks verified`);
        return;
      } catch (error) {
        failures.push(`${label}: ${error.message}`);
        log(`chunk source rejected ${label}: ${error.message}`);
      }
    }
    throw new Error(`all ISO chunk sources failed: ${failures.join(' | ')}`);
  }

  async function verifyBootFiles() {
    const checks = [
      ['kernel', kernelUrl, 1_000_000],
      ['initrd', initrdUrl, 10_000_000],
      ['runtime', runtime, 50_000],
      ['wasm', wasm, 100_000],
    ];
    for (const [name, url, minimum] of checks) {
      const response = await fetch(`${url}?v=${version}`, { method: 'HEAD', cache: 'no-store' });
      if (!response.ok) throw new Error(`${name} HTTP ${response.status}`);
      const length = Number(response.headers.get('content-length')) || 0;
      if (length && length < minimum) throw new Error(`${name} too small ${length}`);
      log(`${name} available${length ? ` size=${length}` : ''}`);
    }
  }

  function prepareScreen() {
    screen.innerHTML = '<div style="white-space:pre;font:14px monospace;line-height:14px"></div><canvas style="display:none"></canvas>';
    screen.classList.add('active');
  }

  function enableInput() {
    if (!vm) return;
    try {
      vm.keyboard_set_enabled?.(true);
      vm.mouse_set_enabled?.(true);
      if (!inputLogged) {
        inputLogged = true;
        log('keyboard and pointer input enabled');
      }
    } catch (error) {
      log(`input warning ${error.message}`);
    }
  }

  function openKeyboard() {
    if (state !== 'running') return;
    enableInput();
    phoneKeyboard.value = '';
    try { phoneKeyboard.focus({ preventScroll: true }); } catch { phoneKeyboard.focus(); }
    phoneKeyboard.click();
    log('virtual keyboard requested');
  }

  function serialByte(byte) {
    const character = String.fromCharCode(byte);
    if (character === '\n' || character === '\r') {
      const line = serial.trim();
      serial = '';
      if (line && /(GORICS_|Linux version|graphical|openbox|failed|error)/i.test(line)) log(`serial ${line.slice(0, 260)}`);
    } else if (serial.length < 1000) {
      serial += character;
    }
  }

  function progress(data) {
    const loaded = Number(data?.loaded) || 0;
    const total = Number(data?.total) || 0;
    const percent = total > 0 ? `${Math.floor(loaded * 100 / total)}%` : 'loading';
    return `${data?.file_name || 'file'} ${percent} (${loaded}/${total})`;
  }

  async function run() {
    if (!screen || !boot || state !== 'idle') return;
    const runToken = ++token;
    setState('loading');
    focusScreen();
    try {
      await clearOldWorkers();
      const [Emulator, meta] = await Promise.all([loadRuntime(), loadMetadata()]);
      await Promise.all([selectChunkSource(meta), verifyBootFiles()]);
      if (runToken !== token) return;
      prepareScreen();
      setState('starting');
      vm = new Emulator({
        wasm_path: wasm,
        bios: { url: bios },
        vga_bios: { url: vga },
        screen_container: screen,
        autostart: true,
        memory_size: 384 * 1024 * 1024,
        vga_memory_size: 32 * 1024 * 1024,
        disable_speaker: true,
        bzimage: { url: kernelUrl },
        initrd: { url: initrdUrl },
        cmdline: 'boot=live components live-media=/dev/sr0 username=user hostname=gorics-web systemd.unit=graphical.target console=tty0 console=ttyS0,115200n8',
        cdrom: {
          url: isoBase,
          async: true,
          size: meta.size,
          use_parts: true,
          fixed_chunk_size: chunkSize,
        },
      });
      window.goricsRealLinuxIso = vm;
      vm.add_listener('download-progress', (data) => log(`download-progress ${progress(data)}`));
      vm.add_listener('download-error', (data) => log(`download-error ${JSON.stringify(data).slice(0, 400)}`));
      vm.add_listener('emulator-loaded', () => log('emulator-loaded'));
      vm.add_listener('emulator-ready', () => log('emulator-ready'));
      vm.add_listener('emulator-started', () => {
        setState('running');
        enableInput();
        focusScreen();
        log('emulator-started');
      });
      vm.add_listener('emulator-stopped', () => log('emulator-stopped'));
      vm.add_listener('screen-set-size', (data) => log(`screen-set-size ${JSON.stringify(data)}`));
      try { vm.add_listener('serial0-output-byte', serialByte); } catch {}
      log(`v86 started with ${new URL(isoBase).hostname} chunks and direct i386 Openbox boot`);
    } catch (error) {
      log(`ERROR ${error?.message || error}`);
      log(`userAgent ${navigator.userAgent}`);
      setState('idle');
    }
  }

  function halt() {
    token += 1;
    try { vm?.destroy?.(); } catch (error) { log(`stop error ${error.message}`); }
    vm = null;
    serial = '';
    inputLogged = false;
    if (screen) { screen.innerHTML = ''; screen.classList.remove('active'); }
    setState('idle');
    log('stopped');
  }

  async function toggleFullscreen() {
    const target = screen.closest('.screen-wrap') || screen;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      if (target.requestFullscreen) {
        await target.requestFullscreen();
        focusScreen();
        return;
      }
    } catch (error) {
      log(`native fullscreen unavailable ${error.message}`);
    }
    const active = !document.body.classList.contains('ios-fullscreen');
    document.body.classList.toggle('ios-fullscreen', active);
    if (full) full.textContent = active ? 'Exit Fullscreen' : 'Fullscreen';
    window.scrollTo(0, 0);
    focusScreen();
    log(active ? 'iOS fullscreen fallback enabled' : 'iOS fullscreen fallback disabled');
  }

  phoneKeyboard.addEventListener('input', () => {
    if (!vm || !phoneKeyboard.value) return;
    vm.keyboard_send_text?.(phoneKeyboard.value);
    phoneKeyboard.value = '';
  });
  phoneKeyboard.addEventListener('keydown', (event) => {
    if (!vm) return;
    if (event.key === 'Enter') {
      vm.keyboard_send_text?.('\n');
      event.preventDefault();
    }
    if (event.key === 'Backspace') {
      vm.keyboard_send_scancodes?.([0x0e, 0x8e]);
      event.preventDefault();
    }
  });

  screen?.addEventListener('pointerdown', () => { enableInput(); focusScreen(); });
  screen?.addEventListener('touchstart', (event) => {
    enableInput();
    const touch = event.touches[0];
    if (touch) lastTouch = { x: touch.clientX, y: touch.clientY };
    focusScreen();
  }, { passive: true });
  screen?.addEventListener('touchmove', (event) => {
    if (!vm || !lastTouch) return;
    const touch = event.touches[0];
    if (!touch) return;
    vm.mouse_send_delta?.(touch.clientX - lastTouch.x, touch.clientY - lastTouch.y);
    lastTouch = { x: touch.clientX, y: touch.clientY };
  }, { passive: true });
  screen?.addEventListener('touchend', () => { lastTouch = null; }, { passive: true });

  boot?.addEventListener('click', run);
  stop?.addEventListener('click', halt);
  full?.addEventListener('click', toggleFullscreen);
  keyboardButton.addEventListener('click', openKeyboard);
  document.addEventListener('fullscreenchange', () => {
    if (full) full.textContent = document.fullscreenElement ? 'Exit Fullscreen' : 'Fullscreen';
    focusScreen();
  });

  setState('idle');
  log('ready: resilient multi-CDN i386 Openbox loader r2 installed');
})();