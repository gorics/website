(() => {
  'use strict';

  const root = 'https://raw.githubusercontent.com/gorics/website/os-assets/os/real-multiboot/assets/v86-parts/';
  const stem = 'gorics-linux-gui-web-i386';
  const legacyBase = `${stem}.iso`;
  const originalOpen = XMLHttpRequest.prototype.open;
  let rewrites = 0;

  function pageLog(message) {
    const line = `[${new Date().toISOString()}] ${message}`;
    const box = document.querySelector('#log');
    if (box) {
      box.textContent += `\n${line}`;
      box.scrollTop = box.scrollHeight;
    }
    console.log('[GORICS CHUNK]', message);
  }

  function rewrite(url) {
    let parsed;
    try {
      parsed = new URL(String(url), location.href);
    } catch {
      return url;
    }

    if (!parsed.href.startsWith(root)) return url;

    const filename = decodeURIComponent(parsed.pathname.split('/').pop() || '');
    const patterns = [
      new RegExp(`^${stem}-(\\d+)-(\\d+)\\.iso$`),
      new RegExp(`^${stem}\\.iso-(\\d+)-(\\d+)\\.iso$`),
    ];

    for (const pattern of patterns) {
      const match = filename.match(pattern);
      if (!match) continue;
      const target = `${root}${legacyBase}-${match[1]}-${match[2]}`;
      rewrites += 1;
      if (rewrites <= 10 || match[1] === '335544320') {
        pageLog(`v86 chunk URL rewrite ${filename} -> ${target.split('/').pop()}`);
      }
      return target;
    }

    return url;
  }

  if (!XMLHttpRequest.prototype.__goricsChunkCompat) {
    Object.defineProperty(XMLHttpRequest.prototype, '__goricsChunkCompat', {
      value: true,
      configurable: false,
      enumerable: false,
      writable: false,
    });

    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
      return originalOpen.call(this, method, rewrite(url), ...rest);
    };

    pageLog('v86 ISO chunk compatibility bridge installed');
  }
})();
