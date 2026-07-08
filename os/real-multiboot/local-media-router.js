(() => {
  'use strict';

  const BUILD = '20260708-r10-local-media';
  const LOCAL_ROOT = '/website/vendor/v86/images/';
  const ROUTES = new Map([
    ['/buildroot-bzimage68.bin', `${LOCAL_ROOT}buildroot-bzimage68.bin`],
    ['/linux4.iso', `${LOCAL_ROOT}linux4.iso`],
    ['/linux.iso', `${LOCAL_ROOT}linux.iso`],
    ['/freedos722.img', `${LOCAL_ROOT}freedos722.img`],
    ['/dsl-4.11.rc2.iso', `${LOCAL_ROOT}dsl-4.11.rc2.iso`],
  ]);

  function rewrite(input) {
    try {
      const raw = typeof input === 'string' ? input : input?.url;
      if (!raw) return input;
      const url = new URL(raw, location.href);
      if (url.hostname !== 'i.copy.sh') return input;
      const localPath = ROUTES.get(url.pathname);
      if (!localPath) return input;
      const local = new URL(localPath, location.origin);
      local.search = url.search;
      console.log(`[GORICS LOCAL MEDIA] ${url.href} -> ${local.href}`);
      return local.href;
    } catch (error) {
      console.warn('[GORICS LOCAL MEDIA] rewrite failed', error);
      return input;
    }
  }

  const nativeFetch = globalThis.fetch?.bind(globalThis);
  if (nativeFetch) {
    globalThis.fetch = function goricsLocalMediaFetch(input, init) {
      const rewritten = rewrite(input);
      if (rewritten === input) return nativeFetch(input, init);
      if (typeof Request !== 'undefined' && input instanceof Request) {
        return nativeFetch(new Request(rewritten, input), init);
      }
      return nativeFetch(rewritten, init);
    };
  }

  const NativeXHR = globalThis.XMLHttpRequest;
  if (NativeXHR?.prototype?.open) {
    const nativeOpen = NativeXHR.prototype.open;
    NativeXHR.prototype.open = function goricsLocalMediaOpen(method, url, ...rest) {
      return nativeOpen.call(this, method, rewrite(url), ...rest);
    };
  }

  globalThis.__GORICS_LOCAL_MEDIA_ROUTER__ = {
    build: BUILD,
    routes: Object.fromEntries(ROUTES),
    rewrite,
  };
  console.log(`[GORICS LOCAL MEDIA] router installed build=${BUILD} routes=${ROUTES.size}`);
})();
