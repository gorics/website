(() => {
  'use strict';

  const CDN_LIST = [
    {
      name: 'jsDelivr v86',
      lib: 'https://cdn.jsdelivr.net/npm/v86@0.5.44/build/libv86.js',
      wasm: 'https://cdn.jsdelivr.net/npm/v86@0.5.44/build/v86.wasm',
      bios: 'https://cdn.jsdelivr.net/npm/v86@0.5.44/bios/seabios.bin',
      vga: 'https://cdn.jsdelivr.net/npm/v86@0.5.44/bios/vgabios.bin',
    },
    {
      name: 'copy.sh v86',
      lib: 'https://copy.sh/v86/build/libv86.js',
      wasm: 'https://copy.sh/v86/build/v86.wasm',
      bios: 'https://copy.sh/v86/bios/seabios.bin',
      vga: 'https://copy.sh/v86/bios/vgabios.bin',
    },
  ];

  const OS_PRESETS = [
    {
      id: 'gorics-linux-iso',
      label: 'GORICS Linux ISO (사이트 내 실제 ISO)',
      detail: 'os/linux/1/linux.iso를 CD-ROM으로 직접 부팅합니다. HTML 가짜 UI가 아닙니다.',
      memorySize: 192 * 1024 * 1024,
      vgaMemorySize: 8 * 1024 * 1024,
      setup: {
        cdrom: { url: '../linux/1/linux.iso', async: true },
      },
    },
    {
      id: 'buildroot-kernel',
      label: 'Buildroot Linux (빠른 커널 부팅)',
      detail: 'v86 공식 샘플 커널+initrd. 사이트 내 ISO 문제 확인용 백업 프리셋입니다.',
      memorySize: 128 * 1024 * 1024,
      vgaMemorySize: 8 * 1024 * 1024,
      setup: {
        bzimage: { url: 'https://copy.sh/v86/images/buildroot-bzimage.bin', async: true },
        initrd: { url: 'https://copy.sh/v86/images/buildroot-rootfs.ext2', async: true },
        cmdline: 'rw root=/dev/ram0 console=ttyS0 console=tty0',
      },
    },
    {
      id: 'dsl-linux-iso',
      label: 'Damn Small Linux ISO (검증된 실제 ISO)',
      detail: 'v86에서 부팅되는 실제 Linux ISO입니다. 로컬 ISO가 실패할 때 기본 실행용으로 사용합니다.',
      memorySize: 192 * 1024 * 1024,
      vgaMemorySize: 8 * 1024 * 1024,
      setup: {
        cdrom: { url: 'https://copy.sh/v86/images/linux4.iso', async: true },
      },
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
  let loadedCdn = null;
  let autoBooted = false;

  const appendLog = (message) => {
    const time = new Date().toISOString().slice(11, 19);
    logEl.textContent += `\n[${time}] ${message}`;
    logEl.scrollTop = logEl.scrollHeight;
  };

  const selectedPreset = () => OS_PRESETS.find((item) => item.id === selectEl.value);

  const updatePresetDetail = () => {
    const preset = selectedPreset();
    if (!preset || !hintEl) return;
    hintEl.textContent = preset.detail;
  };

  const ensureScript = async (src) => {
    if (window.V86Starter || window.V86) return;
    if (document.querySelector(`script[data-v86-src="${src}"]`)) return;

    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.dataset.v86Src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`v86 런타임 로드 실패: ${src}`));
      document.head.appendChild(script);
    });
  };

  const ensureV86Runtime = async () => {
    if ((window.V86Starter || window.V86) && loadedCdn) return loadedCdn;

    let lastError = null;
    for (const cdn of CDN_LIST) {
      try {
        appendLog(`${cdn.name} 런타임 로딩...`);
        await ensureScript(cdn.lib);
        const V86Ctor = window.V86Starter || window.V86;
        if (!V86Ctor) throw new Error('V86 생성자를 찾지 못함');
        loadedCdn = cdn;
        appendLog(`${cdn.name} 런타임 준비 완료.`);
        return cdn;
      } catch (error) {
        lastError = error;
        appendLog(`${cdn.name} 실패: ${error.message}`);
      }
    }

    throw lastError || new Error('v86 런타임을 로드하지 못했습니다.');
  };

  const headCheck = async (url) => {
    try {
      const response = await fetch(url, { method: 'HEAD', cache: 'no-store' });
      return response.ok ? 'ok' : `http-${response.status}`;
    } catch (_) {
      return 'unknown';
    }
  };

  const preflightPreset = async (preset) => {
    const targets = [];
    if (preset.setup.cdrom?.url) targets.push(['cdrom', preset.setup.cdrom.url]);
    if (preset.setup.bzimage?.url) targets.push(['bzimage', preset.setup.bzimage.url]);
    if (preset.setup.initrd?.url) targets.push(['initrd', preset.setup.initrd.url]);

    for (const [kind, url] of targets) {
      appendLog(`${kind} 확인: ${url}`);
      const status = await headCheck(url);
      if (status !== 'ok' && status !== 'unknown') {
        throw new Error(`${kind} 이미지 접근 실패: ${url} (${status})`);
      }
    }
  };

  const stopMachine = () => {
    if (!emulator) {
      appendLog('중지할 VM 없음.');
      return;
    }

    try {
      emulator.stop();
    } catch (error) {
      appendLog(`stop 오류: ${error.message}`);
    }

    emulator = null;
    screenEl.innerHTML = '';
    appendLog('VM 종료 완료.');
  };

  const bootMachine = async () => {
    const preset = selectedPreset();
    if (!preset) {
      appendLog('선택된 OS 프리셋을 찾지 못했습니다.');
      return;
    }

    bootBtn.disabled = true;
    appendLog(`${preset.label} 부팅 준비...`);

    try {
      if (emulator) stopMachine();
      screenEl.innerHTML = '';

      await preflightPreset(preset);
      const cdn = await ensureV86Runtime();
      const V86Ctor = window.V86Starter || window.V86;

      const config = {
        wasm_path: cdn.wasm,
        bios: { url: cdn.bios },
        vga_bios: { url: cdn.vga },
        autostart: true,
        screen_container: screenEl,
        memory_size: preset.memorySize,
        vga_memory_size: preset.vgaMemorySize,
        ...preset.setup,
      };

      emulator = new V86Ctor(config);
      window.goricsEmulator = emulator;

      emulator.add_listener('emulator-ready', () => appendLog(`${preset.label} emulator-ready`));
      emulator.add_listener('emulator-started', () => appendLog(`${preset.label} emulator-started`));
      emulator.add_listener('emulator-stopped', () => appendLog(`${preset.label} emulator-stopped`));
      emulator.add_listener('download-error', (event) => appendLog(`download-error: ${event && event.url ? event.url : 'unknown'}`));
      emulator.add_listener('download-progress', (event) => {
        if (!event || !event.total) return;
        const progress = ((event.loaded / event.total) * 100).toFixed(1);
        appendLog(`${preset.id} download ${progress}%`);
      });

      appendLog(`${preset.label} 부팅 시작.`);
    } catch (error) {
      appendLog(`부팅 실패: ${error.message}`);
    } finally {
      bootBtn.disabled = false;
    }
  };

  OS_PRESETS.forEach((preset) => {
    const option = document.createElement('option');
    option.value = preset.id;
    option.textContent = preset.label;
    selectEl.appendChild(option);
  });

  selectEl.value = 'dsl-linux-iso';
  updatePresetDetail();

  selectEl.addEventListener('change', updatePresetDetail);
  bootBtn.addEventListener('click', bootMachine);
  stopBtn.addEventListener('click', stopMachine);
  fullscreenBtn.addEventListener('click', async () => {
    if (!document.fullscreenElement && screenEl.requestFullscreen) {
      await screenEl.requestFullscreen();
      return;
    }

    if (document.fullscreenElement && document.exitFullscreen) {
      await document.exitFullscreen();
    }
  });

  window.setTimeout(() => {
    if (autoBooted || emulator) return;
    autoBooted = true;
    appendLog('자동 부팅 실행.');
    bootMachine();
  }, 800);
})();
