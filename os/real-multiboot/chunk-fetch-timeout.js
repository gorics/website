(() => {
  'use strict';
  if (globalThis.__goricsChunkFetchTimeout) return;
  Object.defineProperty(globalThis, '__goricsChunkFetchTimeout', { value: true });

  const originalFetch = globalThis.fetch.bind(globalThis);
  const chunkPattern = /\/v86-parts\/gorics-linux-gui-web-i386(?:\.iso)?-\d+-\d+(?:\.iso)?(?:[?#]|$)/;

  globalThis.fetch = async function(input, init = {}) {
    const url = input instanceof Request ? input.url : String(input);
    if (!chunkPattern.test(url)) return originalFetch(input, init);

    const upstreamSignal = init?.signal || (input instanceof Request ? input.signal : null);
    const controller = new AbortController();
    const abortFromUpstream = () => controller.abort(upstreamSignal?.reason || 'upstream-abort');
    if (upstreamSignal?.aborted) abortFromUpstream();
    else upstreamSignal?.addEventListener('abort', abortFromUpstream, { once: true });
    const timer = setTimeout(() => controller.abort('source-timeout'), 25000);

    try {
      return await originalFetch(input, { ...(init || {}), signal: controller.signal });
    } finally {
      clearTimeout(timer);
      upstreamSignal?.removeEventListener('abort', abortFromUpstream);
    }
  };
})();
