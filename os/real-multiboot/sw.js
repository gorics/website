'use strict';

const VERSION = '20260708r1';
const CACHE_NAME = `gorics-v86-runtime-${VERSION}`;
const RELEASE_API = 'https://api.github.com/repos/gorics/website/releases/tags/gorics-linux-gui-iso-latest';
const ASSET_API = 'https://api.github.com/repos/gorics/website/releases/assets/';
const PAGE_PREFIX = '/website/os/real-multiboot/';
const RUNTIME_PREFIX = `${PAGE_PREFIX}runtime/`;
const PARTS_PREFIX = `${PAGE_PREFIX}v86-parts/`;
const PRECOMPILED_ROOT = 'https://cdn.jsdelivr.net/gh/cloudgamingrage/copysh-v86-precompiled@main/';
const RAW_ROOT = 'https://raw.githubusercontent.com/cloudgamingrage/copysh-v86-precompiled/main/';
const COPY_ROOT = 'https://copy.sh/v86/';

const runtimeFiles = {
  'libv86.js': {
    type: 'text/javascript; charset=utf-8',
    paths: ['build/libv86.js'],
  },
  'v86.wasm': {
    type: 'application/wasm',
    paths: ['build/v86.wasm'],
  },
  'seabios.bin': {
    type: 'application/octet-stream',
    paths: ['bios/seabios.bin'],
  },
  'vgabios.bin': {
    type: 'application/octet-stream',
    paths: ['bios/vgabios.bin'],
  },
};

let assetMapPromise;

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('gorics-v86-runtime-') && key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function loadAssetMap() {
  if (!assetMapPromise) {
    assetMapPromise = fetch(RELEASE_API, {
      cache: 'no-store',
      headers: { Accept: 'application/vnd.github+json' },
    }).then(async (response) => {
      if (!response.ok) throw new Error(`release metadata HTTP ${response.status}`);
      const data = await response.json();
      const map = new Map();
      for (const asset of data.assets || []) {
        map.set(asset.name, {
          id: asset.id,
          size: asset.size,
          browserDownloadUrl: asset.browser_download_url,
        });
      }
      return map;
    }).catch((error) => {
      assetMapPromise = undefined;
      throw error;
    });
  }
  return assetMapPromise;
}

function copyHeaders(response, contentType) {
  const headers = new Headers(response.headers);
  if (contentType) headers.set('Content-Type', contentType);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('X-Gorics-Proxy', VERSION);
  return headers;
}

async function proxyRuntime(request, name) {
  const config = runtimeFiles[name];
  if (!config) return new Response('runtime file not found', { status: 404 });

  const cache = await caches.open(CACHE_NAME);
  const cacheKey = new Request(new URL(`${RUNTIME_PREFIX}${name}`, self.location.origin).href);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const localUrl = new URL(`/website/vendor/v86/${name}`, self.location.origin).href;
  const candidates = [
    localUrl,
    ...config.paths.map((path) => PRECOMPILED_ROOT + path),
    ...config.paths.map((path) => RAW_ROOT + path),
    ...config.paths.map((path) => COPY_ROOT + path),
  ];

  let lastError = 'no candidate attempted';
  for (const url of candidates) {
    try {
      const response = await fetch(url, { cache: 'no-store', redirect: 'follow' });
      if (!response.ok || !response.body) {
        lastError = `${url} HTTP ${response.status}`;
        continue;
      }
      const proxied = new Response(response.body, {
        status: 200,
        headers: copyHeaders(response, config.type),
      });
      await cache.put(cacheKey, proxied.clone());
      return proxied;
    } catch (error) {
      lastError = `${url} ${error.message}`;
    }
  }
  return new Response(`runtime proxy failed: ${lastError}`, {
    status: 502,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

async function fetchReleaseAsset(request, name) {
  const map = await loadAssetMap();
  const asset = map.get(name);
  if (!asset) return new Response(`missing release asset: ${name}`, { status: 404 });

  const range = request.headers.get('Range');
  const headers = { Accept: 'application/octet-stream' };
  if (range) headers.Range = range;

  let response;
  try {
    response = await fetch(ASSET_API + asset.id, { headers, redirect: 'follow', cache: 'no-store' });
  } catch (apiError) {
    response = null;
  }

  if (!response || !response.ok || /json/i.test(response.headers.get('content-type') || '')) {
    if (!asset.browserDownloadUrl) {
      return new Response(`asset API failed for ${name}`, { status: 502 });
    }
    try {
      response = await fetch(asset.browserDownloadUrl, { headers: range ? { Range: range } : {}, redirect: 'follow', cache: 'no-store' });
    } catch (error) {
      return new Response(`asset download failed: ${error.message}`, { status: 502 });
    }
  }

  if (!response.ok && response.status !== 206) {
    return new Response(`asset HTTP ${response.status}: ${name}`, { status: 502 });
  }

  const responseHeaders = new Headers(response.headers);
  responseHeaders.set('Cache-Control', name === 'V86-PARTS.txt' ? 'no-cache' : 'public, max-age=31536000, immutable');
  responseHeaders.set('X-Gorics-Proxy', VERSION);
  if (name.endsWith('.txt')) responseHeaders.set('Content-Type', 'text/plain; charset=utf-8');
  else responseHeaders.set('Content-Type', 'application/octet-stream');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith(RUNTIME_PREFIX)) {
    const name = decodeURIComponent(url.pathname.slice(RUNTIME_PREFIX.length));
    event.respondWith(proxyRuntime(event.request, name));
    return;
  }

  if (url.pathname.startsWith(PARTS_PREFIX)) {
    const name = decodeURIComponent(url.pathname.slice(PARTS_PREFIX.length));
    event.respondWith(fetchReleaseAsset(event.request, name).catch((error) => new Response(`release proxy error: ${error.message}`, {
      status: 502,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    })));
  }
});
