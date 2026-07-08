(() => {
  'use strict';

  const roots = [
    'https://cdn.jsdelivr.net/gh/gorics/website@os-assets/os/real-multiboot/assets/v86-parts/',
    'https://fastly.jsdelivr.net/gh/gorics/website@os-assets/os/real-multiboot/assets/v86-parts/',
    'https://gcore.jsdelivr.net/gh/gorics/website@os-assets/os/real-multiboot/assets/v86-parts/',
    'https://raw.githubusercontent.com/gorics/website/os-assets/os/real-multiboot/assets/v86-parts/',
  ];
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

  function ascii(bytes, start, length) {
    return String.fromCharCode(...bytes.slice(start, start + length));
  }

  function parseAsset(url) {
    let parsed;
    try {
      parsed = new URL(String(url), location.href);
    } catch {
      return null;
    }

    const sourceRoot = roots.find((root) => parsed.href.startsWith(root));
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
        start: Number(match[1]),
        end: Number(match[2]),
        search: parsed.search,
        sourceRoot,
        publishedName: `${publishedBase}-${match[1]}-${match[2]}`,
      };
    }

    return null;
  }

  function assetUrl(asset, root) {
    return `${root}${asset.publishedName}${asset.search || ''}`;
  }

  function orderedRoots(asset) {
    return [asset.sourceRoot, ...roots.filter((root) => root !== asset.sourceRoot)];
  }

  function primaryUrl(url) {
    const asset = parseAsset(url);
    if (!asset) return url;
    const target = assetUrl(asset, asset.sourceRoot);
    rewrites += 1;
    if (rewrites <= 16 || asset.start === 335544320) {
      pageLog(`ISO chunk filename normalized ${new URL(asset.sourceRoot).hostname} ${asset.publishedName}`);
    }
    return target;
  }

  function parseRange(init, input) {
    let value = null;
    try {
      const headers = input instanceof Request ? input.headers : new Headers(init?.headers || {});
      value = headers.get('range');
    } catch {}
    const match = /^bytes=(\d+)-(\d+)$/.exec(value || '');
    if (!match) return null;
    const start = Number(match[1]);
    const end = Number(match[2]);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end < start) return null;
    return { start, end, length: end - start + 1 };
  }

  async function normalizeRangeResponse(response, range, asset) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    let selected;

    if (response.status === 206 && bytes.length === range.length) {
      selected = bytes;
    } else if (response.status === 200 && bytes.length >= range.end + 1) {
      selected = bytes.slice(range.start, range.end + 1);
    } else if (bytes.length === range.length) {
      selected = bytes;
    } else {
      throw new Error(`range body mismatch status=${response.status} bytes=${bytes.length} expected=${range.length}`);
    }

    if (range.start === 32768 && range.end >= 36863) {
      if (selected.length < 4096 || ascii(selected, 1, 5) !== 'CD001') {
        throw new Error('ISO9660 descriptor missing after normalized range');
      }
      if (ascii(selected, 2049, 5) !== 'CD001' || !ascii(selected, 2055, 32).includes('EL TORITO')) {
        throw new Error('El Torito descriptor missing after normalized range');
      }
      pageLog(`ISO9660 and El Torito verified from ${new URL(asset.sourceRoot).hostname}`);
    }

    const headers = new Headers(response.headers);
    headers.set('content-length', String(selected.length));
    headers.set('content-range', `bytes ${range.start}-${range.end}/*`);
    headers.set('accept-ranges', 'bytes');
    return new Response(selected, {
      status: 206,
      statusText: 'Partial Content',
      headers,
    });
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

    Object.defineProperty(globalThis, '__goricsOriginalFetch', {
      value: originalFetch,
      configurable: false,
      enumerable: false,
      writable: false,
    });

    globalThis.fetch = async function(input, init) {
      const originalUrl = input instanceof Request ? input.url : String(input);
      const asset = parseAsset(originalUrl);
      if (!asset) return originalFetch(input, init);

      const range = parseRange(init, input);
      let lastError = null;

      for (const root of orderedRoots(asset)) {
        const target = assetUrl(asset, root);
        const targetInput = input instanceof Request ? new Request(target, input) : target;
        const requestInit = input instanceof Request ? undefined : init;
        try {
          const response = await originalFetch(targetInput, requestInit);
          if (!response.ok && response.status !== 206) {
            throw new Error(`HTTP ${response.status}`);
          }
          if (!range) return response;
          const normalized = await normalizeRangeResponse(response, range, { ...asset, sourceRoot: root });
          if (root !== asset.sourceRoot) {
            fallbacks += 1;
            pageLog(`ISO chunk fallback selected ${new URL(root).hostname} ${asset.publishedName}`);
          }
          return normalized;
        } catch (error) {
          lastError = error;
          fallbacks += 1;
          pageLog(`ISO chunk source rejected ${new URL(root).hostname} ${asset.publishedName}: ${error?.message || error}`);
        }
      }

      throw lastError || new Error(`all ISO chunk sources failed for ${asset.publishedName}`);
    };
  }

  pageLog('ISO chunk router r3 installed (range normalization + verified multi-CDN failover)');
})();
