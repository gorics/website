(() => {
  'use strict';

  const VERSION = '20260708r1';
  const REPO = 'gorics/website';
  const RELEASE_TAG = 'gorics-linux-gui-iso-latest';
  const ISO_NAME = 'gorics-linux-gui-os-amd64.iso';
  const ISO_STEM = 'gorics-linux-gui-os-amd64';
  const CHUNK_SIZE = 16 * 1024 * 1024;

  const $ = (selector) => document.querySelector(selector);
  const logBox = $('#log');
  const screen = $('#screen');
  const bootButton = $('#boot-btn');
  const stopButton = $('#stop-btn');
  const fullscreenButton = $('#fullscreen-btn');
  const urlBox = $('#iso-url');
  const actions = $('.actions');

  const baseIsoUrl = new URL(`./v86-parts/${ISO_NAME}`, location.href).href;
  const partsManifestUrl = new URL('./v86-parts/V86-PARTS.txt', location.href).href;
  const runtimeUrl = new URL('./runtime/libv86.js', location.href).href;
  const wasmUrl = new URL('./runtime/v86.wasm', location.href).href;
  const biosUrl = new URL('./runtime/seabios.bin', location.href).href;
  const vgaBiosUrl = new URL('./runtime/vgabios.bin', location.href).href;

  let vm = null;
  let state = 'idle';
  let bootToken = 0;
  let watchdog = null;
  let touchActive = false;
  let lastTouch = null;

  const keyboardButton = document.createElement('button');
  keyboardButton.id = 'keyboard-btn';
  keyboardButton.type = 'button';
  keyboardButton.className = 'secondary';
  keyboardButton.textContent = 'Keyboard';
  actions?.insertBefore(keyboardButton, stopButton || fullscreenButton || null);

  const phoneKeyboard = document.createElement('input');
  phoneKeyboard.id = 'phone-keyboard';
  phoneKeyboard.type = 'text';
  phoneKeyboard.inputMode = 'text';
  phoneKeyboard.autocomplete = 'off';
  phoneKeyboard.autocapitalize = 'off';
  phoneKeyboard.autocorrect = 'off';
  phoneKeyboard.spellcheck = false;
  phoneKeyboard.setAttribute('aria-label', 'Virtual keyboard input');
  Object.assign(phoneKeyboard.style, {
    position: 'fixed',
    left: '-9999px',
    bottom: '0',
    width: '1px',
    height: '1px',
    opacity: '0',
  });
  document.body.appendChild(phoneKeyboard);

  if (urlBox) urlBox.textContent = `${baseIsoUrl} (release chunks)`;

  function log(message) {
    const line = `[${new Date().toISOString()}] ${message}`;
    if (logBox) {
      logBox.textContent += `\n${line}`;
      logBox.scrollTop = logBox.scrollHeight;
    }
    console.log('[GORICS ISO]', message);
  }

  function setState(next) {
    state = next;
    if (bootButton) {
      bootButton.disabled = next !== 'idle';
      bootButton.textContent = next === 'idle'
        ? 'Run ISO'
        : next === 'worker'
          ? 'Preparing'
          : next === 'loading'
            ? 'Checking ISO'
            : next === 'starting'
              ? 'Starting'
              : 'Running';
    }
    if (stopButton) stopButton.disabled = next === 'idle';
    keyboardButton.disabled = next !== 'running';
  }

  function focusScreen() {
    try {
      screen?.focus({ preventScroll: true });
    } catch {
      screen?.focus();
    }
  }

  function emulatorConstructor() {
    return window.V86 || globalThis.V86 || window.V86Starter || globalThis.V86Starter;
  }

  function waitForController(timeoutMs = 3500) {
    if (navigator.serviceWorker.controller) return Promise.resolve(true);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        navigator.serviceWorker.removeEventListener('controllerchange', changed);
        resolve(Boolean(navigator.serviceWorker.controller));
      }, timeoutMs);
      function changed() {
        clearTimeout(timer);
        navigator.serviceWorker.removeEventListener('controllerchange', changed);
        resolve(true);
      }
      navigator.serviceWorker.addEventListener('controllerchange', changed);
    });
  }

  async function ensureServiceWorker() {
    if (!('serviceWorker' in navigator)) throw new Error('service worker unsupported');
    log(`registering same-origin proxy sw.js?v=${VERSION}`);
    await navigator.serviceWorker.register(`./sw.js?v=${VERSION}`, { scope: './', updateViaCache: 'none' });
    await navigator.serviceWorker.ready;
    if (await waitForController()) {
      log('service worker controls runtime and ISO requests');
      return true;
    }
    const url = new URL(location.href);
    if (url.searchParams.get('sw') === VERSION) {
      throw new Error('service worker installed but page is not controlled');
    }
    url.searchParams.set('sw', VERSION);
    log('service worker installed; reloading once for control');
    location.replace(url.href);
    return false;
  }

  function loadRuntime() {
    return new Promise((resolve, reject) => {
      const existing = emulatorConstructor();
      if (existing) return resolve(existing);
      const script = document.createElement('script');
      script.src = `${runtimeUrl}?v=${VERSION}`;
      script.async = false;
      script.onload = () => {
        const Constructor = emulatorConstructor();
        if (Constructor) resolve(Constructor);
        else reject(new Error('v86 constructor missing after runtime load'));
      };
      script.onerror = () => reject(new Error(`runtime load failed ${runtimeUrl}`));
      document.head.appendChild(script);
    });
  }

  function parsePartsManifest(text) {
    const values = {};
    for (const line of text.split(/\r?\n/)) {
      const index = line.indexOf('=');
      if (index > 0) values[line.slice(0, index).trim()] = line.slice(index + 1).trim();
    }
    const size = Number(values.size);
    const chunkSize = Number(values.chunk_size || CHUNK_SIZE);
    const parts = Number(values.parts || Math.ceil(size / chunkSize));
    if (values.iso !== ISO_NAME) throw new Error(`unexpected manifest ISO ${values.iso || 'missing'}`);
    if (!Number.isFinite(size) || size <= 0) throw new Error(`invalid manifest size ${values.size}`);
    if (chunkSize !== CHUNK_SIZE) throw new Error(`unexpected chunk size ${chunkSize}`);
    if (!Number.isFinite(parts) || parts !== Math.ceil(size / CHUNK_SIZE)) throw new Error(`invalid part count ${parts}`);
    return { size, parts, chunkSize };
  }

  async function getIsoMetadata() {
    log('loading QEMU-tested release chunk manifest');
    try {
      const response = await fetch(`${partsManifestUrl}?v=${VERSION}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`manifest HTTP ${response.status}`);
      const metadata = parsePartsManifest(await response.text());
      log(`ISO manifest size=${metadata.size} parts=${metadata.parts} chunk=${metadata.chunkSize}`);
      return metadata;
    } catch (manifestError) {
      log(`manifest fallback: ${manifestError.message}`);
      const api = `https://api.github.com/repos/${REPO}/releases/tags/${RELEASE_TAG}`;
      const response = await fetch(api, { cache: 'no-store', headers: { Accept: 'application/vnd.github+json' } });
      if (!response.ok) throw new Error(`release metadata HTTP ${response.status}`);
      const release = await response.json();
      const assets = Array.isArray(release.assets) ? release.assets : [];
      const isoAsset = assets.find((asset) => asset.name === ISO_NAME);
      if (!isoAsset || !Number.isFinite(isoAsset.size) || isoAsset.size <= 0) throw new Error('ISO release asset missing');
      const parts = Math.ceil(isoAsset.size / CHUNK_SIZE);
      const first = `${ISO_STEM}-0-${CHUNK_SIZE}.iso`;
      const lastStart = (parts - 1) * CHUNK_SIZE;
      const last = `${ISO_STEM}-${lastStart}-${lastStart + CHUNK_SIZE}.iso`;
      const names = new Set(assets.map((asset) => asset.name));
      if (!names.has(first) || !names.has(last)) throw new Error('release ISO chunks incomplete');
      log(`release metadata size=${isoAsset.size} parts=${parts}`);
      return { size: isoAsset.size, parts, chunkSize: CHUNK_SIZE };
    }
  }

  function prepareScreen() {
    if (!screen) throw new Error('screen container missing');
    screen.innerHTML = '<div style="white-space:pre;font:14px monospace;line-height:14px"></div><canvas style="display:none"></canvas>';
    screen.classList.add('active');
  }

  function progressText(data) {
    if (!data || typeof data !== 'object') return '';
    const loaded = Number(data.loaded) || 0;
    const total = Number(data.total) || 0;
    const percent = total > 0 ? `${Math.floor((loaded * 100) / total)}%` : 'loading';
    return ` ${data.file_name || 'file'} ${percent} (${loaded}/${total})`;
  }

  function enableInput() {
    if (!vm) return;
    try {
      vm.keyboard_set_enabled?.(true);
      vm.mouse_set_enabled?.(true);
    } catch (error) {
      log(`input warning ${error.message}`);
    }
  }

  async function run() {
    if (!screen || !bootButton || state !== 'idle') return;
    const token = ++bootToken;
    setState('worker');
    focusScreen();
    try {
      if (!await ensureServiceWorker()) return;
      setState('loading');
      const [Constructor, metadata] = await Promise.all([loadRuntime(), getIsoMetadata()]);
      if (token !== bootToken) return;
      log(`runtime ready ${runtimeUrl}`);
      prepareScreen();
      setState('starting');

      const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      const memoryMiB = mobile ? 384 : 512;
      const vgaMiB = mobile ? 16 : 32;
      log(`creating VM memory=${memoryMiB}MiB vga=${vgaMiB}MiB mobile=${mobile}`);

      vm = new Constructor({
        wasm_path: wasmUrl,
        bios: { url: biosUrl },
        vga_bios: { url: vgaBiosUrl },
        screen_container: screen,
        autostart: true,
        memory_size: memoryMiB * 1024 * 1024,
        vga_memory_size: vgaMiB * 1024 * 1024,
        disable_speaker: true,
        boot_order: 0x123,
        cdrom: {
          url: baseIsoUrl,
          async: true,
          size: metadata.size,
          use_parts: true,
          fixed_chunk_size: CHUNK_SIZE,
        },
      });
      window.goricsRealLinuxIso = vm;

      vm.add_listener('download-progress', (data) => log(`download-progress${progressText(data)}`));
      vm.add_listener('download-error', (data) => {
        log(`download-error ${JSON.stringify(data).slice(0, 500)}`);
        setState('idle');
      });
      vm.add_listener('emulator-loaded', () => log('emulator-loaded'));
      vm.add_listener('emulator-ready', () => {
        enableInput();
        log('emulator-ready');
      });
      vm.add_listener('emulator-started', () => {
        clearTimeout(watchdog);
        setState('running');
        enableInput();
        focusScreen();
        log('emulator-started');
      });
      vm.add_listener('emulator-stopped', () => log('emulator-stopped'));
      vm.add_listener('screen-set-size', (data) => log(`screen-set-size ${JSON.stringify(data)}`));
      log('v86 started through same-origin runtime and release chunk proxy');
      watchdog = setTimeout(() => {
        if (state === 'starting') log('still booting: waiting for runtime compilation and ISO chunks');
      }, 30000);
    } catch (error) {
      log(`ERROR ${error?.message || error}`);
      log(`userAgent ${navigator.userAgent}`);
      setState('idle');
    }
  }

  function halt() {
    bootToken += 1;
    clearTimeout(watchdog);
    try {
      vm?.destroy?.();
    } catch (error) {
      log(`stop error ${error.message}`);
    }
    vm = null;
    touchActive = false;
    lastTouch = null;
    screen?.classList.remove('active');
    if (screen) screen.innerHTML = '';
    setState('idle');
    log('stopped');
  }

  function dispatchTouchMouse(type, touch, buttons) {
    if (!screen || !touch) return;
    const target = document.elementFromPoint(touch.clientX, touch.clientY);
    const receiver = target && screen.contains(target) ? target : screen;
    receiver.dispatchEvent(new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: touch.clientX,
      clientY: touch.clientY,
      screenX: touch.screenX,
      screenY: touch.screenY,
      button: 0,
      buttons,
    }));
  }

  function onTouchStart(event) {
    if (state !== 'running' || !event.changedTouches?.length) return;
    event.preventDefault();
    const touch = event.changedTouches[event.changedTouches.length - 1];
    touchActive = true;
    lastTouch = touch;
    enableInput();
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

  function openVirtualKeyboard() {
    if (state !== 'running') return;
    enableInput();
    phoneKeyboard.value = '';
    phoneKeyboard.focus({ preventScroll: true });
    phoneKeyboard.click();
    log('virtual keyboard requested');
  }

  async function toggleFullscreen() {
    const wrapper = screen?.closest('.screen-wrap') || screen;
    if (!wrapper) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (wrapper.requestFullscreen) {
        await wrapper.requestFullscreen();
      } else {
        throw new Error('Fullscreen API unavailable');
      }
      focusScreen();
      return;
    } catch (error) {
      log(`native fullscreen fallback ${error.message}`);
    }
    const enabled = !document.body.classList.contains('ios-fullscreen');
    document.body.classList.toggle('ios-fullscreen', enabled);
    if (fullscreenButton) fullscreenButton.textContent = enabled ? 'Exit Fullscreen' : 'Fullscreen';
    window.scrollTo(0, 0);
    focusScreen();
  }

  bootButton?.addEventListener('click', run);
  stopButton?.addEventListener('click', halt);
  keyboardButton.addEventListener('click', openVirtualKeyboard);
  phoneKeyboard.addEventListener('input', () => {
    const text = phoneKeyboard.value;
    if (text && vm?.keyboard_send_text) vm.keyboard_send_text(text);
    phoneKeyboard.value = '';
  });
  phoneKeyboard.addEventListener('keydown', (event) => {
    if (event.key === 'Backspace' && vm?.keyboard_send_scancodes) {
      vm.keyboard_send_scancodes([0x0e, 0x8e]);
      event.preventDefault();
    }
  });
  screen?.addEventListener('pointerdown', () => {
    enableInput();
    focusScreen();
  });
  screen?.addEventListener('touchstart', onTouchStart, { passive: false });
  screen?.addEventListener('touchmove', onTouchMove, { passive: false });
  screen?.addEventListener('touchend', onTouchEnd, { passive: false });
  screen?.addEventListener('touchcancel', onTouchEnd, { passive: false });
  fullscreenButton?.addEventListener('click', toggleFullscreen);
  document.addEventListener('fullscreenchange', () => {
    if (fullscreenButton) fullscreenButton.textContent = document.fullscreenElement ? 'Exit Fullscreen' : 'Fullscreen';
    focusScreen();
  });
  window.addEventListener('keydown', enableInput, true);

  setState('idle');
  log(`ready: resilient release-chunk boot loader ${VERSION}`);
})();
