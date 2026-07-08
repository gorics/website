(() => {
  'use strict';

  const BUILD = '20260708-r18-terminal-network';
  const LOCAL_ROOT = '/website/vendor/v86/images/';
  const DEFAULT_RELAY = 'wss://relay.widgetry.org/';
  const WRAPPED = Symbol.for('gorics.v86.network.wrapped');
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

  function networkMode() {
    const requested = new URLSearchParams(location.search).get('network');
    if (requested === 'off' || requested === 'none') return 'off';
    if (requested === 'fetch') return 'fetch';
    return 'relay';
  }

  function withNetwork(options = {}) {
    if (options.network_relay_url || options.net_device?.relay_url || networkMode() === 'off') return options;
    const modernLinux = Boolean(options.bzimage && options.initrd);
    const relayUrl = networkMode() === 'fetch' ? 'fetch' : DEFAULT_RELAY;
    const netDevice = {
      type: modernLinux ? 'virtio' : 'ne2k',
      relay_url: relayUrl,
      router_ip: '192.168.86.1',
      vm_ip: '192.168.86.100',
      masquerade: true,
      dns_method: relayUrl === 'fetch' ? 'static' : 'doh',
    };
    console.log(`[GORICS NETWORK] enabled type=${netDevice.type} backend=${relayUrl}`);
    return { ...options, net_device: netDevice };
  }

  function wrapConstructor(NativeConstructor, name) {
    if (typeof NativeConstructor !== 'function' || NativeConstructor[WRAPPED]) return NativeConstructor;
    function GoricsNetworkV86(options) {
      return new NativeConstructor(withNetwork(options));
    }
    try { Object.setPrototypeOf(GoricsNetworkV86, NativeConstructor); } catch {}
    GoricsNetworkV86.prototype = NativeConstructor.prototype;
    Object.defineProperty(GoricsNetworkV86, WRAPPED, { value: true });
    Object.defineProperty(GoricsNetworkV86, 'name', { value: name, configurable: true });
    return GoricsNetworkV86;
  }

  function installConstructorHook(name) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
    if (descriptor && descriptor.configurable === false) {
      if (typeof globalThis[name] === 'function') globalThis[name] = wrapConstructor(globalThis[name], name);
      return;
    }
    let current = typeof globalThis[name] === 'function' ? wrapConstructor(globalThis[name], name) : globalThis[name];
    Object.defineProperty(globalThis, name, {
      configurable: true,
      enumerable: true,
      get() { return current; },
      set(value) { current = wrapConstructor(value, name); },
    });
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

  installConstructorHook('V86');
  installConstructorHook('V86Starter');

  globalThis.__GORICS_LOCAL_MEDIA_ROUTER__ = {
    build: BUILD,
    routes: Object.fromEntries(ROUTES),
    network: { mode: networkMode(), defaultRelay: DEFAULT_RELAY },
    rewrite,
    withNetwork,
  };
  console.log(`[GORICS LOCAL MEDIA] router installed build=${BUILD} routes=${ROUTES.size} network=${networkMode()}`);
})();
