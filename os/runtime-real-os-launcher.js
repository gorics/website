(function () {
  'use strict';

  if (window.__REAL_OS_LAUNCHER__) return;
  window.__REAL_OS_LAUNCHER__ = true;

  const sitePrefix = location.pathname.startsWith('/website/') ? '/website/' : '/';
  const realOsUrl = sitePrefix + 'os/real-multiboot/';
  const isWindowsPath = /\/os\/window\//.test(location.pathname);
  const label = isWindowsPath ? 'WINDOWS VM' : 'LINUX GUI OS';

  const style = document.createElement('style');
  style.textContent = `
    .real-os-fab{position:fixed;right:16px;bottom:16px;z-index:2147483000;border:0;border-radius:999px;padding:11px 15px;background:linear-gradient(135deg,#2563eb,#06b6d4);color:#fff;font:900 12px/1 system-ui,sans-serif;box-shadow:0 10px 28px rgba(0,0,0,.38);cursor:pointer}
    .real-os-modal{position:fixed;inset:0;z-index:2147483001;display:none;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.64)}
    .real-os-modal.show{display:flex}
    .real-os-card{width:min(520px,96vw);border:1px solid #334155;border-radius:18px;background:#0f172a;color:#e2e8f0;padding:18px;box-shadow:0 18px 70px rgba(0,0,0,.45);font:14px/1.55 system-ui,sans-serif}
    .real-os-card h2{margin:0 0 8px;font-size:20px}
    .real-os-card p{margin:0 0 14px;color:#cbd5e1}
    .real-os-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .real-os-actions a,.real-os-actions button{min-height:42px;border:0;border-radius:12px;padding:10px 12px;text-decoration:none;color:#fff;background:#1d4ed8;font-weight:900;text-align:center;cursor:pointer}
    .real-os-actions button{background:#334155}
    @media(max-width:560px){.real-os-actions{grid-template-columns:1fr}.real-os-fab{right:10px;bottom:10px}}
  `;
  document.head.appendChild(style);

  const fab = document.createElement('button');
  fab.className = 'real-os-fab';
  fab.type = 'button';
  fab.textContent = '🚀 REAL ' + label;

  const modal = document.createElement('div');
  modal.className = 'real-os-modal';
  modal.innerHTML = `
    <div class="real-os-card">
      <h2>GORICS Web Linux GUI OS</h2>
      <p>이 페이지의 실험 UI와 별도로, 중앙 Real Multiboot에서 Linux GUI ISO, Tiny Linux, Buildroot, FreeDOS, Windows 테스트 이미지를 실행합니다.</p>
      <div class="real-os-actions">
        <a href="${realOsUrl}">Real Multiboot 열기</a>
        <button type="button" id="real-os-close">닫기</button>
      </div>
    </div>`;

  document.body.append(fab, modal);

  fab.addEventListener('click', () => modal.classList.add('show'));
  modal.addEventListener('click', (event) => {
    if (event.target === modal) modal.classList.remove('show');
  });
  modal.querySelector('#real-os-close').addEventListener('click', () => modal.classList.remove('show'));
})();