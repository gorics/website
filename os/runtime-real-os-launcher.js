(function () {
  'use strict';

  if (window.__REAL_OS_LAUNCHER__) return;
  window.__REAL_OS_LAUNCHER__ = true;

  const isWindowsPath = /\/os\/window\//.test(location.pathname);
  const osLabel = isWindowsPath ? 'Windows' : 'Linux';

  const style = document.createElement('style');
  style.textContent = `
  .real-os-fab{position:fixed;right:16px;bottom:16px;z-index:2147483000;background:linear-gradient(135deg,#2563eb,#06b6d4);color:#fff;border:0;border-radius:999px;padding:10px 14px;font:600 12px/1 system-ui,sans-serif;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.35)}
  .real-os-modal{position:fixed;inset:0;z-index:2147483001;background:rgba(0,0,0,.64);display:none;align-items:center;justify-content:center;padding:16px}
  .real-os-modal.show{display:flex}
  .real-os-card{width:min(680px,96vw);max-height:92vh;overflow:auto;background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:14px;padding:16px;font:14px/1.5 system-ui,sans-serif}
  .real-os-card h2{margin:0 0 6px;font-size:18px}
  .real-os-card p{margin:0 0 10px;color:#cbd5e1}
  .real-os-grid{display:grid;gap:8px;grid-template-columns:1fr 1fr}
  .real-os-btn{background:#1d4ed8;border:0;color:#fff;padding:10px 12px;border-radius:10px;cursor:pointer;font-weight:700}
  .real-os-btn.secondary{background:#334155}
  .real-os-btn.warn{background:#7c2d12}
  .real-os-card input{width:100%;padding:10px 12px;border:1px solid #334155;background:#020617;color:#e2e8f0;border-radius:8px}
  .real-os-log{margin-top:10px;background:#020617;border:1px solid #334155;border-radius:8px;padding:8px;min-height:80px;max-height:200px;overflow:auto;font:12px/1.45 ui-monospace,monospace;white-space:pre-wrap}
  .real-os-stage{position:fixed;inset:0;z-index:2147483002;background:#000;display:none;flex-direction:column}
  .real-os-stage.show{display:flex}
  .real-os-toolbar{display:flex;gap:8px;align-items:center;padding:8px;background:#020617;color:#e2e8f0;border-bottom:1px solid #1e293b}
  .real-os-screen{flex:1;min-height:0;overflow:hidden}
  .real-os-screen>div,.real-os-screen canvas{width:100%!important;height:100%!important;display:block!important}
  @media (max-width:640px){.real-os-grid{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);

  const fab = document.createElement('button');
  fab.className = 'real-os-fab';
  fab.textContent = `🚀 REAL ${osLabel.toUpperCase()}`;

  const modal = document.createElement('div');
  modal.className = 'real-os-modal';
  modal.innerHTML = `
    <div class="real-os-card">
      <h2>실제 ${osLabel} 실행 모드</h2>
      <p>이 버튼은 기존 데모 UI를 지우지 않고, 실제 VM 부팅 모드를 추가합니다.</p>
      <div class="real-os-grid">
        <button class="real-os-btn" id="real-local-boot">로컬 이미지로 부팅(v86)</button>
        <button class="real-os-btn secondary" id="real-remote-open">원격 noVNC 열기</button>
      </div>
      <p style="margin-top:10px">원격 noVNC URL (예: https://호스트/vnc.html?autoconnect=1&resize=remote&path=websockify)</p>
      <input id="real-remote-url" placeholder="https://.../vnc.html?autoconnect=1&resize=remote" />
      <div class="real-os-grid" style="margin-top:8px">
        <button class="real-os-btn secondary" id="real-close">닫기</button>
        <button class="real-os-btn warn" id="real-stop">실행 중 VM 종료</button>
      </div>
      <div class="real-os-log" id="real-log">[ready] REAL OS launcher initialized.</div>
    </div>`;

  const stage = document.createElement('div');
  stage.className = 'real-os-stage';
  stage.innerHTML = `
    <div class="real-os-toolbar">
      <strong>REAL ${osLabel.toUpperCase()} MODE</strong>
      <button class="real-os-btn secondary" id="real-focus" style="padding:6px 10px">포커스</button>
      <button class="real-os-btn secondary" id="real-full" style="padding:6px 10px">전체화면</button>
      <button class="real-os-btn warn" id="real-exit" style="padding:6px 10px">종료</button>
    </div>
    <div class="real-os-screen" id="real-screen"></div>`;

  document.body.appendChild(fab);
  document.body.appendChild(modal);
  document.body.appendChild(stage);

  const logEl = modal.querySelector('#real-log');
  const screenEl = stage.querySelector('#real-screen');
  let emulator = null;

  function log(msg) {
    const t = new Date().toISOString().slice(11, 19);
    logEl.textContent += `\n[${t}] ${msg}`;
    logEl.scrollTop = logEl.scrollHeight;
  }

  function showModal() { modal.classList.add('show'); }
  function hideModal() { modal.classList.remove('show'); }
  fab.addEventListener('click', showModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) hideModal(); });
  modal.querySelector('#real-close').addEventListener('click', hideModal);

  function stopVm() {
    if (emulator && typeof emulator.stop === 'function') {
      try { emulator.stop(); } catch (_) {}
    }
    emulator = null;
    screenEl.innerHTML = '';
    stage.classList.remove('show');
    log('VM stopped.');
  }

  modal.querySelector('#real-stop').addEventListener('click', stopVm);
  stage.querySelector('#real-exit').addEventListener('click', stopVm);
  stage.querySelector('#real-focus').addEventListener('click', () => {
    screenEl.tabIndex = 0;
    screenEl.focus();
  });
  stage.querySelector('#real-full').addEventListener('click', async () => {
    if (stage.requestFullscreen) {
      try { await stage.requestFullscreen(); } catch (e) { log('fullscreen failed: ' + e.message); }
    }
  });

  async function ensureScript(src) {
    if (document.querySelector(`script[data-real-os="${src}"]`)) return;
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.dataset.realOs = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  async function headOk(url) {
    try {
      const r = await fetch(url, { method: 'HEAD', cache: 'no-store' });
      return r.ok;
    } catch (_) {
      return false;
    }
  }

  async function findAsset() {
    const candidates = isWindowsPath
      ? ['./assets/boot.img', './assets/windows.img', './assets/windows98.img', './assets/boot.iso', '../2/assets/boot.img']
      : ['./linux.iso', './linux.img', './assets/linux.iso', '../1/linux.iso', '../1/linux.img'];
    for (const c of candidates) {
      if (await headOk(c)) return c;
    }
    return null;
  }

  async function bootLocal() {
    hideModal();
    stage.classList.add('show');
    screenEl.innerHTML = '';

    const lib = 'https://cdn.jsdelivr.net/npm/v86@0.5.44/build/libv86.js';
    const wasm = 'https://cdn.jsdelivr.net/npm/v86@0.5.44/build/v86.wasm';
    const bios = 'https://cdn.jsdelivr.net/npm/v86@0.5.44/bios/seabios.bin';
    const vga = 'https://cdn.jsdelivr.net/npm/v86@0.5.44/bios/vgabios.bin';

    try {
      log('loading v86 runtime...');
      await ensureScript(lib);
      const V86Ctor = window.V86Starter || window.V86;
      if (!V86Ctor) throw new Error('V86 constructor unavailable');

      const asset = await findAsset();
      if (!asset) {
        log('boot image not found.');
        alert(`부팅 이미지가 없습니다.\n${isWindowsPath ? 'assets/boot.img' : 'linux.iso'} 파일을 현재 폴더(또는 안내된 경로)에 넣어주세요.`);
        stage.classList.remove('show');
        return;
      }

      const cfg = {
        wasm_path: wasm,
        bios: { url: bios },
        vga_bios: { url: vga },
        screen_container: screenEl,
        memory_size: isWindowsPath ? 256 * 1024 * 1024 : 128 * 1024 * 1024,
        vga_memory_size: 8 * 1024 * 1024,
        autostart: true
      };

      if (asset.endsWith('.iso')) cfg.cdrom = { url: asset, async: true };
      else cfg.hda = { url: asset, async: true };

      log(`booting from ${asset}`);
      emulator = new V86Ctor(cfg);
      emulator.add_listener('emulator-ready', () => log('emulator-ready'));
      emulator.add_listener('emulator-stopped', () => log('emulator-stopped'));
      emulator.add_listener('download-progress', (ev) => {
        if (!ev || !ev.total) return;
        const p = ((ev.loaded / ev.total) * 100).toFixed(1);
        log(`download ${p}%`);
      });
    } catch (e) {
      log('boot failed: ' + (e && e.message ? e.message : e));
      alert('REAL OS 실행 실패: ' + (e && e.message ? e.message : e));
      stage.classList.remove('show');
    }
  }

  modal.querySelector('#real-local-boot').addEventListener('click', bootLocal);

  modal.querySelector('#real-remote-open').addEventListener('click', () => {
    const val = modal.querySelector('#real-remote-url').value.trim();
    if (!val) {
      alert('원격 noVNC URL을 입력하세요.');
      return;
    }
    const ok = /^https?:\/\//i.test(val);
    if (!ok) {
      alert('http(s):// 로 시작하는 URL만 허용됩니다.');
      return;
    }
    log('opening remote noVNC: ' + val);
    window.open(val, '_blank', 'noopener,noreferrer');
  });

  log(`mode detected: ${osLabel}`);
})();
