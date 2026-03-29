(() => {
  'use strict';

  const conf = window.REAL_OS_CONFIG;
  if (!conf) throw new Error('REAL_OS_CONFIG is required');

  const V86_LIB = 'https://cdn.jsdelivr.net/npm/v86@0.5.44/build/libv86.js';
  const WASM = 'https://cdn.jsdelivr.net/npm/v86@0.5.44/build/v86.wasm';
  const BIOS = 'https://cdn.jsdelivr.net/npm/v86@0.5.44/bios/seabios.bin';
  const VGA = 'https://cdn.jsdelivr.net/npm/v86@0.5.44/bios/vgabios.bin';

  const logEl = document.getElementById('log');
  const screenEl = document.getElementById('screen');
  const bootBtn = document.getElementById('boot-btn');
  const stopBtn = document.getElementById('stop-btn');
  const fullBtn = document.getElementById('full-btn');

  let emulator = null;

  const toLinuxIsoCandidates = (url) => {
    const out = [];
    if (!url) return out;

    const trimmed = String(url).trim();
    const hasIso = /\/linux\.iso(?:[?#].*)?$/i.test(trimmed);
    const base = trimmed.replace(/\/+$/, '');

    if (hasIso) {
      out.push(trimmed);
    } else if (/\/os\/linux\/1$/i.test(base)) {
      out.push(`${base}/linux.iso`);
      out.push('/website/os/linux/1/linux.iso');
      out.push('/os/linux/1/linux.iso');
    } else {
      out.push(trimmed);
    }

    return [...new Set(out)];
  };

  const canFetch = async (url) => {
    try {
      const res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
      return res.ok;
    } catch (_) {
      return false;
    }
  };

  const resolveBootConfig = async (boot) => {
    if (!boot || !boot.cdrom || !boot.cdrom.url) return boot;

    const candidates = toLinuxIsoCandidates(boot.cdrom.url);
    for (const candidate of candidates) {
      if (await canFetch(candidate)) {
        if (candidate !== boot.cdrom.url) {
          log(`linux ISO 경로 자동 보정: ${boot.cdrom.url} -> ${candidate}`);
        }
        return { ...boot, cdrom: { ...boot.cdrom, url: candidate } };
      }
    }

    log('경고: 사용 가능한 linux ISO 경로를 찾지 못했습니다. 원본 URL로 시도합니다.');
    return boot;
  };

  const log = (msg) => {
    const t = new Date().toISOString().slice(11, 19);
    logEl.textContent += `\n[${t}] ${msg}`;
    logEl.scrollTop = logEl.scrollHeight;
  };

  const loadScript = async () => {
    if (window.V86Starter || window.V86) return;
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = V86_LIB;
      s.async = true;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  };

  const stop = () => {
    if (!emulator) return log('실행 중 VM 없음.');
    try { emulator.stop(); } catch (e) { log(`stop 실패: ${e.message}`); }
    emulator = null;
    screenEl.innerHTML = '';
    log('VM 종료.');
  };

  const boot = async () => {
    bootBtn.disabled = true;
    log(`${conf.name} 부팅 시작...`);
    try {
      if (emulator) stop();
      screenEl.innerHTML = '';
      await loadScript();
      const Ctor = window.V86Starter || window.V86;
      if (!Ctor) throw new Error('v86 ctor missing');

      const resolvedBoot = await resolveBootConfig(conf.boot);

      emulator = new Ctor({
        wasm_path: WASM,
        bios: { url: BIOS },
        vga_bios: { url: VGA },
        screen_container: screenEl,
        memory_size: conf.memory,
        vga_memory_size: 8 * 1024 * 1024,
        autostart: true,
        ...resolvedBoot,
      });

      emulator.add_listener('emulator-ready', () => log('emulator-ready'));
      emulator.add_listener('emulator-started', () => log('emulator-started'));
      emulator.add_listener('emulator-stopped', () => log('emulator-stopped'));
      emulator.add_listener('download-progress', (ev) => {
        if (!ev?.total) return;
        log(`download ${((ev.loaded / ev.total) * 100).toFixed(1)}%`);
      });
    } catch (e) {
      log(`부팅 실패: ${e.message}`);
    } finally {
      bootBtn.disabled = false;
    }
  };

  bootBtn.addEventListener('click', boot);
  stopBtn.addEventListener('click', stop);
  fullBtn.addEventListener('click', async () => {
    if (!document.fullscreenElement) return screenEl.requestFullscreen?.();
    return document.exitFullscreen?.();
  });

  document.getElementById('title').textContent = conf.name;
  document.getElementById('desc').textContent = conf.description;
  log('[ready] launcher loaded');
})();
