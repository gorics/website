(() => {
  'use strict';

  const nativeSetTimeout = window.setTimeout.bind(window);
  const nativeClearTimeout = window.clearTimeout.bind(window);
  const guardedTimers = new Map();
  let nextGuardedId = -1;

  function diagnostic(message) {
    const line = `[${new Date().toISOString()}] [INFO] ${message}`;
    const logBox = document.querySelector('#log');
    if (logBox) {
      logBox.textContent += `\n${line}`;
      logBox.scrollTop = logBox.scrollHeight;
    }
    console.info('[GORICS VISIBILITY GUARD]', message);
  }

  function isBootTimeout(handler, delay) {
    if (typeof handler !== 'function') return false;
    const milliseconds = Number(delay);
    if (!Number.isFinite(milliseconds) || milliseconds < 14 * 60 * 1000 || milliseconds > 16 * 60 * 1000) return false;
    try {
      const source = Function.prototype.toString.call(handler);
      return /boot timed out|bootTimeout|15 minutes/i.test(source);
    } catch {
      return false;
    }
  }

  function arm(record) {
    if (record.cancelled || record.nativeId !== null || document.hidden) return;
    record.startedAt = performance.now();
    record.nativeId = nativeSetTimeout(() => {
      record.nativeId = null;
      guardedTimers.delete(record.id);
      if (!record.cancelled) record.handler(...record.args);
    }, Math.max(1, record.remaining));
  }

  function pause(record) {
    if (record.cancelled || record.nativeId === null) return;
    const elapsed = Math.max(0, performance.now() - record.startedAt);
    record.remaining = Math.max(1, record.remaining - elapsed);
    nativeClearTimeout(record.nativeId);
    record.nativeId = null;
  }

  window.setTimeout = function guardedSetTimeout(handler, delay, ...args) {
    if (!isBootTimeout(handler, delay)) return nativeSetTimeout(handler, delay, ...args);

    const id = nextGuardedId--;
    const record = {
      id,
      handler,
      args,
      remaining: Number(delay),
      startedAt: 0,
      nativeId: null,
      cancelled: false,
    };
    guardedTimers.set(id, record);
    arm(record);
    diagnostic(`boot timeout armed as foreground-active time id=${id} remainingMs=${record.remaining}`);
    return id;
  };

  window.clearTimeout = function guardedClearTimeout(id) {
    const record = guardedTimers.get(id);
    if (!record) return nativeClearTimeout(id);
    record.cancelled = true;
    if (record.nativeId !== null) nativeClearTimeout(record.nativeId);
    guardedTimers.delete(id);
  };

  document.addEventListener('visibilitychange', () => {
    for (const record of guardedTimers.values()) {
      if (document.hidden) pause(record);
      else arm(record);
    }
    if (guardedTimers.size) {
      const remaining = Math.round(Math.min(...[...guardedTimers.values()].map((record) => record.remaining)));
      diagnostic(`visibility=${document.visibilityState} guardedBootTimers=${guardedTimers.size} remainingMs=${remaining}`);
    }
  });

  window.addEventListener('pagehide', () => {
    for (const record of guardedTimers.values()) pause(record);
  });

  window.addEventListener('pageshow', () => {
    for (const record of guardedTimers.values()) arm(record);
  });

  diagnostic('foreground-active boot timeout guard installed');
})();
