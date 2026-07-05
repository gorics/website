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
    {
      id: 'dsl-linux-iso',
      label: 'Damn Small Linux GUI ISO (기본 / 실제 GUI)',
      detail: 'v86에서 검증된 linux4.iso를 CD-ROM으로 부팅합니다. GUI 데스크톱 확인용 기본 프리셋입니다. 첫 화면까지 시간이 걸릴 수 있습니다.',
      memorySize: 192 * 1024 * 1024,
      vgaMemorySize: 16 * 1024 * 1024,
      setup: {
        cdrom: { url: 'https://i.copy.sh/linux4.iso', async: true },
      },
    },
    {
      id: 'buildroot-kernel',
      label: 'Buildroot Linux (빠른 콘솔 Linux)',
      detail: '공식 v86 테스트 이미지 기반 실제 Linux 커널입니다. 빠르지만 GUI 데스크톱이 아니라 콘솔 확인용입니다.',
      memorySize: 128 * 1024 * 1024,
      vgaMemorySize: 8 * 1024 * 1024,
      setup: {
        bzimage: { url: 'https://i.copy.sh/buildroot-bzimage68.bin', async: true },
        cmdline: 'rw root=/dev/ram0 console=ttyS0 console=tty0',
      },
    },
    {
      id: 'browser-linux-iso',
      label: 'Tiny v86 Linux ISO (실제 ISO)',
      detail: 'v86 공식 테스트용 Linux ISO를 CD-ROM으로 부팅합니다. GUI보다 부팅 검증/콘솔 확인에 적합합니다.',
      memorySize: 128 * 1024 * 1024,
      vgaMemorySize: 8 * 1024 * 1024,
      setup: {
        cdrom: { url: 'https://i.copy.sh/linux.iso', async: true },
      },
    },
    {
      id: 'freedos',
      label: 'FreeDOS 7.22 (실제 HDD 이미지)',
      detail: '작고 안정적인 v86 테스트용 FreeDOS HDD 이미지입니다.',
      memorySize: 64 * 1024 * 1024,
      vgaMemorySize: 4 * 1024 * 1024,
      setup: {
        hda: { url: 'https://i.copy.sh/freedos722.img', async: true },
      },
    },
    {
      id: 'windows101',
      label: 'Windows 1.01 (실제 Windows 이미지)',
      detail: 'v86 공식 테스트 이미지 기반 Windows 1.01입니다. 최신 Windows가 아니라 브라우저 VM 검증용입니다.',
      memorySize: 64 * 1024 * 1024,
      vgaMemorySize: 4 * 1024 * 1024,
      setup: {
        hda: { url: 'https://i.copy.sh/windows101.img', async: true },
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
  let runtimeReady = false;
  let autoBooted = false;

  const appendLog = (message, level = 'info') => {
    const time = new Date().toISOString().slice(11, 19);
    const prefix = level === 'error' ? '[error]' : level === 'warn' ? '[warn]' : '[info]';
    logEl.textContent += `\n[${time}] ${prefix} ${message}`;
    logEl.scrollTop = logEl.scrollHeight;
  };

  const selectedPreset = () => OS_PRESETS.find((item) => item.id === selectEl.value) || OS_PRESETS[0];

  const updatePresetDetail = () => {
    const preset = selectedPreset();
    if (hintEl) hintEl.textContent = preset.detail;
  };

  const loadScript = (src) => new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-v86-src="${src}"]`);
    if (existing && existing.dataset.loaded === 'true') {
      resolve();
      return;
    }

    const script = existing || document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.v86Src = src;
    script.onload = () => {
      script.dataset.loaded = 'true';
      resolve();
    };
    script.onerror = () => reject(new Error(`v86 런타임 로드 실패: ${src}`));
    if (!existing) document.head.appendChild(script);
  });

  const ensureV86Runtime = async () => {
    if ((window.V86Starter || window.V86) && runtimeReady) return V86_RUNTIME;
    appendLog(`${V86_RUNTIME.name} 로딩...`);
    await loadScript(V86_RUNTIME.lib);
    const V86Ctor = window.V86Starter || window.V86;
    if (!V86Ctor) throw new Error('V86 생성자를 찾지 못했습니다.');
    runtimeReady = true;
    appendLog('v86 런타임 준비 완료.');
    return V86_RUNTIME;
  };

  const stopMachine = () => {
    if (!emulator) {
      appendLog('중지할 VM 없음.', 'warn');
      return;
    }

    try {
      if (typeof emulator.destroy === 'function') emulator.destroy();
      else if (typeof emulator.stop === 'function') emulator.stop();
    } catch (error) {
      appendLog(`stop 오류: ${error.message}`, 'error');
    }

    emulator = null;
    screenEl.innerHTML = '';
    appendLog('VM 종료 완료.');
  };

  const bindLogs = (preset) => {
    emulator.add_listener('emulator-ready', () => appendLog(`${preset.label} emulator-ready`));
    emulator.add_listener('emulator-started', () => appendLog(`${preset.label} emulator-started`));
    emulator.add_listener('emulator-stopped', () => appendLog(`${preset.label} emulator-stopped`));
    emulator.add_listener('download-error', (event) => appendLog(`download-error: ${event && event.url ? event.url : 'unknown'}`, 'error'));
    emulator.add_listener('download-progress', (event) => {
      if (!event || !event.total) return;
      const progress = ((event.loaded / event.total) * 100).toFixed(1);
      appendLog(`${preset.id} download ${progress}%`);
    });
  };

  const cloneSetup = (setup) => JSON.parse(JSON.stringify(setup));

  const bootMachine = async () => {
    const preset = selectedPreset();
    bootBtn.disabled = true;
    appendLog(`${preset.label} 부팅 준비...`);

    try {
      if (emulator) stopMachine();
      screenEl.innerHTML = '';

      const runtime = await ensureV86Runtime();
      const V86Ctor = window.V86Starter || window.V86;

      const config = {
        wasm_path: runtime.wasm,
        bios: { url: runtime.bios },
        vga_bios: { url: runtime.vga },
        autostart: true,
        screen_container: screenEl,
        memory_size: preset.memorySize,
        vga_memory_size: preset.vgaMemorySize,
        ...cloneSetup(preset.setup),
      };

      appendLog('VM 생성 중...');
      emulator = new V86Ctor(config);
      window.goricsEmulator = emulator;
      bindLogs(preset);
      appendLog(`${preset.label} 부팅 시작. GUI 프리셋은 첫 화면까지 시간이 걸릴 수 있습니다.`);
    } catch (error) {
      appendLog(`부팅 실패: ${error && error.message ? error.message : String(error)}`, 'error');
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
    try {
      if (!document.fullscreenElement && screenEl.requestFullscreen) {
        await screenEl.requestFullscreen();
        return;
      }
      if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen();
    } catch (error) {
      appendLog(`전체화면 실패: ${error.message}`, 'error');
    }
  });

  window.setTimeout(() => {
    if (autoBooted || emulator) return;
    autoBooted = true;
    appendLog('GUI 기본 프리셋 자동 부팅 실행.');
    bootMachine();
  }, 600);
})();
