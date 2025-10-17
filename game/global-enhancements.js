(function () {
  const doc = document;
  const head = doc.head || doc.getElementsByTagName('head')[0];
  const body = doc.body;
  if (!body) return;

  const scripts = doc.getElementsByTagName('script');
  const currentScript =
    doc.currentScript ||
    Array.prototype.slice
      .call(scripts)
      .reverse()
      .find((script) => /global-enhancements\.js/.test(script.src || ''));

  const fallbackBase = new URL('../', window.location.href).href;
  const resolveAsset = (file) =>
    currentScript
      ? new URL(file, currentScript.src).href
      : new URL(file, fallbackBase).href;

  const wantsMobileControls =
    body.hasAttribute('data-arcade-game') &&
    body.getAttribute('data-arcade-game') !== 'false';

  if (wantsMobileControls) {
    if (
      head &&
      !doc.querySelector('link[data-mobile-controls], link[href*="mobile-controls.css"]')
    ) {
      const cssLink = doc.createElement('link');
      cssLink.rel = 'stylesheet';
      cssLink.href = resolveAsset('mobile-controls.css');
      cssLink.dataset.mobileControls = 'true';
      head.appendChild(cssLink);
    }

    if (
      !doc.querySelector('script[data-mobile-controls], script[src*="mobile-controls.js"]') &&
      !window.__mobileControlsScriptLoading
    ) {
      window.__mobileControlsScriptLoading = true;
      const scriptEl = doc.createElement('script');
      scriptEl.src = resolveAsset('mobile-controls.js');
      scriptEl.dataset.mobileControls = 'true';
      scriptEl.async = false;
      (body || head).appendChild(scriptEl);
    }
  }

  const style = doc.createElement('style');
  style.textContent = `
    .global-signature {
      position: fixed;
      inset: 18px 18px auto auto;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 14px;
      border-radius: 999px;
      background: rgba(255, 165, 74, 0.9);
      color: #1f1206;
      font-weight: 700;
      font-size: 13px;
      letter-spacing: 0.01em;
      box-shadow: 0 18px 35px rgba(255, 165, 74, 0.35);
      transform: translateY(-12px);
      opacity: 0;
      transition: opacity 0.35s ease, transform 0.35s ease;
      z-index: 9999;
    }
    .global-signature span {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 10px;
      border-radius: 999px;
      background: rgba(0, 0, 0, 0.12);
    }
    .global-signature.visible {
      transform: translateY(0);
      opacity: 1;
    }
    @media (max-width: 640px) {
      .global-signature {
        inset: auto 16px 16px 16px;
        justify-content: center;
        text-align: center;
      }
    }
  `;
  doc.head.appendChild(style);

  if (!doc.querySelector('.signature') && !doc.querySelector('.global-signature')) {
    const badge = doc.createElement('div');
    badge.className = 'global-signature';
    badge.innerHTML = `<span>박은성</span>이 만든 특별한 게임`; 
    body.appendChild(badge);
    requestAnimationFrame(() => badge.classList.add('visible'));
  }

  const computed = window.getComputedStyle(body);
  if (computed.overflow !== 'hidden') {
    const padLeft = parseFloat(computed.paddingLeft);
    const padRight = parseFloat(computed.paddingRight);
    if (padLeft < 12 && padRight < 12) {
      body.style.padding = 'clamp(16px, 5vw, 56px)';
    }
  }

  const wrappers = Array.from(doc.querySelectorAll('.panel, .container, .wrapper, .frame, main, .game-shell, .hud, .board-shell, .playfield, .game-card'));
  const resizeWrappers = () => {
    if (window.innerWidth <= 768) {
      wrappers.forEach(el => {
        if (!el) return;
        if (!el.style.maxWidth) {
          el.style.maxWidth = 'min(100%, 720px)';
        }
        if (!el.style.width) {
          el.style.width = 'min(100%, 720px)';
        }
        if (!el.style.marginLeft) {
          el.style.marginLeft = 'auto';
          el.style.marginRight = 'auto';
        }
        if (!el.style.boxSizing) {
          el.style.boxSizing = 'border-box';
        }
      });
    } else {
      wrappers.forEach(el => {
        if (!el) return;
        el.style.removeProperty('max-width');
        el.style.removeProperty('width');
        el.style.removeProperty('margin-left');
        el.style.removeProperty('margin-right');
      });
    }
  };

  const adjustCanvases = () => {
    const canvases = doc.querySelectorAll('canvas');
    canvases.forEach(canvas => {
      if (window.innerWidth <= 768) {
        canvas.style.width = '100%';
        canvas.style.height = 'auto';
      } else {
        canvas.style.removeProperty('width');
        canvas.style.removeProperty('height');
      }
    });
  };

  resizeWrappers();
  adjustCanvases();
  window.addEventListener('resize', () => {
    resizeWrappers();
    adjustCanvases();
  });
})();
