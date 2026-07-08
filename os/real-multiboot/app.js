(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const logBox = $('#log');
  const screen = $('#screen');
  const boot = $('#boot-btn');
  const stop = $('#stop-btn');
  const full = $('#fullscreen-btn');
  const urlBox = $('#iso-url');

  const iso = new URL('./assets/gorics-linux-gui-web-amd64.iso', location.href).href;
  const metaUrl = new URL('./assets/iso-meta.json', location.href).href;
  const runtime = '/website/vendor/v86/libv86.js';
  const wasm = '/website/vendor/v86/v86.wasm';
  const bios = '/website/vendor/v86/seabios.bin';
  const vga = '/website/vendor/v86/vgabios.bin';

  let vm = null;
  let state = 'idle';
  let bootToken = 0;
  let watchdog = null;
  let inputLogged = false;
  let touchActive = false;
  let lastTouch = null;

  const actions = $('.actions');
  const keyboardButton = document.createElement('button');
  keyboardButton.id = 'keyboard-btn';
  keyboardButton.type = 'button';
  keyboardButton.className = 'secondary';
  keyboardButton.textContent = 'Keyboard';
  if (actions && !$('#keyboard-btn')) {
    actions.insertBefore(keyboardButton, stop || full || null);
  }

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

  if (urlBox) urlBox.textContent = iso;

  function log(text) {
    if (logBox) {
      logBox.textContent += `\n[${new Date().toISOString()}] ${text}`;
      logBox.scrollTop = logBox.scrollHeight;
    }
    console.log('[GORICS ISO]', text);
  }

  function focusScreen() {
    try {
      screen?.focus({ preventScroll: true });
    } catch {
      screen?.focus();
    }
  }

  function enableInputDevices() {
    if (!vm) return;
    try {
      vm.keyboard_set_enabled?.(true);
      vm.mouse_set_enabled?.(true);
      if (!inputLogged) {
        inputLogged = true;
        log('keyboard and pointer input enabled');
      }
    } catch (error) {
      log(`input enable warning ${error.message}`);
    }
  }

  function openVirtualKeyboard() {
    if (state !== 'running') return;
    enableInputDevices();
    phoneKeyboard.value = '';
    try {
      phoneKeyboard.focus({ preventScroll: true });
    } catch {
      phoneKeyboard.focus();
    }
    phoneKeyboard.click();
    log('virtual keyboard requested');
  }

  function constructor() {
    return window.V86 || globalThis.V86 || window.V86Starter || globalThis.V86Starter;
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

  function loadRuntime() {
    return new Promise((resolve, reject) => {
      if (constructor()) return resolve(constructor());
      const script = document.createElement('script');
      script.src = `${runtime}?v=n`;
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
      const cacheNames = await globalThis.caches?.keys?.() || [];
      await Promise.all(cacheNames.filter((name) => name.startsWith('gorics-v86-')).map((name) => caches.delete(name)));
      if (registrations.length || cacheNames.length) log('obsolete ISO workers and caches removed');
    } catch (error) {
      log(`service worker cleanup skipped ${error.message}`);
    }
  }

  function ascii(array, offset, length) {
    return String.fromCharCode(...array.slice(offset, offset + length));
  }

  async function getMeta() {
    log('loading QEMU-tested ISO metadata');
    const response = await fetch(`${metaUrl}?v=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`ISO metadata HTTP ${response.status}`);
    const meta = await response.json();
    if (meta.name !== 'gorics-linux-gui-web-amd64.iso') throw new Error(`unexpected ISO name ${meta.name}`);
    if (!Number.isFinite(meta.size) || meta.size <= 0 || meta.size >= 900000000) throw new Error(`invalid ISO size ${meta.size}`);
    log(`ISO size=${meta.size} sha256=${String(meta.sha256).slice(0, 16)}... architecture=${meta.architecture || 'unknown'} desktop=${meta.desktop || 'unknown'}`);
    return { url: iso, size: meta.size };
  }

  async function probe(meta) {
    log('probing same-origin ISO range and boot records');
    const response = await fetch(meta.url, {
      cache: 'no-store',
      headers: { Range: 'bytes=32768-36863' },
    });
    if (response.status !== 206) throw new Error(`ISO range expected HTTP 206, got ${response.status}`);
    const data = new Uint8Array(await response.arrayBuffer());
    if (data.length !== 4096) throw new Error(`ISO range size ${data.length}`);
    const primary = ascii(data, 1, 5);
    const bootRecord = ascii(data, 2049, 5);
    const bootSystem = ascii(data, 2055, 32).replace(/\0/g, '').trim();
    if (primary !== 'CD001') throw new Error('ISO9660 descriptor missing');
    if (bootRecord !== 'CD001' || !bootSystem.includes('EL TORITO')) throw new Error('El Torito boot record missing');
    log('ISO range HTTP 206 bytes=4096');
    log('ISO9660 and El Torito verified');
  }

  function prepareScreen() {
    if (!screen) throw new Error('screen container missing');
    screen.innerHTML = '<div style="white-space:pre;font:14px monospace;line-height:14px"></div><canvas style="display:none"></canvas>';
    screen.classList.add('active');
  }

  function progress(data) {
    if (!data || typeof data !== 'object') return '';
    const loaded = Number(data.loaded) || 0;
    const total = Number(data.total) || 0;
    const percent = total > 0 ? `${Math.floor(loaded * 100 / total)}%` : 'loading';
    return ` ${data.file_name || 'file'} ${percent} (${loaded}/${total})`;
  }

  async function run() {
    if (!screen || !boot || state !== 'idle') return;
    const token = ++bootToken;
    setState('loading');
    focusScreen();
    try {
      await clearOldWorkers();
      const [Emulator, meta] = await Promise.all([loadRuntime(), getMeta()]);
      await probe(meta);
      if (token !== bootToken) return;
      log(`runtime loaded ${runtime}`);
      prepareScreen();
      setState('starting');

      const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      const memoryMiB = mobile ? 384 : 512;
      const vgaMiB = mobile ? 16 : 32;
      log(`VM profile memory=${memoryMiB}MiB vga=${vgaMiB}MiB mobile=${mobile}`);

      vm = new Emulator({
        wasm_path: wasm,
        bios: { url: bios },
        vga_bios: { url: vga },
        screen_container: screen,
        autostart: true,
        memory_size: memoryMiB * 1024 * 1024,
        vga_memory_size: vgaMiB * 1024 * 1024,
        disable_speaker: true,
        boot_order: 0x123,
        cdrom: {
          url: meta.url,
          async: true,
          size: meta.size,
          fixed_chunk_size: 2 * 1024 * 1024,
        },
      });
      window.goricsRealLinuxIso = vm;
      vm.add_listener('download-progress', (data) => log(`download-progress${progress(data)}`));
      vm.add_listener('download-error', (data) => {
        log(`download-error ${JSON.stringify(data).slice(0, 500)}`);
        setState('idle');
      });
      vm.add_listener('emulator-loaded', () => log('emulator-loaded'));
      vm.add_listener('emulator-ready', () => {
        enableInputDevices();
        log('emulator-ready');
      });
      vm.add_listener('emulator-started', () => {
        clearTimeout(watchdog);
        setState('running');
        enableInputDevices();
        focusScreen();
        log('emulator-started');
      });
      vm.add_listener('emulator-stopped', () => log('emulator-stopped'));
      vm.add_listener('screen-set-size', (data) => log(`screen-set-size ${JSON.stringify(data)}`));
      log('v86 started with keyboard, mouse and touch bridge');
      watchdog = setTimeout(() => {
        if (state === 'starting') log('still loading tested ISO');
      }, 30000);
    } catch (error) {
      log(`ERROR ${error?.message || error}`);
      log(`userAgent ${navigator.userAgent}`);
      try { vm?.destroy?.(); } catch {}
      vm = null;
      setState('idle');
    }
  }

  function halt() {
    bootToken++;
    clearTimeout(watchdog);
    try {
      vm?.destroy?.();
    } catch (error) {
      log(`stop error ${error.message}`);
    }
    vm = null;
    inputLogged = false;
    touchActive = false;
    lastTouch = null;
    screen?.classList.remove('active');
    if (screen) screen.innerHTML = '';
    setState('idle');
    log('stopped');
  }

  function dispatchTouchMouse(type, touch, buttons) {
    if (!touch || !screen) return;
    const target = document.elementFromPoint(touch.clientX, touch.clientY);
    const receiver = target && screen.contains(target) ? target : screen;
    const event = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: touch.clientX,
      clientY: touch.clientY,
      screenX: touch.screenX,
      screenY: touch.screenY,
      button: 0,
      buttons,
    });
    try {
      Object.defineProperty(event, 'which', { value: 1 });
    } catch {}
    receiver.dispatchEvent(event);
  }

  function onTouchStart(event) {
    if (state !== 'running' || !event.changedTouches?.length) return;
    event.preventDefault();
    const touch = event.changedTouches[event.changedTouches.length - 1];
    touchActive = true;
    lastTouch = touch;
    enableInputDevices();
    focusScreen();
    dispatchTouchMouse('mousemove', touch, 0);
    dispatchTouchMouse('mousedown', touch, 1);
  }

  function onTouchMove(event) {
    if (!touchActive || state !== 'running' || !event.changedTouches?.length) return;
    event.preventDefault();
    const touch = event.changedTouches[event.changedTouches.length - 1];
    lastTouch = touch;
    dispatchTouchMouse('mousemove', touch, 1);
  }

  function onTouchEnd(event) {
    if (!touchActive) return;
    event.preventDefault();
    const touch = event.changedTouches?.[event.changedTouches.length - 1] || lastTouch;
    dispatchTouchMouse('mouseup', touch, 0);
    touchActive = false;
    lastTouch = null;
    focusScreen();
  }

  async function toggleFullscreen() {
    const wrapper = screen?.closest('.screen-wrap') || screen;
    if (!wrapper) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      if (wrapper.requestFullscreen) {
        await wrapper.requestFullscreen();
        focusScreen();
        return;
      }
    } catch (error) {
      log(`native fullscreen unavailable ${error.message}`);
    }
    const enabled = !document.body.classList.contains('ios-fullscreen');
    document.body.classList.toggle('ios-fullscreen', enabled);
    if (full) full.textContent = enabled ? 'Exit Fullscreen' : 'Fullscreen';
    window.scrollTo(0, 0);
    focusScreen();
    log(enabled ? 'iOS fullscreen fallback enabled' : 'iOS fullscreen fallback disabled');
  }

  function sendScancode(make, release = make | 0x80) {
    vm?.keyboard_send_scancodes?.([make, release]);
  }

  boot?.addEventListener('click', run);
  stop?.addEventListener('click', halt);
  keyboardButton.addEventListener('click', openVirtualKeyboard);
  phoneKeyboard.addEventListener('input', () => {
    const text = phoneKeyboard.value;
    if (text) vm?.keyboard_send_text?.(text);
    phoneKeyboard.value = '';
  });
  phoneKeyboard.addEventListener('keydown', (event) => {
    const keys = {
      Backspace: 0x0e,
      Enter: 0x1c,
      Tab: 0x0f,
      Escape: 0x01,
      ArrowUp: 0x48,
      ArrowDown: 0x50,
      ArrowLeft: 0x4b,
      ArrowRight: 0x4d,
    };
    const code = keys[event.key];
    if (code) {
      sendScancode(code);
      event.preventDefault();
    }
  });
  screen?.addEventListener('pointerdown', () => {
    enableInputDevices();
    focusScreen();
  });
  screen?.addEventListener('touchstart', onTouchStart, { passive: false });
  screen?.addEventListener('touchmove', onTouchMove, { passive: false });
  screen?.addEventListener('touchend', onTouchEnd, { passive: false });
  screen?.addEventListener('touchcancel', onTouchEnd, { passive: false });
  full?.addEventListener('click', toggleFullscreen);
  document.addEventListener('fullscreenchange', () => {
    if (full) full.textContent = document.fullscreenElement ? 'Exit Fullscreen' : 'Fullscreen';
    focusScreen();
  });
  window.addEventListener('keydown', enableInputDevices, true);
  window.addEventListener('focus', enableInputDevices);

  setState('idle');
  log('ready: keyboard, touch and pointer bridge installed');
})();
