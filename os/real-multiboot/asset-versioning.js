(() => {
  'use strict';

  if (globalThis.__GORICS_ATOMIC_ASSETS__) return;
  Object.defineProperty(globalThis, '__GORICS_ATOMIC_ASSETS__', { value: true });

  const build = document.querySelector('meta[name="gorics-build"]')?.content?.trim() || 'dev';
  const VERSIONED_PATHS = [
    '/website/vendor/v86/',
    '/website/os/real-multiboot/assets/vmlinuz',
    '/website/os/real-multiboot/assets/initrd.img',
    '/website/os/real-multiboot/assets/iso-meta.json',
  ];
  // Accept both legacy names and versioned names such as
  // gorics-linux-gui-web-i386-r12.iso-0-16777216.
  const ISO_PART = /\/v86-parts\/gorics-linux-gui-web-i386[^/]*-\d+-\d+(?:\.iso)?$/i;

  function shouldVersion(url) {
    if (ISO_PART.test(url.pathname)) return true;
    return url.origin === location.origin && VERSIONED_PATHS.some((path) => url.pathname.startsWith(path));
  }

  function versioned(input) {
    try {
      const url = new URL(String(input), location.href);
      if (!shouldVersion(url)) return String(input);
      url.searchParams.set('v', build);
      return url.href;
    } catch {
      return String(input);
    }
  }

  const nativeFetch = globalThis.fetch?.bind(globalThis);
  if (nativeFetch) {
    globalThis.fetch = function goricsAtomicFetch(input, init) {
      const raw = input instanceof Request ? input.url : String(input);
      const next = versioned(raw);
      if (next === raw) return nativeFetch(input, init);
      if (input instanceof Request) return nativeFetch(new Request(next, input), init);
      return nativeFetch(next, init);
    };
  }

  const NativeXHR = globalThis.XMLHttpRequest;
  if (NativeXHR?.prototype?.open) {
    const nativeOpen = NativeXHR.prototype.open;
    NativeXHR.prototype.open = function goricsAtomicOpen(method, url, ...rest) {
      return nativeOpen.call(this, method, versioned(url), ...rest);
    };
  }

  const nativeAppendChild = Node.prototype.appendChild;
  Node.prototype.appendChild = function goricsAtomicAppendChild(node) {
    if (node instanceof HTMLScriptElement && node.src) {
      try {
        const parsed = new URL(node.src, location.href);
        if (parsed.pathname === '/website/vendor/v86/libv86.js') node.src = versioned(parsed.href);
      } catch {
        // Keep native append behaviour for malformed URLs.
      }
    }
    return nativeAppendChild.call(this, node);
  };

  globalThis.GORICS_ASSET_VERSION = Object.freeze({ build, versioned, isoPartPattern: ISO_PART.source });
  console.log(`[GORICS ASSET] atomic cache versioning installed build=${build}`);
})();