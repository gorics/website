(() => {
  'use strict';

  const BUILD = '20260708-r8-overlay-complete';
  const $ = (selector) => document.querySelector(selector);
  const logBox = $('#log');
  const screen = $('#screen');
  const screenWrap = $('#screen-wrap');
  const bootButton = $('#boot-btn');
  const stopButton = $('#stop-btn');
  const fullscreenButton = $('#fullscreen-btn');
  const keyboardButton = $('#keyboard-btn');
  const copyLogButton = $('#copy-log-btn');
  const osSelect = $('#os-select');
  const sourceBox = $('#iso-url');
  const stageLabel = $('#stage-label');
  const stageDetail = $('#stage-detail');
  const progressPercent = $('#progress-percent');
  const progressBar = $('#progress-bar');
  const overlay = $('#loading-overlay');
  const overlayTitle = $('#overlay-title');
  const overlayDetail = $('#overlay-detail');
  const overlayPercent = $('#overlay-percent');
  const overlayProgressBar = $('#overlay-progress-bar');
  const stepNodes = [...document.querySelectorAll('#boot-steps [data-step]')];

  const runtime = '/website/vendor/v86/libv86.js';
  const wasm = '/website/vendor/v86/v86.wasm';
  const bios = '/website/vendor/v86/seabios.bin';
  const vgaBios = '/website/vendor/v86/vgabios.bin';
  const assetName = 'gorics-linux-gui-web-i386.iso';
  const chunkSize = 16 * 1024 * 1024;
  const chunkRoots = [
    'https://cdn.jsdelivr.net/gh/gorics/website@os-assets/os/real-multiboot/assets/v86-parts/',
    'https://fastly.jsdelivr.net/gh/gorics/website@os-assets/os/real-multiboot/assets/v86-parts/',
    'https://gcore.jsdelivr.net/gh/gorics/website@os-assets/os/real-multiboot/assets/v86-parts/',
    'https://cdn.statically.io/gh/gorics/website/os-assets/os/real-multiboot/assets/v86-parts/',
    'https://raw.githubusercontent.com/gorics/website/os-assets/os/real-multiboot/assets/v86-parts/',
  ];
  const metaUrl = new URL('./assets/iso-meta.json', location.href).href;
  const kernelUrl = new URL('./assets/vmlinuz', location.href).href;
  const initrdUrl = new URL('./assets/initrd.img', location.href).href;

  const presets = {
    gorics: {
      name: 'GORICS Linux GUI', icon: 'G', kind: 'CUSTOM ISO · GUI', memory: 384, vga: 32,
      media: 'ISO + kernel/initrd', description: '실제 i386 Linux ISO와 Openbox 데스크톱을 다중 CDN 청크로 부팅합니다.',
      mode: 'gorics', source: 'GORICS 다중 CDN 청크 ISO',
    },
    buildroot: {
      name: 'Buildroot Linux', icon: '⚡', kind: 'LINUX · CONSOLE', memory: 128, vga: 8,
      media: 'bzImage', description: '작은 Buildroot 커널을 빠르게 부팅하는 경량 콘솔 Linux입니다.',
      mode: 'direct', source: 'https://i.copy.sh/buildroot-bzimage68.bin',
      boot: { bzimage: { url: 'https://i.copy.sh/buildroot-bzimage68.bin', async: true }, cmdline: 'rw root=/dev/ram0 console=ttyS0 console=tty0' },
    },
    dsl: {
      name: 'Damn Small Linux GUI', icon: '🖥', kind: 'LINUX · GUI ISO', memory: 192, vga: 16,
      media: 'CD-ROM ISO', description: '작은 GUI Linux ISO를 CD-ROM 방식으로 부팅합니다.',
      mode: 'direct', source: 'https://i.copy.sh/linux4.iso',
      boot: { cdrom: { url: 'https://i.copy.sh/linux4.iso', async: true } },
    },
    tiny: {
      name: 'Tiny Linux ISO', icon: '🐧', kind: 'LINUX · TINY ISO', memory: 128, vga: 8,
      media: 'CD-ROM ISO', description: 'v86 호환성 확인에 적합한 초경량 Linux ISO입니다.',
      mode: 'direct', source: 'https://i.copy.sh/linux.iso',
      boot: { cdrom: { url: 'https://i.copy.sh/linux.iso', async: true } },
    },
    freedos: {
      name: 'FreeDOS', icon: '⌨', kind: 'DOS · HDD IMAGE', memory: 64, vga: 4,
      media: 'HDD image', description: '작고 안정적인 FreeDOS HDD 이미지를 부팅합니다.',
      mode: 'direct', source: 'https://i.copy.sh/freedos722.img',
      boot: { hda: { url: 'https://i.copy.sh/freedos722.img', async: true } },
    },
    'buildroot-serial': {
      name: 'Buildroot Serial', icon: '▣', kind: 'LINUX · SERIAL', memory: 192, vga: 8,
      media: 'bzImage', description: 'Buildroot를 serial·tty0 콘솔로 부팅하는 진단 설정입니다.',
      mode: 'direct', source: 'https://i.copy.sh/buildroot-bzimage68.bin',
      boot: { bzimage: { url: 'https://i.copy.sh/buildroot-bzimage68.bin', async: true }, cmdline: 'rw root=/dev/ram0 console=ttyS0 console=tty0 init=/sbin/init' },
    },
    'dsl-high': {
      name: 'DSL GUI High Memory', icon: '🚀', kind: 'LINUX · GUI ISO', memory: 384, vga: 16,
      media: 'CD-ROM ISO', description: 'Damn Small Linux GUI를 384 MB RAM으로 실행합니다.',
      mode: 'direct', source: 'https://i.copy.sh/linux4.iso',
      boot: { cdrom: { url: 'https://i.copy.sh/linux4.iso', async: true } },
    },
  };

  const stepOrder = ['prepare', 'runtime', 'media', 'emulator', 'boot', 'display'];
  let vm = null;
  let state = 'idle';
  let token = 0;
  let selectedPreset = 'gorics';
  let selectedIsoBase = chunkRoots[0] + assetName;
  let serialBuffer = '';
  let inputLogged = false;
  let lastTouch = null;
  let bootTimeout = null;
  let displayTimer = null;
  let displayCompletedToken = 0;
  let lastProgressSignature = '';

  const phoneKeyboard = document.createElement('input');
  phoneKeyboard.id = 'phone-keyboard';
  phoneKeyboard.className = 'phone_keyboard';
  phoneKeyboard.type = 'text';
  phoneKeyboard.inputMode = 'text';
  phoneKeyboard.autocomplete = 'off';
  phoneKeyboard.autocapitalize = 'off';
  phoneKeyboard.autocorrect = 'off';
  phoneKeyboard.spellcheck = false;
  phoneKeyboard.setAttribute('aria-label', '가상 머신 키보드 입력');
  document.body.appendChild(phoneKeyboard);

  function log(message, level = 'info') {
    const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}`;
    if (logBox) {
      logBox.textContent += `\n${line}`;
      logBox.scrollTop = logBox.scrollHeight;
    }
    const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
    console[method]('[GORICS MULTIBOOT]', message);
  }

  function clampPercent(value) {
    return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  }

  function updateSteps(activeStep, mode = 'working') {
    const activeIndex = stepOrder.indexOf(activeStep);
    stepNodes.forEach((node) => {
      const index = stepOrder.indexOf(node.dataset.step);
      node.classList.remove('active', 'done', 'failed');
      if (mode === 'error' && index === activeIndex) node.classList.add('failed');
      else if (activeIndex >= 0 && index < activeIndex) node.classList.add('done');
      else if (index === activeIndex) node.classList.add(mode === 'success' ? 'done' : 'active');
      else if (mode === 'success' && activeIndex === stepOrder.length - 1) node.classList.add('done');
    });
  }

  function setStage(step, title, detail, percent, mode = 'working') {
    const value = clampPercent(percent);
    if (stageLabel) stageLabel.textContent = title;
    if (stageDetail) stageDetail.textContent = detail;
    if (progressPercent) progressPercent.textContent = `${value}%`;
    if (progressBar) progressBar.style.width = `${value}%`;
    if (overlayTitle) overlayTitle.textContent = title;
    if (overlayDetail) overlayDetail.textContent = detail;
    if (overlayPercent) overlayPercent.textContent = `${value}%`;
    if (overlayProgressBar) overlayProgressBar.style.width = `${value}%`;
    if (overlay) {
      const preserveHidden = state === 'running' && mode !== 'error' && mode !== 'idle';
      overlay.classList.remove('idle', 'error', 'success');
      if (!preserveHidden) {
        overlay.classList.remove('hidden');
        overlay.removeAttribute('aria-hidden');
      }
      if (mode === 'idle') overlay.classList.add('idle');
      if (mode === 'error') overlay.classList.add('error');
      if (mode === 'success') overlay.classList.add('success');
    }
    updateSteps(step, mode);
    log(`stage step=${step || 'none'} mode=${mode} progress=${value}% title=${title} detail=${detail}`);
  }

  function hideOverlay() {
    if (!overlay) return;
    overlay.classList.add('hidden');
    overlay.setAttribute('aria-hidden', 'true');
  }

  function setState(next) {
    state = next;
    const busy = next === 'checking' || next === 'starting';
    if (bootButton) {
      bootButton.disabled = busy;
      bootButton.textContent = next === 'checking' ? '부팅 준비 중…' : next === 'starting' ? 'OS 부팅 중…' : next === 'running' ? '실행 중' : next === 'error' ? '다시 부팅' : '선택 OS 부팅';
    }
    if (stopButton) stopButton.disabled = next === 'idle' || next === 'error';
    if (keyboardButton) keyboardButton.disabled = next !== 'running';
    if (osSelect) osSelect.disabled = busy || next === 'running';
    log(`state changed ${next}`);
  }

  function focusScreen() {
    try { screen?.focus({ preventScroll: true }); } catch { screen?.focus(); }
  }

  function emulatorConstructor() {
    return window.V86 || globalThis.V86 || window.V86Starter || globalThis.V86Starter;
  }

  function loadRuntime() {
    return new Promise((resolve, reject) => {
      const existing = emulatorConstructor();
      if (existing) {
        log('v86 runtime already available');
        resolve(existing);
        return;
      }
      setStage('runtime', 'v86 런타임 불러오는 중', `${runtime} 스크립트를 다운로드하고 있습니다.`, 16);
      const script = document.createElement('script');
      script.src = `${runtime}?v=${BUILD}`;
      script.async = false;
      script.onload = () => setTimeout(() => {
        const loaded = emulatorConstructor();
        if (loaded) {
          log('v86 runtime loaded and constructor detected');
          resolve(loaded);
        } else reject(new Error('v86 constructor missing after runtime load'));
      }, 60);
      script.onerror = () => reject(new Error(`runtime load failed ${runtime}`));
      document.head.appendChild(script);
    });
  }

  async function clearOldWorkers() {
    setStage('prepare', '이전 실행 정리 중', '오래된 서비스워커와 ISO 캐시를 정리하고 있습니다.', 7);
    try {
      const registrations = await navigator.serviceWorker?.getRegistrations?.() || [];
      for (const registration of registrations) {
        if (registration.scope.includes('/os/real-multiboot/')) {
          log(`unregistering service worker scope=${registration.scope}`);
          await registration.unregister();
        }
      }
      const names = await globalThis.caches?.keys?.() || [];
      for (const name of names) {
        if (/gorics|v86|iso/i.test(name)) {
          log(`deleting old cache name=${name}`);
          await globalThis.caches.delete(name);
        }
      }
      log('old worker and cache cleanup complete');
    } catch (error) {
      log(`old worker cleanup warning ${error.message}`, 'warn');
    }
  }

  async function loadMetadata() {
    setStage('media', 'GORICS ISO 정보 확인 중', 'ISO 크기, 청크 수, 아키텍처와 체크섬 정보를 읽고 있습니다.', 28);
    const response = await fetch(`${metaUrl}?v=${BUILD}-${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`ISO metadata HTTP ${response.status}`);
    const meta = await response.json();
    if (meta.name !== assetName) throw new Error(`unexpected ISO ${meta.name}`);
    if (meta.architecture !== 'i386') throw new Error(`unexpected architecture ${meta.architecture}`);
    if (!Number.isFinite(meta.size) || meta.size <= 0) throw new Error(`invalid ISO size ${meta.size}`);
    if (meta.chunk_size !== chunkSize) throw new Error(`invalid chunk size ${meta.chunk_size}`);
    if (!Number.isInteger(meta.parts) || meta.parts < 1) throw new Error(`invalid part count ${meta.parts}`);
    log(`metadata verified name=${meta.name} architecture=${meta.architecture} size=${meta.size} parts=${meta.parts} chunk=${meta.chunk_size} sha256=${String(meta.sha256).slice(0, 24)}...`);
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

  async function rangeFetch(url, range, attempts = 3) {
    let lastError = null;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        log(`range request attempt=${attempt}/${attempts} range=${range} url=${url}`);
        const join = url.includes('?') ? '&' : '?';
        const response = await fetch(`${url}${join}v=${BUILD}-${attempt}-${Date.now()}`, {
          cache: 'no-store', headers: { Range: `bytes=${range}` },
        });
        if (response.status !== 200 && response.status !== 206) throw new Error(`HTTP ${response.status}`);
        log(`range response status=${response.status} content-length=${response.headers.get('content-length') || 'unknown'} url=${url}`);
        return response;
      } catch (error) {
        lastError = error;
        log(`range request failed attempt=${attempt} url=${url} error=${error.message}`, 'warn');
        if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 650));
      }
    }
    throw lastError || new Error('range request failed');
  }

  async function selectChunkSource(meta) {
    const finalStart = (meta.parts - 1) * chunkSize;
    const failures = [];
    let index = 0;
    for (const root of chunkRoots) {
      index += 1;
      const candidate = root + assetName;
      const label = new URL(root).hostname;
      setStage('media', 'ISO CDN 검사 중', `${label}의 첫 청크와 마지막 청크를 검증하고 있습니다. (${index}/${chunkRoots.length})`, 30 + index * 2);
      try {
        const firstPart = partUrl(candidate, 0, chunkSize);
        const firstResponse = await rangeFetch(firstPart, '32768-36863');
        let firstBytes = new Uint8Array(await firstResponse.arrayBuffer());
        if (firstResponse.status === 200 && firstBytes.length >= 36864) firstBytes = firstBytes.slice(32768, 36864);
        if (firstBytes.length !== 4096) throw new Error(`first probe size ${firstBytes.length}`);
        if (ascii(firstBytes, 1, 5) !== 'CD001') throw new Error('ISO9660 descriptor missing');
        if (ascii(firstBytes, 2049, 5) !== 'CD001' || !ascii(firstBytes, 2055, 32).includes('EL TORITO')) throw new Error('El Torito record missing');
        log(`ISO9660 and El Torito verified source=${label}`);

        const finalPart = partUrl(candidate, finalStart, finalStart + chunkSize);
        const finalResponse = await rangeFetch(finalPart, '0-15');
        const finalBytes = new Uint8Array(await finalResponse.arrayBuffer());
        if (finalBytes.length < 16) throw new Error(`final probe size ${finalBytes.length}`);

        selectedIsoBase = candidate;
        if (sourceBox) sourceBox.textContent = `${selectedIsoBase}\n자동 CDN 장애 전환 활성화`;
        log(`selected ISO chunk source host=${label} first-and-final-chunks=verified`);
        return;
      } catch (error) {
        failures.push(`${label}: ${error.message}`);
        log(`chunk source rejected host=${label} error=${error.message}`, 'warn');
      }
    }
    throw new Error(`all ISO chunk sources failed: ${failures.join(' | ')}`);
  }

  async function verifyLocalBootFiles() {
    const checks = [
      ['kernel', kernelUrl, 1_000_000], ['initrd', initrdUrl, 10_000_000],
      ['runtime', runtime, 50_000], ['wasm', wasm, 100_000], ['bios', bios, 20_000], ['vga-bios', vgaBios, 10_000],
    ];
    let index = 0;
    for (const [name, url, minimum] of checks) {
      index += 1;
      setStage('media', '부팅 파일 확인 중', `${name} 파일의 공개 배포 상태를 검사하고 있습니다. (${index}/${checks.length})`, 38 + index);
      const response = await fetch(`${url}?v=${BUILD}-${Date.now()}`, { method: 'HEAD', cache: 'no-store' });
      if (!response.ok) throw new Error(`${name} HTTP ${response.status}`);
      const length = Number(response.headers.get('content-length')) || 0;
      if (length && length < minimum) throw new Error(`${name} too small ${length}`);
      log(`boot file available name=${name} status=${response.status} size=${length || 'unknown'} url=${url}`);
    }
  }

  async function probeExternalMedia(preset) {
    setStage('media', '외부 부팅 매체 확인 중', `${preset.source} 연결 상태를 검사하고 있습니다.`, 34);
    if (sourceBox) sourceBox.textContent = preset.source;
    try {
      const response = await fetch(`${preset.source}${preset.source.includes('?') ? '&' : '?'}probe=${BUILD}-${Date.now()}`, {
        cache: 'no-store', headers: { Range: 'bytes=0-1023' },
      });
      if (response.status !== 200 && response.status !== 206) throw new Error(`HTTP ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!bytes.length) throw new Error('empty response');
      log(`external boot media probe success status=${response.status} bytes=${bytes.length} source=${preset.source}`);
    } catch (error) {
      log(`external media preflight warning; continuing with v86 source=${preset.source} error=${error.message}`, 'warn');
      setStage('media', '부팅 매체 직접 연결 중', '사전 검사는 제한됐지만 v86에서 직접 부팅을 계속 시도합니다.', 38);
    }
  }

  function prepareScreen() {
    if (!screen) throw new Error('screen container missing');
    screen.innerHTML = '<div style="white-space:pre;font:14px monospace;line-height:14px"></div><canvas style="display:none"></canvas>';
    screen.classList.add('active');
    log('screen container prepared with text and canvas outputs');
  }

  function buildOptions(preset, meta) {
    const options = {
      wasm_path: wasm,
      bios: { url: bios },
      vga_bios: { url: vgaBios },
      screen_container: screen,
      autostart: true,
      memory_size: preset.memory * 1024 * 1024,
      vga_memory_size: preset.vga * 1024 * 1024,
      disable_speaker: true,
    };
    if (preset.mode === 'gorics') {
      Object.assign(options, {
        bzimage: { url: kernelUrl },
        initrd: { url: initrdUrl },
        cmdline: 'boot=live components live-media=/dev/sr0 username=user hostname=gorics-web systemd.unit=graphical.target console=tty0 console=ttyS0,115200n8',
        cdrom: { url: selectedIsoBase, async: true, size: meta.size, use_parts: true, fixed_chunk_size: chunkSize },
      });
    } else Object.assign(options, preset.boot);
    return options;
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
      log(`input enable warning ${error.message}`, 'warn');
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
      const line = serialBuffer.trim();
      serialBuffer = '';
      if (line && /(Linux version|FreeDOS|Welcome|login|GORICS_|graphical|openbox|xorg|failed|error|panic)/i.test(line)) {
        log(`serial ${line.slice(0, 420)}`, /failed|error|panic/i.test(line) ? 'warn' : 'info');
      }
      if (state !== 'running' && /openbox|graphical target|GORICS_GUI_READY/i.test(line)) {
        setStage('display', '그래픽 데스크톱 실행 중', 'Openbox 그래픽 환경 신호를 확인했습니다.', 99);
      }
      if (/GORICS_WEB_GUI_READY|GORICS_GUI_READY/i.test(line)) {
        const serialRunToken = token;
        const serialPreset = presets[selectedPreset] || presets.gorics;
        let attempts = 0;
        const settleTimer = setInterval(() => {
          attempts += 1;
          if (completeDisplay(serialRunToken, serialPreset, 'serial-gui-ready') || attempts >= 80) {
            clearInterval(settleTimer);
          }
        }, 250);
      }
    } else if (serialBuffer.length < 4000) serialBuffer += character;
  }

  function progressText(data) {
    const loaded = Number(data?.loaded) || 0;
    const total = Number(data?.total) || 0;
    const percent = total > 0 ? Math.floor(loaded * 100 / total) : 0;
    return { loaded, total, percent, file: data?.file_name || data?.url || 'boot asset' };
  }

  function displaySnapshot(preset) {
  const canvas = screen?.querySelector('canvas');
  const text = screen?.querySelector(':scope > div');
  const canvasVisible = Boolean(canvas && getComputedStyle(canvas).display !== 'none');
  const canvasReady = Boolean(canvasVisible && canvas.width >= 320 && canvas.height >= 200);
  const graphicalReady = Boolean(canvasVisible && canvas.width >= 640 && canvas.height >= 480);
  const textContent = text?.textContent || '';
  const textReady = Boolean(text && textContent.trim().length > 0 && getComputedStyle(text).display !== 'none');
  const recentLog = (logBox?.textContent || '').slice(-120000);
  const observed = `${textContent}\n${recentLog}`;
  const presetKey = selectedPreset || 'gorics';
  const fatal = /kernel panic|VFS: Unable to mount root|not a bootable disk|no bootable device|could not read from boot medium/i.test(observed);
  let ready = false;

  if (presetKey === 'gorics' || presetKey === 'dsl' || presetKey === 'dsl-high') {
    ready = graphicalReady;
  } else if (presetKey === 'buildroot' || presetKey === 'buildroot-serial') {
    ready = textReady && (/Welcome to Buildroot|buildroot login:|Please press Enter to activate this console/im.test(observed) || /Files send via emulator appear in \/mnt\/[\s\S]*\n\s*[~\/\\w.-]*[%#]\s*$/im.test(observed) || /\n\s*[~\/\\w.-]+[%#]\s*$/im.test(observed));
  } else if (presetKey === 'freedos') {
    ready = textReady && /Welcome to FreeDOS|FreeCOM version|command\.com|[A-Z]:\\>\s*$/im.test(observed);
  } else if (presetKey === 'tiny') {
    ready = graphicalReady || (textReady && /Tiny Core|Micro Core|tc@box|box login:|Welcome to.*Linux|\n[^\n]*#\s*$/im.test(observed));
  } else {
    ready = canvasReady || textReady;
  }

  if (fatal) ready = false;
  return {
    ready,
    fatal,
    presetKey,
    canvasWidth: canvas?.width || 0,
    canvasHeight: canvas?.height || 0,
    canvasVisible,
    textLength: textContent.trim().length,
    textReady,
  };
}
  function completeDisplay(runToken, preset, trigger = 'canvas-watch') {
    if (runToken !== token || !vm || displayCompletedToken === runToken) return false;
    const display = displaySnapshot(preset);
    if (!display.ready) return false;
    displayCompletedToken = runToken;
    clearInterval(displayTimer);
    log(`display completion trigger=${trigger} preset=${selectedPreset} readiness=strict canvas=${display.canvasWidth}x${display.canvasHeight} canvasVisible=${display.canvasVisible} textLength=${display.textLength}`);
    setStage('display', `${preset.name} 부팅 완료`, '운영체제 준비 조건을 확인했습니다. 화면을 클릭하면 키보드와 포인터 입력이 활성화됩니다.', 100, 'success');
    setState('running');
    enableInput();
    focusScreen();
    clearTimeout(bootTimeout);
    hideOverlay();
    setTimeout(hideOverlay, 650);
    log(`display ready preset=${selectedPreset} name=${preset.name}`);
    return true;
  }

  function beginDisplayWatch(runToken, preset) {
    clearInterval(displayTimer);
    displayTimer = setInterval(() => {
      if (runToken !== token || !vm) {
        clearInterval(displayTimer);
        return;
      }
      completeDisplay(runToken, preset, 'canvas-watch');
    }, 250);
  }

  function addVmListeners(runToken, preset) {
    vm.add_listener('download-progress', (data) => {
      const progress = progressText(data);
      const signature = `${progress.file}:${progress.loaded}:${progress.total}`;
      if (signature === lastProgressSignature) return;
      lastProgressSignature = signature;
      const mapped = progress.total > 0 ? 48 + Math.min(34, Math.floor(progress.percent * 0.34)) : 55;
      setStage('boot', '부팅 데이터 다운로드 중', `${progress.file} ${progress.percent || 0}% · ${progress.loaded}/${progress.total || '?'} bytes`, mapped);
      log(`download-progress file=${progress.file} loaded=${progress.loaded} total=${progress.total} percent=${progress.percent}`);
    });
    vm.add_listener('download-error', (data) => log(`download-error ${JSON.stringify(data).slice(0, 800)}`, 'error'));
    vm.add_listener('emulator-loaded', () => {
      setStage('emulator', '가상 머신 로드 완료', 'v86 하드웨어 구성이 메모리에 올라왔습니다.', 64);
      log('emulator-loaded');
    });
    vm.add_listener('emulator-ready', () => {
      setStage('boot', `${preset.name} 부팅 준비 완료`, 'CPU 실행과 부팅 장치 초기화를 시작합니다.', 72);
      log('emulator-ready');
    });
    vm.add_listener('emulator-started', () => {
      setStage('boot', `${preset.name} 부팅 중`, '커널 또는 부트로더가 실행됐습니다. 첫 화면 출력을 기다리고 있습니다.', 84);
      log('emulator-started');
      beginDisplayWatch(runToken, preset);
    });
    vm.add_listener('emulator-stopped', () => log('emulator-stopped'));
    vm.add_listener('screen-set-size', (data) => {
      log(`screen-set-size ${JSON.stringify(data)}`);
      if (state !== 'running') {
        setStage('display', '화면 해상도 설정 중', `가상 디스플레이 크기가 ${JSON.stringify(data)}로 변경됐습니다.`, 96);
      }
      completeDisplay(runToken, preset, 'screen-set-size');
    });
    try { vm.add_listener('serial0-output-byte', serialByte); } catch (error) { log(`serial listener unavailable ${error.message}`, 'warn'); }
  }

  async function run() {
    if (!screen || !bootButton || state === 'checking' || state === 'starting' || state === 'running') return;
    const runToken = ++token;
    const presetKey = osSelect?.value || 'gorics';
    const preset = presets[presetKey] || presets.gorics;
    selectedPreset = presetKey;
    lastProgressSignature = '';
    serialBuffer = '';
    inputLogged = false;
    displayCompletedToken = 0;
    setState('checking');
    setStage('prepare', `${preset.name} 부팅 준비 중`, '브라우저 기능과 이전 실행 상태를 확인하고 있습니다.', 3);
    focusScreen();
    log(`boot requested build=${BUILD} preset=${presetKey} name=${preset.name} memory=${preset.memory}MB vga=${preset.vga}MB source=${preset.source}`);

    try {
      if (!globalThis.WebAssembly) throw new Error('WebAssembly is not supported by this browser');
      if (!globalThis.isSecureContext && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') throw new Error('secure HTTPS context required');
      await clearOldWorkers();
      if (runToken !== token) return;

      let meta = null;
      const runtimePromise = loadRuntime();
      if (preset.mode === 'gorics') {
        meta = await loadMetadata();
        await Promise.all([selectChunkSource(meta), verifyLocalBootFiles()]);
      } else await probeExternalMedia(preset);
      const Emulator = await runtimePromise;
      if (runToken !== token) return;

      setStage('emulator', '가상 머신 생성 중', `${preset.memory} MB RAM과 ${preset.vga} MB VGA 메모리를 할당하고 있습니다.`, 52);
      prepareScreen();
      setState('starting');
      const options = buildOptions(preset, meta);
      log(`emulator options ${JSON.stringify({ memory_size: options.memory_size, vga_memory_size: options.vga_memory_size, cdrom: options.cdrom?.url, hda: options.hda?.url, bzimage: options.bzimage?.url, cmdline: options.cmdline }).slice(0, 1600)}`);
      vm = new Emulator(options);
      window.goricsRealMultiboot = vm;
      addVmListeners(runToken, preset);
      setStage('emulator', '가상 머신 초기화 중', 'BIOS, VGA BIOS, 메모리와 부팅 장치를 연결하고 있습니다.', 58);
      log(`v86 instance created preset=${presetKey}`);

      clearTimeout(bootTimeout);
      bootTimeout = setTimeout(() => {
        if (runToken !== token || state === 'running') return;
        fail(new Error(`${preset.name} boot timed out after 15 minutes`), 'boot');
      }, 15 * 60 * 1000);
    } catch (error) {
      if (runToken !== token) return;
      fail(error, stepOrder.find((step) => stepNodes.some((node) => node.dataset.step === step && node.classList.contains('active'))) || 'prepare');
    }
  }

  function fail(error, step = 'prepare') {
    clearTimeout(bootTimeout);
    clearInterval(displayTimer);
    try { vm?.destroy?.(); } catch (destroyError) { log(`failed VM cleanup warning ${destroyError.message}`, 'warn'); }
    vm = null;
    if (screen) {
      screen.innerHTML = '';
      screen.classList.remove('active');
    }
    const message = error?.message || String(error);
    log(`ERROR preset=${selectedPreset} step=${step} message=${message}`, 'error');
    log(`userAgent ${navigator.userAgent}`);
    setState('error');
    setStage(step, '부팅 실패 — 다시 시도 가능', message, Number(progressPercent?.textContent?.replace('%', '')) || 0, 'error');
  }

  function halt(options = {}) {
    token += 1;
    clearTimeout(bootTimeout);
    clearInterval(displayTimer);
    try { vm?.destroy?.(); } catch (error) { log(`stop error ${error.message}`, 'warn'); }
    vm = null;
    serialBuffer = '';
    inputLogged = false;
    lastProgressSignature = '';
    if (screen) {
      screen.innerHTML = '';
      screen.classList.remove('active');
    }
    setState('idle');
    const preset = presets[osSelect?.value] || presets.gorics;
    setStage('prepare', '부팅 대기', `${preset.name}을 선택했습니다. 부팅 버튼을 누르세요.`, 0, 'idle');
    if (!options.quiet) log('virtual machine stopped and screen reset');
  }

  function syncPreset() {
    const key = presets[osSelect?.value] ? osSelect.value : 'gorics';
    const preset = presets[key];
    selectedPreset = key;
    $('#target-icon').textContent = preset.icon;
    $('#target-kind').textContent = preset.kind;
    $('#boot-target').textContent = preset.name;
    $('#target-description').textContent = preset.description;
    $('#target-memory').textContent = `RAM ${preset.memory} MB`;
    $('#target-media').textContent = preset.media;
    if (sourceBox) sourceBox.textContent = preset.mode === 'gorics' ? 'GORICS 다중 CDN 소스를 선택할 준비가 되었습니다.' : preset.source;
    const params = new URLSearchParams(location.search);
    params.set('preset', key);
    history.replaceState(null, '', `${location.pathname}?${params.toString()}${location.hash}`);
    if (state !== 'idle' && state !== 'error') halt({ quiet: true });
    setState('idle');
    setStage('prepare', '부팅 대기', `${preset.name}을 선택했습니다. 부팅 버튼을 누르세요.`, 0, 'idle');
    log(`preset selected key=${key} name=${preset.name} memory=${preset.memory}MB media=${preset.media}`);
  }

  async function toggleFullscreen() {
    const target = screenWrap || screen;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      if (target?.requestFullscreen) {
        await target.requestFullscreen();
        focusScreen();
        return;
      }
    } catch (error) {
      log(`native fullscreen unavailable ${error.message}`, 'warn');
    }
    const active = !document.body.classList.contains('ios-fullscreen');
    document.body.classList.toggle('ios-fullscreen', active);
    if (fullscreenButton) fullscreenButton.textContent = active ? '전체화면 종료' : '전체화면';
    window.scrollTo(0, 0);
    focusScreen();
    log(active ? 'iOS fullscreen fallback enabled' : 'iOS fullscreen fallback disabled');
  }

  async function copyLog() {
    const text = logBox?.textContent || '';
    try {
      await navigator.clipboard.writeText(text);
      copyLogButton.textContent = '복사 완료';
      setTimeout(() => { copyLogButton.textContent = '로그 복사'; }, 1300);
      log(`log copied characters=${text.length}`);
    } catch (error) {
      log(`clipboard copy failed ${error.message}`, 'warn');
    }
  }

  phoneKeyboard.addEventListener('input', () => {
    if (!vm || !phoneKeyboard.value) return;
    vm.keyboard_send_text?.(phoneKeyboard.value);
    log(`virtual keyboard text sent length=${phoneKeyboard.value.length}`);
    phoneKeyboard.value = '';
  });
  phoneKeyboard.addEventListener('keydown', (event) => {
    if (!vm) return;
    if (event.key === 'Enter') {
      vm.keyboard_send_text?.('\n');
      event.preventDefault();
      log('virtual keyboard Enter sent');
    }
    if (event.key === 'Backspace') {
      vm.keyboard_send_scancodes?.([0x0e, 0x8e]);
      event.preventDefault();
      log('virtual keyboard Backspace sent');
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

  bootButton?.addEventListener('click', run);
  stopButton?.addEventListener('click', () => halt());
  fullscreenButton?.addEventListener('click', toggleFullscreen);
  keyboardButton?.addEventListener('click', openKeyboard);
  copyLogButton?.addEventListener('click', copyLog);
  osSelect?.addEventListener('change', syncPreset);
  document.addEventListener('fullscreenchange', () => {
    if (fullscreenButton) fullscreenButton.textContent = document.fullscreenElement ? '전체화면 종료' : '전체화면';
    focusScreen();
  });
  window.addEventListener('error', (event) => log(`window error ${event.message} ${event.filename || ''}:${event.lineno || ''}`, 'error'));
  window.addEventListener('unhandledrejection', (event) => log(`unhandled rejection ${event.reason?.stack || event.reason}`, 'error'));

  const requested = new URLSearchParams(location.search).get('preset') || location.hash.replace(/^#/, '');
  if (requested && presets[requested] && osSelect) osSelect.value = requested;
  setState('idle');
  syncPreset();
  log(`ready build=${BUILD} presets=${Object.keys(presets).join(',')} secure=${isSecureContext} wasm=${Boolean(globalThis.WebAssembly)} cores=${navigator.hardwareConcurrency || 'unknown'}`);
})();
