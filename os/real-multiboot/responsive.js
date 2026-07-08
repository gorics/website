(() => {
  'use strict';

  const root = document.documentElement;
  const screen = document.querySelector('#screen');
  const viewport = window.visualViewport;
  let frame = 0;

  function syncViewport() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const height = Math.round(viewport?.height || window.innerHeight || root.clientHeight);
      const width = Math.round(viewport?.width || window.innerWidth || root.clientWidth);
      root.style.setProperty('--app-height', `${height}px`);
      root.style.setProperty('--app-width', `${width}px`);
      root.dataset.orientation = width >= height ? 'landscape' : 'portrait';
      root.classList.toggle('coarse-pointer', matchMedia('(pointer: coarse)').matches);
      fitDisplay();
    });
  }

  function fitDisplay() {
    if (!screen) return;
    const canvas = screen.querySelector('canvas');
    if (!canvas || canvas.hidden || getComputedStyle(canvas).display === 'none') return;

    const sourceWidth = Number(canvas.getAttribute('width')) || canvas.width;
    const sourceHeight = Number(canvas.getAttribute('height')) || canvas.height;
    const availableWidth = screen.clientWidth;
    const availableHeight = screen.clientHeight;
    if (!sourceWidth || !sourceHeight || !availableWidth || !availableHeight) return;

    const scale = Math.min(availableWidth / sourceWidth, availableHeight / sourceHeight);
    const nextWidth = `${Math.max(1, Math.floor(sourceWidth * scale))}px`;
    const nextHeight = `${Math.max(1, Math.floor(sourceHeight * scale))}px`;
    if (canvas.style.width !== nextWidth) canvas.style.width = nextWidth;
    if (canvas.style.height !== nextHeight) canvas.style.height = nextHeight;
  }

  const resizeObserver = typeof ResizeObserver === 'function'
    ? new ResizeObserver(syncViewport)
    : null;
  if (screen) resizeObserver?.observe(screen);

  const mutationObserver = screen && typeof MutationObserver === 'function'
    ? new MutationObserver(syncViewport)
    : null;
  mutationObserver?.observe(screen, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['width', 'height', 'style', 'class'],
  });

  window.addEventListener('resize', syncViewport, { passive: true });
  window.addEventListener('orientationchange', syncViewport, { passive: true });
  viewport?.addEventListener('resize', syncViewport, { passive: true });
  viewport?.addEventListener('scroll', syncViewport, { passive: true });
  document.addEventListener('fullscreenchange', syncViewport);

  syncViewport();
})();
