(function () {
  if (window.__mobileControlsInit) return;
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

    setupGestureSurfaces();

    function setupGestureSurfaces() {
      const surfaces = Array.from(
        doc.querySelectorAll('[data-gesture-input]')
      );
      if (!surfaces.length) return;

      const pointerStates = new Map();
      const tapMemory = new WeakMap();

      const tipId = '__gesture_tip';
      if (!doc.getElementById(tipId)) {
        const tip = doc.createElement('div');
        tip.id = tipId;
        tip.className = 'gesture-tip';
        tip.textContent = '화면을 탭하거나 스와이프하면 방향키와 액션이 입력됩니다.';
        body.appendChild(tip);
        requestAnimationFrame(() => {
          tip.classList.add('is-visible');
          setTimeout(() => {
            tip.classList.add('is-hidden');
            setTimeout(() => tip.remove(), 320);
          }, 2600);
        });
      }

      function surfaceOptions(surface) {
        const dataset = surface.dataset || {};
        const modes = (dataset.gestureInput || 'arrows')
          .split(/[,\s]+/)
          .map((token) => token.trim())
          .filter(Boolean);
        const baseDeadzone = parseFloat(dataset.gestureDeadzone || '')
          || Math.min(surface.clientWidth, surface.clientHeight) * 0.08;

        return {
          modes,
          tapKey: dataset.gestureTapKey || 'Space',
          doubleTapKey: dataset.gestureDoubleTapKey || dataset.gestureTapKey || 'Space',
          centerDeadZone: baseDeadzone,
        };
      }

      function keyFromPoint(surface, clientX, clientY) {
        const { modes } = surfaceOptions(surface);
        if (!modes.includes('arrows')) return null;
        const rect = surface.getBoundingClientRect();
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const dx = x - centerX;
        const dy = y - centerY;
        const distance = Math.hypot(dx, dy);
        const { centerDeadZone } = surfaceOptions(surface);
        if (distance < centerDeadZone) {
          return null;
        }
        if (Math.abs(dx) > Math.abs(dy)) {
          return dx > 0 ? 'ArrowRight' : 'ArrowLeft';
        }
        return dy > 0 ? 'ArrowDown' : 'ArrowUp';
      }

      function rememberTap(surface, clientX, clientY) {
        const now = performance.now();
        const prev = tapMemory.get(surface);
        const rect = surface.getBoundingClientRect();
        const opts = surfaceOptions(surface);
        const threshold = Math.min(rect.width, rect.height) * 0.18;
        if (prev && now - prev.time < 320) {
          const dist = Math.hypot(prev.x - clientX, prev.y - clientY);
          if (dist < threshold) {
            if (opts.modes.includes('actions')) {
              pressStart(opts.doubleTapKey);
              setTimeout(() => pressEnd(opts.doubleTapKey), 70);
            }
            tapMemory.delete(surface);
            return;
          }
        }
        tapMemory.set(surface, { time: now, x: clientX, y: clientY });
      }

      surfaces.forEach((surface) => {
        if (!surface.hasAttribute('tabindex')) {
          surface.setAttribute('tabindex', '0');
        }

        surface.classList.add('gesture-surface');
        const opts = surfaceOptions(surface);

        const endPointer = (e) => {
          const state = pointerStates.get(e.pointerId);
          if (state) {
            pressEnd(state.key);
            pointerStates.delete(e.pointerId);
          }
          if (e.pointerType === 'touch' || e.pointerType === 'pen') {
            rememberTap(surface, e.clientX, e.clientY);
          }
        };

        surface.addEventListener('pointerdown', (e) => {
          if (e.pointerType === 'mouse' && e.button !== 0) return;
          const key = keyFromPoint(surface, e.clientX, e.clientY);
          if (!key) {
            if (e.pointerType === 'touch' || e.pointerType === 'pen') {
              rememberTap(surface, e.clientX, e.clientY);
            }
            return;
          }
          if (e.pointerType !== 'mouse') e.preventDefault();
          surface.setPointerCapture?.(e.pointerId);
          pointerStates.set(e.pointerId, { key });
          pressStart(key);
        });

        surface.addEventListener('pointermove', (e) => {
          const state = pointerStates.get(e.pointerId);
          if (!state) return;
          const nextKey = keyFromPoint(surface, e.clientX, e.clientY);
          if (!nextKey || nextKey === state.key) {
            return;
          }
          pressEnd(state.key);
          pressStart(nextKey);
          pointerStates.set(e.pointerId, { key: nextKey });
        });

        surface.addEventListener('pointerup', endPointer);
        surface.addEventListener('pointercancel', endPointer);
        surface.addEventListener('lostpointercapture', endPointer);

        surface.addEventListener('click', (e) => {
          if (!opts.modes.includes('actions')) return;
          const primary = opts.tapKey;
          pressStart(primary);
          setTimeout(() => pressEnd(primary), 60);
        });

        surface.addEventListener('wheel', (e) => {
          const absX = Math.abs(e.deltaX);
          const absY = Math.abs(e.deltaY);
          const hasArrows = opts.modes.includes('arrows');
          if (!hasArrows && !opts.modes.includes('actions')) return;
          const key = hasArrows
            ? (absX > absY
              ? (e.deltaX > 0 ? 'ArrowRight' : 'ArrowLeft')
              : (e.deltaY > 0 ? 'ArrowDown' : 'ArrowUp'))
            : opts.tapKey;
          pressStart(key);
          setTimeout(() => pressEnd(key), 60);
          e.preventDefault();
        }, { passive: false });
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
