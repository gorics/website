(function () {
  'use strict';

  if (window.__REAL_OS_LAUNCHER__) return;
  window.__REAL_OS_LAUNCHER__ = true;

  const isWindowsPath = /\/os\/window\//.test(location.pathname);
  const osLabel = isWindowsPath ? 'Windows' : 'Linux';

  const RUNTIME = {
    lib: 'https://copy.sh/v86/build/libv86.js',
    wasm: 'https://copy.sh/v86/build/v86.wasm',
    bios: 'https://copy.sh/v86/bios/seabios.bin',
    vga: 'https://copy.sh/v86/bios/vgabios.bin',
  };

  const PRESETS = [
    {
      id: 'buildroot',
      label: 'Buildroot Linux — 빠른 실제 Linux',
      kind: 'Linux',
      memory: 128 * 1024 * 1024,
      vga: 8 * 1024 * 1024,
      setup: {
        bzimage: { url: 'https://i.copy.sh/buildroot-bzimage68.bin', async: true },
        cmdline: 'rw root=/dev/ram0 console=ttyS0 console=tty0',
      },
    },
    {
      id: 'linux-iso',
      label: 'Tiny Linux ISO — 실제 CD-ROM 부팅',
      kind: 'Linux',
      memory: 128 * 1024 * 1024,
      vga: 8 * 1024 * 1024,
      setup: {
        cdrom: { url: 'https://i.copy.sh/linux.iso', async: true },
      },
    },
    {
      id: 'dsl-linux',
      label: 'Damn Small Linux ISO — 실제 Linux ISO',
      kind: 'Linux',
      memory: 192 * 1024 * 1024,
      vga: 8 * 1024 * 1024,
      setup: {
        cdrom: { url: 'https://i.copy.sh/linux4.iso', async: true },
      },
    },
    {
      id: 'freedos',
      label: 'FreeDOS 7.22 — 실제 HDD 이미지',
      kind: 'DOS',
      memory: 64 * 1024 * 1024,
      vga: 4 * 1024 * 1024,
      setup: {
        hda: { url: 'https://i.copy.sh/freedos722.img', async: true },
      },
    },
    {
      id: 'windows101',
      label: 'Windows 1.01 — 실제 Windows 이미지',
      kind: 'Windows',
      memory: 64 * 1024 * 1024,
      vga: 4 * 1024 * 1024,
      setup: {
        hda: { url: 'https://i.copy.sh/windows101.img', async: true },
      },
    },
  ];

  const style = document.createElement('style');
  style.textContent = `
  .real-os-fab{position:fixed;right:16px;bottom:16px;z-index:2147483000;background:linear-gradient(135deg,#2563eb,#06b6d4);color:#fff;border:0;border-radius:999px;padding:10px 14px;font:700 12px/1 system-ui,sans-serif;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.35)}
  .real-os-modal{position:fixed;inset:0;z-index:2147483001;background:rgba(0,0,0,.64);display:none;align-items:center;justify-content:center;padding:16px}
  .real-os-modal.show{display:flex}
  .real-os-card{width:min(720px,96vw);max-height:92vh;overflow:auto;background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:14px;padding:16px;font:14px/1.5 system-ui,sans-serif;box-shadow:0 16px 60px rgba(0,0,0,.45)}
  .real-os-card h2{margin:0 0 6px;font-size:18px}
  .real-os-card p{margin:0 0 10px;color:#cbd5e1}
  .real-os-grid{display:grid;gap:8px;grid-template-columns:1fr 1fr}
  .real-os-btn{background:#1d4ed8;border:0;color:#fff;padding:10px 12px;border-radius:10px;cursor:pointer;font-weight:700}
  .real-os-btn.secondary{background:#334155}
  .real-os-btn.warn{background:#7c2d12}
  .real-os-card input,.real-os-card select{width:100%;padding:10px 12px;border:1px solid #334155;background:#020617;color:#e2e8f0;border-radius:8px}
  .real-os-log{margin-top:10px;background:#020617;border:1px solid #334155;border-radius:8px;padding:8px;min-height:90px;max-height:220px;overflow:auto;font:12px/1.45 ui-monospace,monospace;white-space:pre-wrap}
  .real-os-stage{position:fixed;inset:0;z-index:2147483002;background:#000;display:none;flex-direction:column}
  .real-os-stage.show{display:flex}
  .real-os-toolbar{display:flex;gap:8px;align-items:center;padding:8px;background:#020617;color:#e2e8f0;border-bottom:1px solid #1e293b;flex-wrap:wrap}
  .real-os-toolbar strong{margin-right:auto}
  .real-os-screen{flex:1;min-height:0;overflow:hidden;background:#000}
  .real-os-screen>div,.real-os-screen canvas{width:100%!important;height:100%!important;display:block!important}
  @media (max-width:640px){.real-os-grid{grid-template-columns:1fr}.real-os-toolbar strong{width:100%;margin:0 0 4px}}
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
      <p>로컬 ISO/IMG가 없어도 공식 v86 테스트 이미지로 실제 OS를 부팅합니다. HTML 데모 UI와 별개로 전체화면 VM이 실행됩니다.</p>
      <p>부팅 프리셋</p>
      <select id="real-preset"></select>
      <div class="real-os-grid" style="margin-top:8px">
        <button class="real-os-btn" id="real-local-boot">선택한 실제 OS 부팅(v86)</button>
        <button class="real-os-btn secondary" id="real-v86-open">공식 v86 데모 열기</button>
      </div>
      <p style="margin-top:10px">원격 noVNC URL (예: https://호스트/vnc.html?autoconnect=1&resize=remote&path=websockify)</p>
      <input id="real-remote-url" placeholder="https://.../vnc.html?autoconnect=1&resize=remote" />
      <div class="real-os-grid" style="margin-top:8px">
        <button class="real-os-btn secondary" id="real-remote-open">원격 noVNC 열기</button>
        <button class="real-os-btn warn" id="real-stop">실행 중 VM 종료</button>
      </div>
      <div class="real-os-grid" style="margin-top:8px">
        <button class="real-os-btn secondary" id="real-close">닫기</button>
      </div>
      <div class="real-os-log" id="real-log">[ready] REAL OS launcher initialized.</div>
    </div>`;

  const stage = document.createElement('div');
  stage.className = 'real-os-stage';
  stage.innerHTML = `
    <div class="real-os-toolbar">
      <strong id="real-title">REAL ${osLabel.toUpperCase()} MODE</strong>
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
  const presetEl = modal.querySelector('#real-preset');
  const titleEl = stage.querySelector('#real-title');
  let emulator = null;

  function presetOrder(a, b) {
    if (!isWindowsPath) return a.id === 'buildroot' ? -1 : b.id === 'buildroot' ? 1 : 0;
    if (a.id === 'windows101') return -1;
    if (b.id === 'windows101') return 1;
    return 0;
  }

  [...PRESETS].sort(presetOrder).forEach((preset) => {
    const option = document.createElement('option');
    option.value = preset.id;
    option.textContent = `[${preset.kind}] ${preset.label}`;
    presetEl.appendChild(option);
  });
  presetEl.value = isWindowsPath ? 'windows101' : 'buildroot';

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
    if (emulator) {
      try {
        if (typeof emulator.destroy === 'function') emulator.destroy();
        else if (typeof emulator.stop === 'function') emulator.stop();
      } catch (_) {}
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
    if (window.V86Starter || window.V86) return;
    if (document.querySelector(`script[data-real-os="${src}"][data-loaded="true"]`)) return;
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.dataset.realOs = src;
      s.onload = () => { s.dataset.loaded = 'true'; resolve(); };
      s.onerror = () => reject(new Error('script load failed: ' + src));
      document.head.appendChild(s);
    });
  }

  function selectedPreset() {
    return PRESETS.find((preset) => preset.id === presetEl.value) || PRESETS[0];
  }

  function cloneSetup(setup) {
    return JSON.parse(JSON.stringify(setup));
  }

  async function bootPreset() {
    const preset = selectedPreset();
    hideModal();
    stage.classList.add('show');
    titleEl.textContent = `REAL ${preset.kind.toUpperCase()} MODE — ${preset.label}`;
    screenEl.innerHTML = '';

    try {
      log('loading v86 runtime...');
      await ensureScript(RUNTIME.lib);
      const V86Ctor = window.V86Starter || window.V86;
      if (!V86Ctor) throw new Error('V86 constructor unavailable');

      if (emulator) stopVm();
      stage.classList.add('show');

      const cfg = {
        wasm_path: RUNTIME.wasm,
        bios: { url: RUNTIME.bios },
        vga_bios: { url: RUNTIME.vga },
        screen_container: screenEl,
        memory_size: preset.memory,
        vga_memory_size: preset.vga,
        autostart: true,
        ...cloneSetup(preset.setup),
      };

      log(`booting ${preset.label}`);
      emulator = new V86Ctor(cfg);
      window.goricsRealOsEmulator = emulator;
      emulator.add_listener('emulator-ready', () => log('emulator-ready'));
      emulator.add_listener('emulator-started', () => log('emulator-started'));
      emulator.add_listener('emulator-stopped', () => log('emulator-stopped'));
      emulator.add_listener('download-error', (ev) => log('download-error: ' + (ev && ev.url ? ev.url : 'unknown')));
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

  modal.querySelector('#real-local-boot').addEventListener('click', bootPreset);
  modal.querySelector('#real-v86-open').addEventListener('click', () => {
    window.open('https://copy.sh/v86/', '_blank', 'noopener,noreferrer');
  });

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
