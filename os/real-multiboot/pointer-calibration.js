(() => {
  'use strict';

  const BUILD = document.querySelector('meta[name="gorics-build"]')?.content || '20260710-r19-stability';
  const screen = document.querySelector('#screen');
  const screenWrap = document.querySelector('#screen-wrap');
  const logBox = document.querySelector('#log');
  const viewport = window.visualViewport;
  if (!screen || !screenWrap) return;

  let frame = 0;
  let lastGeometryKey = '';

  function log(message, level = 'info') {
    const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] [POINTER] ${message}`;
    if (logBox) {
      const next = `${logBox.textContent || ''}\n${line}`;
      logBox.textContent = next.length > 60000 ? next.slice(-60000) : next;
    }
    const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
    console[method]('[GORICS POINTER]', message);
  }

  function visibleCanvas() {
    const canvas = screen.querySelector('canvas');
    if (!canvas || canvas.hidden) return null;
    const style = getComputedStyle(canvas);
    if (style.display === 'none' || style.visibility === 'hidden') return null;
    return canvas;
  }

  function clearCalibration() {
    if (!screen.classList.contains('pointer-calibrated')) return;
    screen.classList.remove('pointer-calibrated');
    screen.style.removeProperty('--guest-display-width');
    screen.style.removeProperty('--guest-display-height');
    screen.removeAttribute('data-pointer-geometry');
    lastGeometryKey = '';
  }

  function calibrateNow(reason = 'scheduled') {
    const canvas = visibleCanvas();
    if (!canvas) {
      clearCalibration();
      return;
    }

    const sourceWidth = Number(canvas.getAttribute('width')) || canvas.width;
    const sourceHeight = Number(canvas.getAttribute('height')) || canvas.height;
    const availableWidth = Math.max(1, screenWrap.clientWidth);
    const availableHeight = Math.max(1, screenWrap.clientHeight);
    if (!sourceWidth || !sourceHeight || !availableWidth || !availableHeight) return;

    const scale = Math.min(availableWidth / sourceWidth, availableHeight / sourceHeight);
    const displayWidth = Math.max(1, Math.round(sourceWidth * scale));
    const displayHeight = Math.max(1, Math.round(sourceHeight * scale));
    const geometryKey = `${sourceWidth}x${sourceHeight}:${availableWidth}x${availableHeight}:${displayWidth}x${displayHeight}`;
    if (geometryKey === lastGeometryKey && screen.classList.contains('pointer-calibrated')) return;

    lastGeometryKey = geometryKey;
    screen.classList.add('pointer-calibrated');
    screen.style.setProperty('--guest-display-width', `${displayWidth}px`);
    screen.style.setProperty('--guest-display-height', `${displayHeight}px`);
    canvas.style.setProperty('width', '100%', 'important');
    canvas.style.setProperty('height', '100%', 'important');
    canvas.style.setProperty('max-width', '100%', 'important');
    canvas.style.setProperty('max-height', '100%', 'important');
    screen.dataset.pointerGeometry = geometryKey;
    log(`calibrated reason=${reason} guest=${sourceWidth}x${sourceHeight} frame=${availableWidth}x${availableHeight} input=${displayWidth}x${displayHeight} scale=${scale.toFixed(4)}`);
  }

  function scheduleCalibration(reason) {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => requestAnimationFrame(() => calibrateNow(reason)));
  }

  function syncMousePosition(event) {
    if (event.pointerType && event.pointerType !== 'mouse') {
      calibrateNow('pre-touch');
      return;
    }
    if (!(event.target instanceof Node) || !screen.contains(event.target) || !visibleCanvas()) return;
    calibrateNow('pre-click');
    const rect = screen.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return;
    const target = event.target instanceof Element ? event.target : screen;
    target.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: event.clientX,
      clientY: event.clientY,
      screenX: event.screenX,
      screenY: event.screenY,
      buttons: event.buttons,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      metaKey: event.metaKey,
    }));
  }

  if (typeof ResizeObserver === 'function') new ResizeObserver(() => scheduleCalibration('resize-observer')).observe(screenWrap);
  if (typeof MutationObserver === 'function') {
    new MutationObserver((mutations) => {
      if (mutations.some((mutation) => mutation.type === 'childList' || ['width', 'height', 'hidden', 'style', 'class'].includes(mutation.attributeName))) {
        scheduleCalibration('canvas-mutation');
      }
    }).observe(screen, { childList: true, subtree: true, attributes: true, attributeFilter: ['width', 'height', 'hidden', 'style', 'class'] });
  }

  window.addEventListener('pointerdown', syncMousePosition, true);
  window.addEventListener('resize', () => scheduleCalibration('window-resize'), { passive: true });
  window.addEventListener('orientationchange', () => scheduleCalibration('orientationchange'), { passive: true });
  viewport?.addEventListener('resize', () => scheduleCalibration('visual-viewport-resize'), { passive: true });
  viewport?.addEventListener('scroll', () => scheduleCalibration('visual-viewport-scroll'), { passive: true });
  document.addEventListener('fullscreenchange', () => scheduleCalibration('fullscreenchange'));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleCalibration('visibilitychange'); });

  window.goricsPointerCalibration = Object.freeze({
    build: BUILD,
    recalibrate: () => scheduleCalibration('manual'),
    geometry: () => screen.dataset.pointerGeometry || null,
  });

  scheduleCalibration('startup');
  log(`installed build=${BUILD}`);
})();
