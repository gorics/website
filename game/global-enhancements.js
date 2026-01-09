(function () {
  if (window.__globalEnhancementsApplied) return;
  window.__globalEnhancementsApplied = true;

  const doc = document;
  const head = doc.head || doc.getElementsByTagName('head')[0];
  const body = doc.body;
  if (!body) return;

  const ensureViewport = () => {
    if (!head) return;
    const requiredEntries = [
      ['width', 'width=device-width'],
      ['initial-scale', 'initial-scale=1'],
      ['maximum-scale', 'maximum-scale=1'],
      ['viewport-fit', 'viewport-fit=cover'],
    ];

    let viewport = doc.querySelector('meta[name="viewport"]');
    if (!viewport) {
      viewport = doc.createElement('meta');
      viewport.name = 'viewport';
      viewport.content = requiredEntries.map(([, value]) => value).join(', ');
      head.insertBefore(viewport, head.firstChild || null);
      return;
    }

    const tokens = viewport.content
      .split(',')
      .map((token) => token.trim())
      .filter(Boolean);

    const requiredMap = new Map(
      requiredEntries.map(([key, value]) => [key.toLowerCase(), value])
    );

    const normalized = [];
    const seen = new Set();

    tokens.forEach((token) => {
      const trimmedToken = token.trim();
      if (!trimmedToken) return;
      const eqIndex = trimmedToken.indexOf('=');
      if (eqIndex !== -1) {
        const rawKey = trimmedToken.slice(0, eqIndex).trim();
        const rawValue = trimmedToken.slice(eqIndex + 1).trim();
        const normalizedKey = rawKey.toLowerCase();
        const requiredValue = requiredMap.get(normalizedKey);
        if (requiredValue) {
          const normalizedRequired = requiredValue.toLowerCase();
          const normalizedToken = `${normalizedKey}=${rawValue}`.toLowerCase();
          if (normalizedToken === normalizedRequired && !seen.has(requiredValue)) {
            normalized.push(requiredValue);
            seen.add(requiredValue);
          }
          return;
        }
      }

      if (!seen.has(trimmedToken)) {
        normalized.push(trimmedToken);
        seen.add(trimmedToken);
      }
    });

    requiredEntries.forEach(([, value]) => {
      if (!seen.has(value)) {
        normalized.push(value);
        seen.add(value);
      }
    });

    viewport.content = normalized.join(', ');
  };

  ensureViewport();

  const rawAttr = body.getAttribute('data-arcade-game');
  const attr = rawAttr ? rawAttr.trim().toLowerCase() : null;
  const path = window.location.pathname.replace(/index\.html$/, '');
  const inGameDir = /\/game\//.test(path);
  const looksLikeHub = /\/game\/?$/.test(path);
  const looksLikeGameRoute = inGameDir && !looksLikeHub;
  const attrExplicitOff = attr === 'false' || attr === 'off' || attr === 'hub';
  const attrExplicitOn = attr === 'true' || attr === 'on';
  const wantsMobileControls =
    !attrExplicitOff && (attrExplicitOn || (!attr && looksLikeGameRoute));

  if (wantsMobileControls && !attrExplicitOn) {
    body.setAttribute('data-arcade-game', 'true');
  } else if (!wantsMobileControls && attr && attr !== 'false') {
    body.removeAttribute('data-arcade-game');
  }

  const scripts = doc.getElementsByTagName('script');
  const currentScript =
    doc.currentScript ||
    Array.prototype.slice
      .call(scripts)
      .reverse()
      .find((script) => /global-enhancements\.js/.test(script.src || ''));

  const declaredBase = currentScript?.getAttribute('data-asset-base');
  const fallbackBase = new URL('../', window.location.href).href;
  const assetBase = (() => {
    if (declaredBase) return new URL(declaredBase, window.location.href).href;
    if (currentScript?.src) return new URL('./', currentScript.src).href;
    return fallbackBase;
  })();

  const resolveAsset = (file) => new URL(file, assetBase).href;

  const cleanupMobileControls = () => {
    const credit = doc.querySelector('.credit-banner');
    if (credit && credit.parentNode) {
      credit.parentNode.removeChild(credit);
    }
    const wrap = doc.getElementById('osc-wrap');
    if (wrap && wrap.parentNode) {
      wrap.parentNode.removeChild(wrap);
    }
  };

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

    body.classList.add('has-mobile-controls');
  } else {
    cleanupMobileControls();
    body.classList.remove('has-mobile-controls');
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
