(() => {
  'use strict';

  const LIBV86_URL = 'https://cdn.jsdelivr.net/npm/v86@0.5.44/build/libv86.js';
  const WASM_PATH = 'https://cdn.jsdelivr.net/npm/v86@0.5.44/build/v86.wasm';
  const BIOS_PATH = 'https://cdn.jsdelivr.net/npm/v86@0.5.44/bios/seabios.bin';
  const VGA_BIOS_PATH = 'https://cdn.jsdelivr.net/npm/v86@0.5.44/bios/vgabios.bin';

  const OS_PRESETS = [
    {
      id: 'linux-buildroot',
      label: 'Linux (Buildroot, 매우 빠른 부팅)',
      memorySize: 128 * 1024 * 1024,
      setup: {
        cdrom: { url: 'https://gorics.github.io/website/os/linux/1/linux.iso', async: true },
      },
    },
    {
      id: 'linux-iso',
      label: 'Linux (Damn Small Linux ISO)',
      memorySize: 192 * 1024 * 1024,
      setup: {
        cdrom: { url: 'https://gorics.github.io/website/os/linux/1/linux.iso', async: true },
      },
    },
    {
      id: 'windows98',
      label: 'Windows 98 (실제 디스크 이미지)',
      memorySize: 256 * 1024 * 1024,
      setup: {
        hda: { url: 'https://copy.sh/v86/images/windows98.img', async: true },
      },
    },
    {
      id: 'windows2000',
      label: 'Windows 2000 (실제 디스크 이미지)',
      memorySize: 384 * 1024 * 1024,
      setup: {
        hda: { url: 'https://copy.sh/v86/images/windows2000.img', async: true },
      },
    },
  ];

  const logEl = document.getElementById('log');
  const selectEl = document.getElementById('os-select');
  const bootBtn = document.getElementById('boot-btn');
  const stopBtn = document.getElementById('stop-btn');
  const fullscreenBtn = document.getElementById('fullscreen-btn');
  const screenEl = document.getElementById('screen');

  let emulator = null;

  const appendLog = (message) => {
    const time = new Date().toISOString().slice(11, 19);
    logEl.textContent += `\n[${time}] ${message}`;
    logEl.scrollTop = logEl.scrollHeight;
  };

  const ensureV86Script = async () => {
    if (window.V86Starter || window.V86) {
      return;
    }

    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = LIBV86_URL;
      script.async = true;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
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
    const preset = OS_PRESETS.find((item) => item.id === selectEl.value);
    if (!preset) {
      appendLog('선택된 OS 프리셋을 찾지 못했습니다.');
      return;
    }

    bootBtn.disabled = true;
    appendLog(`${preset.label} 부팅 준비...`);

    try {
      if (emulator) {
        stopMachine();
      }

      screenEl.innerHTML = '';
      await ensureV86Script();

      const V86Ctor = window.V86Starter || window.V86;
      if (!V86Ctor) {
        throw new Error('v86 생성자를 찾을 수 없습니다.');
      }

      const config = {
        wasm_path: WASM_PATH,
        bios: { url: BIOS_PATH },
        vga_bios: { url: VGA_BIOS_PATH },
        autostart: true,
        screen_container: screenEl,
        memory_size: preset.memorySize,
        vga_memory_size: 8 * 1024 * 1024,
        ...preset.setup,
      };

      emulator = new V86Ctor(config);

      emulator.add_listener('emulator-ready', () => appendLog(`${preset.label} emulator-ready`));
      emulator.add_listener('emulator-started', () => appendLog(`${preset.label} emulator-started`));
      emulator.add_listener('emulator-stopped', () => appendLog(`${preset.label} emulator-stopped`));
      emulator.add_listener('download-progress', (event) => {
        if (!event || !event.total) {
          return;
        }

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
})();
