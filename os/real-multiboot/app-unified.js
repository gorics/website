(() => {
  'use strict';
  const log = document.getElementById('log');
  const screen = document.getElementById('screen');
  const bootBtn = document.getElementById('boot-btn');
  const stopBtn = document.getElementById('stop-btn');
  const fullBtn = document.getElementById('fullscreen-btn');
  const detail = document.getElementById('preset-detail');
  const mode = document.getElementById('service-mode');
  const target = document.getElementById('boot-target');
  let emu = null;
  const v86 = {
    lib: 'https://copy.sh/v86/build/libv86.js',
    wasm: 'https://copy.sh/v86/build/v86.wasm',
    bios: 'https://copy.sh/v86/bios/seabios.bin',
    vga: 'https://copy.sh/v86/bios/vgabios.bin',
    iso: 'https://i.copy.sh/dsl-4.11.rc2.iso'
  };
  const write = (m) => { log.textContent += `\n[${new Date().toISOString()}] ${m}`; log.scrollTop = log.scrollHeight; };
  const Ctor = () => window.V86Starter || window.V86;
  function load() {
    return new Promise((ok, fail) => {
      if (Ctor()) return ok();
      const s = document.createElement('script');
      s.src = v86.lib;
      s.onload = ok;
      s.onerror = () => fail(new Error('runtime load failed'));
      document.head.appendChild(s);
    });
  }
  function stop() {
    if (emu) {
      try { (emu.destroy || emu.stop).call(emu); } catch (_) {}
    }
    emu = null;
    screen.innerHTML = '';
    screen.classList.remove('has-vm');
    write('stopped');
  }
  async function boot() {
    bootBtn.disabled = true;
    mode.textContent = '단일 통합 OS';
    target.textContent = 'GORICS Web Linux GUI OS';
    detail.textContent = '여러 멀티부트 항목을 숨기고 하나의 통합 OS만 실행합니다.';
    write('boot start: GORICS Web Linux GUI OS');
    try {
      stop();
      await load();
      emu = new (Ctor())({
        wasm_path: v86.wasm,
        bios: { url: v86.bios },
        vga_bios: { url: v86.vga },
        cdrom: { url: v86.iso, size: 52824064, async: true },
        autostart: true,
        screen_container: screen,
        memory_size: 268435456,
        vga_memory_size: 16777216
      });
      window.goricsEmulator = emu;
      screen.classList.add('has-vm');
      write('vm created');
    } catch (e) {
      write('boot failed: ' + e.message);
    } finally {
      bootBtn.disabled = false;
    }
  }
  bootBtn.onclick = boot;
  stopBtn.onclick = stop;
  fullBtn.onclick = () => (screen.closest('.screen-wrap') || screen).requestFullscreen?.();
  write('unified launcher ready');
  setTimeout(boot, 600);
})();
