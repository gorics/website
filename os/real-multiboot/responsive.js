(() => {
  'use strict';

  const root = document.documentElement;
  const screen = document.querySelector('#screen');
  const viewport = window.visualViewport;
  let viewportFrame = 0;
  let displayFrame = 0;
  let lastViewportKey = '';
  let lastCanvasKey = '';

  function viewportSize() {
    const width = Math.max(1, Math.round(viewport?.width || window.innerWidth || root.clientWidth || 1));
    const height = Math.max(1, Math.round(viewport?.height || window.innerHeight || root.clientHeight || 1));
    return { width, height };
  }

  function fitDisplay() {
    cancelAnimationFrame(displayFrame);
    displayFrame = requestAnimationFrame(() => {
      if (!screen) return;
      const canvas = screen.querySelector('canvas');
      if (!canvas || canvas.hidden || getComputedStyle(canvas).display === 'none') return;

      const sourceWidth = Number(canvas.getAttribute('width')) || canvas.width;
      const sourceHeight = Number(canvas.getAttribute('height')) || canvas.height;
      const availableWidth = screen.clientWidth;
      const availableHeight = screen.clientHeight;
      if (!sourceWidth || !sourceHeight || !availableWidth || !availableHeight) return;

      const scale = Math.min(availableWidth / sourceWidth, availableHeight / sourceHeight);
      const width = Math.max(1, Math.floor(sourceWidth * scale));
      const height = Math.max(1, Math.floor(sourceHeight * scale));
      const key = `${sourceWidth}x${sourceHeight}:${availableWidth}x${availableHeight}:${width}x${height}`;
      if (key === lastCanvasKey) return;
      lastCanvasKey = key;

      canvas.style.setProperty('width', `${width}px`, 'important');
      canvas.style.setProperty('height', `${height}px`, 'important');
      canvas.style.setProperty('max-width', '100%', 'important');
      canvas.style.setProperty('max-height', '100%', 'important');
    });
  }

  function syncViewport() {
    cancelAnimationFrame(viewportFrame);
    viewportFrame = requestAnimationFrame(() => {
      const { width, height } = viewportSize();
      const orientation = width >= height ? 'landscape' : 'portrait';
      const keyboardOpen = Boolean(viewport && Math.max(0, window.innerHeight - viewport.height) > 120);
      const viewportKey = `${width}x${height}:${orientation}:${keyboardOpen}`;

      if (viewportKey !== lastViewportKey) {
        lastViewportKey = viewportKey;
        root.style.setProperty('--app-height', `${height}px`);
        root.style.setProperty('--app-width', `${width}px`);
        root.dataset.orientation = orientation;
        root.classList.toggle('coarse-pointer', matchMedia('(pointer: coarse)').matches);
        root.classList.toggle('virtual-keyboard-open', keyboardOpen);
      }

      fitDisplay();
    });
  }

  const screenResizeObserver = screen && typeof ResizeObserver === 'function'
    ? new ResizeObserver(() => fitDisplay())
    : null;
  screenResizeObserver?.observe(screen);

  const canvasMutationObserver = screen && typeof MutationObserver === 'function'
    ? new MutationObserver((mutations) => {
        const displayChanged = mutations.some((mutation) =>
          mutation.type === 'childList' ||
          mutation.attributeName === 'width' ||
          mutation.attributeName === 'height'
        );
        if (!displayChanged) return;
        lastCanvasKey = '';
        fitDisplay();
      })
    : null;

  canvasMutationObserver?.observe(screen, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['width', 'height'],
  });

  window.addEventListener('resize', syncViewport, { passive: true });
  window.addEventListener('orientationchange', syncViewport, { passive: true });
  viewport?.addEventListener('resize', syncViewport, { passive: true });
  viewport?.addEventListener('scroll', syncViewport, { passive: true });
  document.addEventListener('fullscreenchange', syncViewport);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) syncViewport();
  });

  syncViewport();
})();
