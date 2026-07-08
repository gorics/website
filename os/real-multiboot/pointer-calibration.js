(() => {
  'use strict';

  const BUILD = '20260708-r18-pointer-calibration';
  const screen = document.querySelector('#screen');
  const screenWrap = document.querySelector('#screen-wrap');
  const logBox = document.querySelector('#log');
  const viewport = window.visualViewport;

  if (!screen || !screenWrap) return;

  let frame = 0;
  let lastGeometryKey = '';
  let resizeObserver = null;
  let mutationObserver = null;

  function log(message, level = 'info') {
    const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] [POINTER] ${message}`;
    if (logBox) {
      logBox.textContent += `\n${line}`;
      logBox.scrollTop = logBox.scrollHeight;
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
    screen.style.removeProperty('width');
    screen.style.removeProperty('height');
    screen.style.removeProperty('min-height');
    screen.style.removeProperty('--guest-display-width');
    screen.style.removeProperty('--guest-display-height');
    lastGeometryKey = '';
    log('canvas hidden; pointer input area restored to full screen container');
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
    const displayWidth = Math.max(1, Math.floor(sourceWidth * scale));
    const displayHeight = Math.max(1, Math.floor(sourceHeight * scale));
    const geometryKey = `${sourceWidth}x${sourceHeight}:${availableWidth}x${availableHeight}:${displayWidth}x${displayHeight}`;

    if (geometryKey === lastGeometryKey && screen.classList.contains('pointer-calibrated')) return;
    lastGeometryKey = geometryKey;

    screen.classList.add('pointer-calibrated');
    screen.style.setProperty('width', `${displayWidth}px`, 'important');
    screen.style.setProperty('height', `${displayHeight}px`, 'important');
    screen.style.setProperty('min-height', '0', 'important');
    screen.style.setProperty('--guest-display-width', `${displayWidth}px`);
    screen.style.setProperty('--guest-display-height', `${displayHeight}px`);

    canvas.style.setProperty('width', `${displayWidth}px`, 'important');
    canvas.style.setProperty('height', `${displayHeight}px`, 'important');
    canvas.style.setProperty('max-width', '100%', 'important');
    canvas.style.setProperty('max-height', '100%', 'important');
    canvas.style.setProperty('object-fit', 'fill', 'important');

    screen.dataset.pointerGeometry = geometryKey;
    log(`calibrated reason=${reason} guest=${sourceWidth}x${sourceHeight} frame=${availableWidth}x${availableHeight} input=${displayWidth}x${displayHeight} scale=${scale.toFixed(4)}`);
  }

  function scheduleCalibration(reason) {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => calibrateNow(reason));
    });
  }

  function belongsToGuest(target) {
    return target instanceof Node && screen.contains(target) && Boolean(visibleCanvas());
  }

  function syncAbsolutePositionBeforeClick(event) {
    if (!belongsToGuest(event.target)) return;

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

  resizeObserver = typeof ResizeObserver === 'function'
    ? new ResizeObserver(() => scheduleCalibration('resize-observer'))
    : null;
  resizeObserver?.observe(screenWrap);

  mutationObserver = typeof MutationObserver === 'function'
    ? new MutationObserver((mutations) => {
        const relevant = mutations.some((mutation) =>
          mutation.type === 'childList' ||
          ['width', 'height', 'hidden', 'style', 'class'].includes(mutation.attributeName)
        );
        if (relevant) scheduleCalibration('canvas-mutation');
      })
    : null;
  mutationObserver?.observe(screen, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['width', 'height', 'hidden', 'style', 'class'],
  });

  window.addEventListener('mousedown', syncAbsolutePositionBeforeClick, true);
  window.addEventListener('resize', () => scheduleCalibration('window-resize'), { passive: true });
  window.addEventListener('orientationchange', () => scheduleCalibration('orientationchange'), { passive: true });
  viewport?.addEventListener('resize', () => scheduleCalibration('visual-viewport-resize'), { passive: true });
  viewport?.addEventListener('scroll', () => scheduleCalibration('visual-viewport-scroll'), { passive: true });
  document.addEventListener('fullscreenchange', () => scheduleCalibration('fullscreenchange'));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) scheduleCalibration('visibilitychange');
  });

  window.goricsPointerCalibration = {
    build: BUILD,
    recalibrate: () => scheduleCalibration('manual'),
    geometry: () => screen.dataset.pointerGeometry || null,
  };

  scheduleCalibration('startup');
  log(`installed build=${BUILD}`);
})();
