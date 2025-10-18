(function () {
  if (window.__mobileControlsInit) return;

  const doc = document;
  const html = doc.documentElement;
  const body = doc.body;
  const attrSource = (node, name) =>
    node && node.hasAttribute(name)
      ? node.getAttribute(name)
      : null;

  const controlsPref =
    (attrSource(body, 'data-mobile-controls') || attrSource(html, 'data-mobile-controls') || '')
      .toLowerCase()
      .trim();

  if (controlsPref === 'false' || controlsPref === 'off') {
    return;
  }

  window.__mobileControlsInit = true;

  function init() {
    const doc = document;
    const body = doc.body;
    if (!body) return;

    let credit = doc.querySelector('.credit-banner');
    if (!credit) {
      credit = doc.createElement('div');
      credit.className = 'credit-banner';
      credit.setAttribute('aria-hidden', 'true');
      credit.textContent = 'Creator: 박은성';
    }

    let wrap = doc.getElementById('osc-wrap');
    if (!wrap) {
      wrap = doc.createElement('div');
      wrap.id = 'osc-wrap';
      wrap.className = 'osc-wrap';
      wrap.setAttribute('role', 'group');
      wrap.setAttribute('aria-label', 'On-screen game controls');
      wrap.innerHTML = `
        <div class="osc">
          <div class="dpad">
            <button type="button" data-key="ArrowUp" aria-label="Up" style="grid-area:up">▲</button>
            <button type="button" data-key="ArrowLeft" aria-label="Left" style="grid-area:left">◀</button>
            <button type="button" data-key="ArrowRight" aria-label="Right" style="grid-area:right">▶</button>
            <button type="button" data-key="ArrowDown" aria-label="Down" style="grid-area:down">▼</button>
          </div>
          <div class="actions">
            <button type="button" data-key="Space" aria-label="Primary action">A</button>
            <button type="button" data-key="Enter" aria-label="Secondary action">B</button>
            <button type="button" class="pause" data-key="Escape" aria-label="Pause or resume">⏯︎</button>
          </div>
        </div>`;
    }

    if (!credit.isConnected) body.appendChild(credit);
    if (!wrap.isConnected) body.appendChild(wrap);

    requestAnimationFrame(() => wrap.classList.add('is-active'));

    const activeTouches = new Map();

    function send(key, type) {
      const ev = new KeyboardEvent(type, { key, code: key, bubbles: true, cancelable: true });
      const activeEl = doc.activeElement && doc.activeElement !== doc.body ? doc.activeElement : doc;
      activeEl.dispatchEvent(ev);
      window.dispatchEvent(ev);
    }

    function pressStart(key) {
      send(key, 'keydown');
    }

    function pressEnd(key) {
      send(key, 'keyup');
    }

    if ('PointerEvent' in window) {
      wrap.addEventListener('pointerdown', (e) => {
        const btn = e.target.closest('button[data-key]');
        if (!btn) return;
        e.preventDefault();
        const key = btn.dataset.key;
        btn.classList.add('is-pressed');
        pressStart(key);
        btn.setPointerCapture?.(e.pointerId);
        const finish = () => {
          pressEnd(key);
          btn.classList.remove('is-pressed');
        };
        btn.addEventListener('pointerup', finish, { once: true });
        btn.addEventListener('pointercancel', finish, { once: true });
        btn.addEventListener('lostpointercapture', finish, { once: true });
      });
    } else {
      const endTouch = (touch) => {
        const entry = activeTouches.get(touch.identifier);
        if (!entry) return;
        activeTouches.delete(touch.identifier);
        entry.btn?.classList.remove('is-pressed');
        pressEnd(entry.key);
      };
      wrap.addEventListener('touchstart', (e) => {
        for (const touch of Array.from(e.changedTouches)) {
          const el = doc.elementFromPoint(touch.clientX, touch.clientY);
          const btn = el && el.closest('button[data-key]');
          if (!btn) continue;
          e.preventDefault();
          const key = btn.dataset.key;
          activeTouches.set(touch.identifier, { key, btn });
          btn.classList.add('is-pressed');
          pressStart(key);
        }
      }, { passive: false });
      wrap.addEventListener('touchend', (e) => {
        for (const touch of Array.from(e.changedTouches)) endTouch(touch);
      });
      wrap.addEventListener('touchcancel', (e) => {
        for (const touch of Array.from(e.changedTouches)) endTouch(touch);
      });
    }

    wrap.addEventListener('contextmenu', (e) => {
      if (e.target.closest('button[data-key]')) e.preventDefault();
    });

    if (!window.__mobileControlsSwipeBound) {
      window.__mobileControlsSwipeBound = true;
      let sx = 0;
      let sy = 0;
      let tracking = false;
      const TH = 24;

      doc.addEventListener('touchstart', (e) => {
        if (e.target.closest('#osc-wrap')) return;
        tracking = true;
        const t = e.changedTouches[0];
        sx = t.clientX;
        sy = t.clientY;
      }, { passive: true });

      doc.addEventListener('touchend', (e) => {
        if (!tracking) return;
        tracking = false;
        const t = e.changedTouches[0];
        const dx = t.clientX - sx;
        const dy = t.clientY - sy;
        if (Math.abs(dx) < TH && Math.abs(dy) < TH) return;
        const key = Math.abs(dx) > Math.abs(dy)
          ? (dx > 0 ? 'ArrowRight' : 'ArrowLeft')
          : (dy > 0 ? 'ArrowDown' : 'ArrowUp');
        pressStart(key);
        setTimeout(() => pressEnd(key), 50);
      }, { passive: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
