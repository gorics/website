(() => {
  const statusEl = document.getElementById('status');
  const logEl = document.getElementById('log');
  const screenEl = document.getElementById('screen_container');
  const retryBtn = document.getElementById('retryBtn');
  const focusBtn = document.getElementById('focusBtn');
  const fullBtn = document.getElementById('fullBtn');

  const V86_BASE = 'https://cdn.jsdelivr.net/npm/v86@0.5.319/build';
  const BIOS_BASE = 'https://cdn.jsdelivr.net/gh/copy/v86@master/bios';

  const CANDIDATES = [
    './assets/boot.img',
    './assets/windows.img',
    './assets/windows98.img',
    './assets/boot.iso'
  ];

  let emulator = null;
  let started = false;

  function setStatus(text) {
    statusEl.textContent = text;
  }

  function log(message) {
    const time = new Date().toLocaleTimeString('ko-KR', { hour12: false });
    logEl.textContent += `[${time}] ${message}\n`;
    logEl.scrollTop = logEl.scrollHeight;
  }

  async function exists(url) {
    try {
      const response = await fetch(url, { method: 'HEAD', cache: 'no-store' });
      return response.ok;
    } catch (_) {
      return false;
    }
  }

  async function findBootAsset() {
    for (const file of CANDIDATES) {
      if (await exists(file)) return file;
    }
    return null;
  }

  function makeConfig(file) {
    const config = {
      wasm_path: `${V86_BASE}/v86.wasm`,
      memory_size: 256 * 1024 * 1024,
      vga_memory_size: 8 * 1024 * 1024,
      screen_container: screenEl,
      bios: { url: `${BIOS_BASE}/seabios.bin` },
      vga_bios: { url: `${BIOS_BASE}/vgabios.bin` },
      autostart: true,
    };

    if (file.endsWith('.iso')) {
      config.cdrom = { url: file, async: true };
    } else {
      config.hda = { url: file, async: true };
    }

    return config;
  }

  function attachListeners(instance) {
    instance.add_listener('emulator-ready', () => {
      setStatus('부팅 시작됨');
      log('에뮬레이터 준비 완료. 게스트 OS가 계속 부팅 중일 수 있다.');
    });

    instance.add_listener('download-progress', (event) => {
      if (!event || typeof event.loaded !== 'number' || typeof event.total !== 'number' || event.total <= 0) {
        return;
      }
      const p = ((event.loaded / event.total) * 100).toFixed(1);
      setStatus(`리소스 내려받는 중 ${p}%`);
    });

    instance.add_listener('emulator-stopped', () => {
      setStatus('가상 머신 정지');
      log('가상 머신이 정지됐다. 다시 시도 버튼으로 재시작 가능.');
    });
  }

  async function boot() {
    if (started) return;
    started = true;
    setStatus('부팅 파일 찾는 중');
    log('자동 부팅을 시작한다.');

    const file = await findBootAsset();
    if (!file) {
      setStatus('boot.img 없음');
      log('찾은 부팅 파일이 없다. assets/boot.img 파일명을 그대로 써야 한다.');
      started = false;
      return;
    }

    log(`부팅 파일 발견: ${file}`);
    const config = makeConfig(file);

    if (file.endsWith('.iso')) {
      log('ISO를 찾았다. 설치 미디어일 수 있다. 자동 설치 완료 상태는 아니다.');
    } else {
      log('HDD 이미지를 찾았다. 바로 OS 부팅을 시도한다.');
    }

    try {
      setStatus('가상 머신 생성 중');
      emulator = new V86(config);
      attachListeners(emulator);
      setStatus('부팅 중');
      log('부팅 명령을 보냈다. 첫 화면까지 시간이 걸릴 수 있다.');
    } catch (error) {
      setStatus('실행 실패');
      log(`오류: ${error.message || String(error)}`);
      started = false;
    }
  }

  retryBtn.addEventListener('click', () => window.location.reload());
  focusBtn.addEventListener('click', () => {
    screenEl.tabIndex = 0;
    screenEl.focus();
    log('화면에 포커스를 줬다. 키보드 입력이 VM으로 들어간다.');
  });
  fullBtn.addEventListener('click', async () => {
    try {
      if (screenEl.requestFullscreen) await screenEl.requestFullscreen();
    } catch (error) {
      log(`전체화면 실패: ${error.message || String(error)}`);
    }
  });

  log('페이지 로드 완료. 자동으로 boot.img를 찾는다.');
  boot();
})();
