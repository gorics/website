(() => {
  'use strict';

  const statusEl = document.getElementById('status');
  const logEl    = document.getElementById('log');
  const screenEl = document.getElementById('screen_container');
  const retryBtn = document.getElementById('retryBtn');
  const focusBtn = document.getElementById('focusBtn');
  const fullBtn  = document.getElementById('fullBtn');

  // v86 CDN: libv86.js는 index.html에서 이미 로드
  const WASM_URL = 'https://cdn.jsdelivr.net/npm/v86@0.5.319/build/v86.wasm';
  const BIOS_URL = 'https://cdn.jsdelivr.net/gh/copy/v86@master/bios/seabios.bin';
  const VGA_URL  = 'https://cdn.jsdelivr.net/gh/copy/v86@master/bios/vgabios.bin';

  const CANDIDATES = [
    './assets/boot.img',
    './assets/windows.img',
    './assets/windows98.img',
    './assets/boot.iso',
  ];

  let emulator = null;
  let started   = false;

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
  }

  function log(msg) {
    if (!logEl) return;
    const time = new Date().toLocaleTimeString('ko-KR', { hour12: false });
    logEl.textContent += `[${time}] ${msg}\n`;
    logEl.scrollTop = logEl.scrollHeight;
  }

  async function exists(url) {
    try {
      const r = await fetch(url, { method: 'HEAD', cache: 'no-store' });
      return r.ok;
    } catch (_) {
      return false;
    }
  }

  async function findBootAsset() {
    for (const f of CANDIDATES) {
      if (await exists(f)) return f;
    }
    return null;
  }

  function makeConfig(file) {
    const cfg = {
      wasm_path:       WASM_URL,
      memory_size:     256 * 1024 * 1024,
      vga_memory_size: 8   * 1024 * 1024,
      screen_container: screenEl,
      bios:    { url: BIOS_URL },
      vga_bios:{ url: VGA_URL  },
      autostart: true,
    };
    if (file.endsWith('.iso')) {
      cfg.cdrom = { url: file, async: true };
    } else {
      cfg.hda = { url: file, async: true };
    }
    return cfg;
  }

  function attachListeners(instance) {
    instance.add_listener('emulator-ready', () => {
      setStatus('부팅 시작됨');
      log('에뮬레이터 준비 완료. 게스트 OS가 계속 부팅 중일 수 있습니다.');
    });

    instance.add_listener('download-progress', (event) => {
      if (!event || !event.total || event.total <= 0) return;
      const p = ((event.loaded / event.total) * 100).toFixed(1);
      setStatus(`다운로드 중 ${p}%`);
    });

    instance.add_listener('emulator-stopped', () => {
      setStatus('가상 머신 정지');
      log('가상 머신이 정지됐습니다. 다시 시도 버튼으로 재시작 가능.');
    });
  }

  async function boot() {
    if (started) return;
    started = true;

    // file:// 프로토콜 체크
    if (window.location.protocol === 'file:') {
      setStatus('CORS 오류');
      log('file:// 프로토콜에서는 실행 불가. GitHub Pages 또는 로컬 HTTP 서버 사용 필요.');
      started = false;
      return;
    }

    // V86 생성자 확인
    const V86Ctor = window.V86 || window.V86Starter;
    if (typeof V86Ctor !== 'function') {
      setStatus('라이브러리 로드 실패');
      log('V86 라이브러리를 불러오지 못했습니다. 네트워크 상태를 확인하세요.');
      started = false;
      return;
    }

    setStatus('부팅 파일 찾는 중');
    log('자동 부팅을 시작합니다.');

    const file = await findBootAsset();
    if (!file) {
      setStatus('boot.img 없음');
      log('부팅 파일을 찾지 못했습니다. assets/boot.img 파일을 넣어주세요.');
      started = false;
      return;
    }

    log('부팅 파일 발견: ' + file);
    const config = makeConfig(file);

    if (file.endsWith('.iso')) {
      log('ISO를 찾았습니다. 설치 미디어일 수 있습니다.');
    } else {
      log('HDD 이미지를 찾았습니다. OS 부팅을 시도합니다.');
    }

    try {
      setStatus('가상 머신 생성 중');
      emulator = new V86Ctor(config);
      attachListeners(emulator);
      setStatus('부팅 중');
      log('부팅 명령을 보냈습니다. 첫 화면까지 시간이 걸릴 수 있습니다.');
    } catch (error) {
      setStatus('실행 실패');
      log('오류: ' + (error && error.message ? error.message : String(error)));
      started = false;
    }
  }

  // 버튼 이벤트
  if (retryBtn) retryBtn.addEventListener('click', () => window.location.reload());
  if (focusBtn) focusBtn.addEventListener('click', () => {
    screenEl.tabIndex = 0;
    screenEl.focus();
    log('화면에 포커스를 줬습니다. 키보드 입력이 VM으로 전달됩니다.');
  });
  if (fullBtn) fullBtn.addEventListener('click', async () => {
    try {
      if (screenEl.requestFullscreen) await screenEl.requestFullscreen();
    } catch (err) {
      log('전체화면 실패: ' + (err && err.message ? err.message : String(err)));
    }
  });

  log('페이지 로드 완료. 자동으로 boot.img를 찾습니다.');
  boot();
})();
