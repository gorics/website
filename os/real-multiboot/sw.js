const RELEASE_API = 'https://api.github.com/repos/gorics/website/releases/tags/gorics-linux-gui-iso-latest';
const ASSET_API = 'https://api.github.com/repos/gorics/website/releases/assets/';
let assetMapPromise;

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

function loadAssetMap() {
  if (!assetMapPromise) {
    assetMapPromise = fetch(RELEASE_API, {
      cache: 'no-store',
      headers: { Accept: 'application/vnd.github+json' }
    }).then(response => {
      if (!response.ok) throw new Error('release metadata HTTP ' + response.status);
      return response.json();
    }).then(data => {
      const map = new Map();
      for (const asset of data.assets || []) map.set(asset.name, asset.id);
      return map;
    }).catch(error => {
      assetMapPromise = undefined;
      throw error;
    });
  }
  return assetMapPromise;
}

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (!url.pathname.includes('/os/real-multiboot/v86-parts/')) return;
  const name = decodeURIComponent(url.pathname.split('/').pop());
  event.respondWith((async () => {
    const map = await loadAssetMap();
    const id = map.get(name);
    if (!id) return new Response('missing release asset: ' + name, { status: 404 });
    const response = await fetch(ASSET_API + id, {
      redirect: 'follow',
      headers: { Accept: 'application/octet-stream' }
    });
    if (!response.ok) return new Response('asset API HTTP ' + response.status, { status: 502 });
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    return new Response(response.body, { status: 200, headers });
  })());
});
