(() => {
  'use strict';

  const rawRoot = 'https://raw.githubusercontent.com/gorics/website/os-assets/os/real-multiboot/assets/v86-parts/';
  const cdnRoot = 'https://cdn.jsdelivr.net/gh/gorics/website@os-assets/os/real-multiboot/assets/v86-parts/';
  const stem = 'gorics-linux-gui-web-i386';
  const publishedBase = `${stem}.iso`;
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalFetch = globalThis.fetch.bind(globalThis);
  let rewrites = 0;
  let fallbacks = 0;

  function pageLog(message) {
    const line = `[${new Date().toISOString()}] ${message}`;
    const box = document.querySelector('#log');
    if (box) {
      box.textContent += `\n${line}`;
      box.scrollTop = box.scrollHeight;
    }
    console.log('[GORICS CHUNK]', message);
  }

  function parseAsset(url) {
    let parsed;
    try {
      parsed = new URL(String(url), location.href);
    } catch {
      return null;
    }

    const href = parsed.href;
    let sourceRoot = null;
    if (href.startsWith(rawRoot)) sourceRoot = rawRoot;
    if (href.startsWith(cdnRoot)) sourceRoot = cdnRoot;
    if (!sourceRoot) return null;

    const filename = decodeURIComponent(parsed.pathname.split('/').pop() || '');
    const patterns = [
      new RegExp(`^${stem}-(\\d+)-(\\d+)\\.iso$`),
      new RegExp(`^${stem}\\.iso-(\\d+)-(\\d+)\\.iso$`),
      new RegExp(`^${stem}\\.iso-(\\d+)-(\\d+)$`),
    ];

    for (const pattern of patterns) {
      const match = filename.match(pattern);
      if (!match) continue;
      return {
        start: match[1],
        end: match[2],
        search: parsed.search,
        publishedName: `${publishedBase}-${match[1]}-${match[2]}`,
      };
    }

    return null;
  }

  function assetUrl(asset, root) {
    return `${root}${asset.publishedName}${asset.search || ''}`;
  }

  function primaryUrl(url) {
    const asset = parseAsset(url);
    if (!asset) return url;
    const target = assetUrl(asset, cdnRoot);
    rewrites += 1;
    if (rewrites <= 12 || asset.start === '335544320') {
      pageLog(`ISO chunk routed to CDN ${asset.publishedName}`);
    }
    return target;
  }

  function fallbackUrl(url) {
    const asset = parseAsset(url);
    return asset ? assetUrl(asset, rawRoot) : url;
  }

  if (!XMLHttpRequest.prototype.__goricsChunkCompat) {
    Object.defineProperty(XMLHttpRequest.prototype, '__goricsChunkCompat', {
      value: true,
      configurable: false,
      enumerable: false,
      writable: false,
    });

    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
      return originalOpen.call(this, method, primaryUrl(url), ...rest);
    };
  }

  if (!globalThis.__goricsChunkFetchCompat) {
    Object.defineProperty(globalThis, '__goricsChunkFetchCompat', {
      value: true,
      configurable: false,
      enumerable: false,
      writable: false,
    });

    globalThis.fetch = async function(input, init) {
      const originalUrl = input instanceof Request ? input.url : String(input);
      const asset = parseAsset(originalUrl);
      if (!asset) return originalFetch(input, init);

      const primary = assetUrl(asset, cdnRoot);
      const fallback = assetUrl(asset, rawRoot);
      const requestInit = input instanceof Request ? undefined : init;
      const primaryInput = input instanceof Request ? new Request(primary, input) : primary;

      try {
        const response = await originalFetch(primaryInput, requestInit);
        if (response.ok || (response.status >= 200 && response.status < 400)) return response;
        if (response.status !== 429 && response.status < 500) return response;
        fallbacks += 1;
        pageLog(`CDN chunk HTTP ${response.status}; raw fallback ${asset.publishedName}`);
      } catch (error) {
        fallbacks += 1;
        pageLog(`CDN chunk fetch failed; raw fallback ${asset.publishedName}: ${error?.message || error}`);
      }

      const fallbackInput = input instanceof Request ? new Request(fallback, input) : fallback;
      return originalFetch(fallbackInput, requestInit);
    };
  }

  pageLog('ISO chunk CDN router installed (jsDelivr primary, raw GitHub fallback)');
})();
