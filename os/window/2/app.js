(() => {
  'use strict';

  const statusEl = document.getElementById('status');
  const logEl = document.getElementById('log');
  const screenEl = document.getElementById('screen_container');
  const retryBtn = document.getElementById('retryBtn');
  const focusBtn = document.getElementById('focusBtn');
  const fullBtn = document.getElementById('fullBtn');

  const RUNTIME = {
    lib: 'https://copy.sh/v86/build/libv86.js',
    wasm: 'https://copy.sh/v86/build/v86.wasm',
    bios: 'https://copy.sh/v86/bios/seabios.bin',
    vga: 'https://copy.sh/v86/bios/vgabios.bin',
  };

  const LOCAL_CANDIDATES = [
    { url: './assets/boot.img', label: 'local assets/boot.img', type: 'hda' },
    { url: './assets/windows.img', label: 'local assets/windows.img', type: 'hda' },
    { url: './assets/windows98.img', label: 'local assets/windows98.img', type: 'hda' },
    { url: './assets/boot.iso', label: 'local assets/boot.iso', type: 'cdrom' },
  ];

  const REMOTE_FALLBACK = {
    url: 'https://i.copy.sh/windows101.img',
    label: 'remote v86 Windows 1.01 image',
    type: 'hda',
  };

  let emulator = null;
  let started = false;

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

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (window.V86 || window.V86Starter) {
        resolve();
        return;
      }
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
      script.onerror = () => reject(new Error('v86 런타임 로드 실패'));
      if (!existing) document.head.appendChild(script);
    });
  }

  async function ensureV86() {
    await loadScript(RUNTIME.lib);
    const V86Ctor = window.V86 || window.V86Starter;
    if (typeof V86Ctor !== 'function') throw new Error('V86 생성자를 찾지 못했습니다.');
    return V86Ctor;
  }

  async function findBootAsset() {
    for (const item of LOCAL_CANDIDATES) {
      if (await exists(item.url)) return item;
    }
    log('로컬 Windows 이미지가 없어 공식 v86 원격 테스트 이미지로 대체합니다.');
    return REMOTE_FALLBACK;
  }

  function makeConfig(asset) {
    const cfg = {
      wasm_path: RUNTIME.wasm,
      memory_size: 96 * 1024 * 1024,
      vga_memory_size: 8 * 1024 * 1024,
      screen_container: screenEl,
      bios: { url: RUNTIME.bios },
      vga_bios: { url: RUNTIME.vga },
      autostart: true,
    };

    if (asset.type === 'cdrom' || asset.url.endsWith('.iso')) cfg.cdrom = { url: asset.url, async: true };
    else cfg.hda = { url: asset.url, async: true };

    return cfg;
  }

  function attachListeners(instance, asset) {
    instance.add_listener('emulator-ready', () => {
      setStatus('부팅 시작됨');
      log(`${asset.label} 에뮬레이터 준비 완료. 게스트 OS가 계속 부팅 중일 수 있습니다.`);
    });

    instance.add_listener('emulator-started', () => {
      setStatus('부팅 중');
      log('VM 실행 시작.');
    });

    instance.add_listener('download-progress', (event) => {
      if (!event || !event.total || event.total <= 0) return;
      const p = ((event.loaded / event.total) * 100).toFixed(1);
      setStatus(`다운로드 중 ${p}%`);
    });

    instance.add_listener('download-error', (event) => {
      setStatus('다운로드 실패');
      log(`다운로드 실패: ${event && event.url ? event.url : asset.url}`);
    });

    instance.add_listener('emulator-stopped', () => {
      setStatus('가상 머신 정지');
      log('가상 머신이 정지됐습니다. 다시 시도 버튼으로 재시작 가능.');
    });
  }

  async function boot() {
    if (started) return;
    started = true;

    if (window.location.protocol === 'file:') {
      setStatus('CORS 오류');
      log('file:// 프로토콜에서는 실행 불가. GitHub Pages 또는 로컬 HTTP 서버 사용 필요.');
      started = false;
      return;
    }

    try {
      setStatus('v86 런타임 로딩');
      const V86Ctor = await ensureV86();

      setStatus('부팅 파일 찾는 중');
      log('자동 부팅을 시작합니다.');

      const asset = await findBootAsset();
      log('부팅 파일 선택: ' + asset.label + ' → ' + asset.url);

      const config = makeConfig(asset);
      setStatus('가상 머신 생성 중');
      emulator = new V86Ctor(config);
      window.goricsWindowsEmulator = emulator;
      attachListeners(emulator, asset);
      setStatus('부팅 중');
      log('부팅 명령을 보냈습니다. 첫 화면까지 시간이 걸릴 수 있습니다.');
    } catch (error) {
      setStatus('실행 실패');
      log('오류: ' + (error && error.message ? error.message : String(error)));
      started = false;
    }
  }

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

  log('페이지 로드 완료. 로컬 이미지가 없으면 원격 Windows 테스트 이미지로 부팅합니다.');
  boot();
})();
