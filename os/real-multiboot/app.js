(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const bootScreen = $('#boot-screen');
  const bootLine = $('#boot-line');
  const launcher = $('#launcher');
  const launcherToggle = $('#launcher-toggle');
  const launcherGrid = $('#launcher-grid');
  const appSearch = $('#app-search');
  const windowLayer = $('#window-layer');
  const windowCount = $('#window-count');
  const clockEl = $('#clock');
  const networkPill = $('#network-pill');
  const toastEl = $('#toast');

  const storageKey = (key) => `gorics.gui.os.${key}`;
  const loadJson = (key, fallback) => {
    try {
      const raw = localStorage.getItem(storageKey(key));
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  };
  const saveJson = (key, value) => {
    try { localStorage.setItem(storageKey(key), JSON.stringify(value)); } catch (_) {}
  };
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const bytes = (text) => new Blob([String(text ?? '')]).size;
  const fmt = (n) => n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

  let zIndex = 40;
  const openWindows = new Map();
  let files = loadJson('files', {
    'home/readme.txt': 'GORICS GUI OS 정상 작동.\n\n브라우저, 터미널, 파일, 메모, 계산기, 수능 학습 패널, 실제 VM 링크를 포함합니다.',
    'study/2027-csat.txt': '선택 과목: 화법과 작문 / 미적분 / 사회문화 / 한국지리\n오늘 목표: 한 과목이라도 첫 문제를 바로 푼다.',
    'system/about.txt': 'GitHub Pages 위에서 즉시 실행되는 반응형 GUI OS 셸입니다.'
  });
  let notes = loadJson('notes', '메모 자동 저장 활성화.\n필요한 내용을 바로 적어라.');

  function toast(message) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.add('show');
    clearTimeout(toastEl._timer);
    toastEl._timer = setTimeout(() => toastEl.classList.remove('show'), 1900);
  }

  function tickClock() {
    if (clockEl) {
      clockEl.textContent = new Intl.DateTimeFormat('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }).format(new Date());
    }
    if (networkPill) networkPill.textContent = navigator.onLine ? '● ONLINE' : '● OFFLINE';
  }

  function updateWindowCount() {
    if (windowCount) windowCount.textContent = String(openWindows.size);
  }

  function focusWindow(win) {
    $$('.window').forEach((item) => item.classList.remove('active'));
    win.classList.add('active');
    win.style.zIndex = String(++zIndex);
  }

  function closeWindow(id) {
    const win = openWindows.get(id);
    if (!win) return;
    win.remove();
    openWindows.delete(id);
    updateWindowCount();
  }

  function makeWindow(app, contentNode, options = {}) {
    const existing = openWindows.get(app.id);
    if (existing) {
      existing.classList.remove('minimized');
      focusWindow(existing);
      return existing;
    }

    const win = document.createElement('article');
    win.className = 'window active';
    win.dataset.app = app.id;
    win.style.zIndex = String(++zIndex);
    const offset = (openWindows.size % 7) * 28;
    win.style.left = `${Math.min(132 + offset, Math.max(12, innerWidth - 380))}px`;
    win.style.top = `${Math.min(88 + offset, Math.max(12, innerHeight - 260))}px`;
    if (options.width) win.style.width = options.width;
    if (options.height) win.style.height = options.height;

    win.innerHTML = `
      <div class="window-titlebar">
        <div class="window-title"><span>${app.icon}</span><b>${esc(app.name)}</b><em>${esc(app.desc || '')}</em></div>
        <div class="window-controls">
          <button type="button" data-win="min" title="minimize">—</button>
          <button type="button" data-win="max" title="maximize">□</button>
          <button type="button" data-win="close" title="close">×</button>
        </div>
      </div>
      <div class="window-body"></div>
    `;
    $('.window-body', win).append(contentNode);
    windowLayer.appendChild(win);
    openWindows.set(app.id, win);
    updateWindowCount();
    focusWindow(win);

    win.addEventListener('pointerdown', () => focusWindow(win));
    $('[data-win="close"]', win).addEventListener('click', () => closeWindow(app.id));
    $('[data-win="min"]', win).addEventListener('click', () => win.classList.add('minimized'));
    $('[data-win="max"]', win).addEventListener('click', () => {
      win.classList.toggle('maximized');
      focusWindow(win);
    });
    enableDrag(win, $('.window-titlebar', win));
    return win;
  }

  function enableDrag(win, handle) {
    let drag = null;
    handle.addEventListener('pointerdown', (event) => {
      if (event.target.closest('button') || win.classList.contains('maximized')) return;
      drag = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        left: parseFloat(win.style.left || '0'),
        top: parseFloat(win.style.top || '0')
      };
      handle.setPointerCapture(event.pointerId);
    });
    handle.addEventListener('pointermove', (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      const left = Math.max(0, Math.min(innerWidth - 80, drag.left + event.clientX - drag.x));
      const top = Math.max(0, Math.min(innerHeight - 80, drag.top + event.clientY - drag.y));
      win.style.left = `${left}px`;
      win.style.top = `${top}px`;
    });
    handle.addEventListener('pointerup', () => { drag = null; });
  }

  function openEditor(path) {
    const area = document.createElement('div');
    area.className = 'pane';
    area.innerHTML = `<textarea class="notes" spellcheck="false"></textarea><div class="note-status"></div>`;
    const textarea = $('textarea', area);
    const status = $('.note-status', area);
    textarea.value = files[path] || '';
    textarea.addEventListener('input', () => {
      files[path] = textarea.value;
      saveJson('files', files);
      status.textContent = `저장됨 · ${fmt(bytes(textarea.value))}`;
    });
    status.textContent = `열림 · ${path}`;
    makeWindow({ id: `edit:${path}`, icon: '📄', name: path.split('/').pop(), desc: path }, area, { width: 'min(680px, calc(100vw - 24px))' });
  }

  function openFiles() {
    const body = document.createElement('div');
    body.className = 'pane file-layout';
    body.innerHTML = `
      <div class="sidebar-list">
        <button class="on" type="button">Home</button>
        <button type="button">Study</button>
        <button type="button">System</button>
        <button id="new-file" type="button">+ New</button>
      </div>
      <div class="file-grid"></div>
    `;
    const grid = $('.file-grid', body);
    const render = () => {
      grid.innerHTML = '';
      Object.entries(files).sort(([a], [b]) => a.localeCompare(b)).forEach(([path, value]) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.innerHTML = `<span>📄</span><b>${esc(path.split('/').pop())}</b><small>${esc(path)} · ${fmt(bytes(value))}</small>`;
        btn.addEventListener('click', () => openEditor(path));
        grid.appendChild(btn);
      });
    };
    $('#new-file', body).addEventListener('click', () => {
      const name = prompt('파일 이름', `home/new-${Date.now()}.txt`);
      if (!name) return;
      files[name] = '';
      saveJson('files', files);
      render();
      openEditor(name);
    });
    render();
    makeWindow(appMap.get('files'), body, { width: 'min(780px, calc(100vw - 24px))' });
  }

  function normalizeUrl(url) {
    const text = String(url || '').trim();
    if (!text) return 'https://gorics.github.io/website/';
    if (/^https?:\/\//i.test(text)) return text;
    if (/^[\w.-]+\.[a-z]{2,}/i.test(text)) return `https://${text}`;
    return `https://www.google.com/search?q=${encodeURIComponent(text)}`;
  }

  function openBrowser() {
    const body = document.createElement('div');
    body.className = 'pane';
    body.innerHTML = `
      <div class="browser-bar">
        <input value="https://gorics.github.io/website/" aria-label="url" />
        <button type="button" data-go>GO</button>
        <button type="button" data-new>↗</button>
      </div>
      <iframe class="browser-frame" title="browser" referrerpolicy="no-referrer"></iframe>
    `;
    const input = $('input', body);
    const frame = $('iframe', body);
    const go = () => {
      const url = normalizeUrl(input.value);
      input.value = url;
      frame.src = url;
      toast('브라우저 이동');
    };
    $('[data-go]', body).addEventListener('click', go);
    $('[data-new]', body).addEventListener('click', () => open(normalizeUrl(input.value), '_blank', 'noopener'));
    input.addEventListener('keydown', (event) => { if (event.key === 'Enter') go(); });
    makeWindow(appMap.get('browser'), body, { width: 'min(900px, calc(100vw - 24px))', height: 'min(650px, calc(100svh - 166px))' });
    go();
  }

  function openTerminal() {
    const body = document.createElement('div');
    body.className = 'terminal';
    body.innerHTML = `
      <div class="terminal-output"></div>
      <label class="terminal-input"><span class="prompt">gorics@os:~$</span><input autocomplete="off" /></label>
    `;
    const out = $('.terminal-output', body);
    const input = $('input', body);
    const print = (text = '') => {
      out.innerHTML += `${esc(text)}\n`;
      out.scrollTop = out.scrollHeight;
    };
    const commands = {
      help: () => 'help, apps, open [app], files, date, echo [text], storage, theme, clear',
      apps: () => appList.map((app) => `${app.id.padEnd(8)} ${app.name}`).join('\n'),
      files: () => Object.keys(files).join('\n'),
      date: () => new Date().toString(),
      storage: () => `files=${Object.keys(files).length}, notes=${fmt(bytes(notes))}, windows=${openWindows.size}`,
      theme: () => {
        document.body.dataset.theme = document.body.dataset.theme === 'light' ? '' : 'light';
        return `theme=${document.body.dataset.theme || 'dark'}`;
      }
    };
    const run = (line) => {
      print(`gorics@os:~$ ${line}`);
      const [cmd, ...args] = line.trim().split(/\s+/);
      if (!cmd) return;
      if (cmd === 'clear') { out.textContent = ''; return; }
      if (cmd === 'echo') { print(args.join(' ')); return; }
      if (cmd === 'open') {
        const target = args[0];
        const app = appMap.get(target);
        if (app) { app.open(); print(`opened ${target}`); } else print(`app not found: ${target}`);
        return;
      }
      print(commands[cmd] ? commands[cmd](args) : `unknown command: ${cmd}`);
    };
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      const line = input.value;
      input.value = '';
      run(line);
    });
    makeWindow(appMap.get('terminal'), body, { width: 'min(760px, calc(100vw - 24px))' });
    print('GORICS Terminal ready. type: help');
    setTimeout(() => input.focus(), 50);
  }

  function openNotes() {
    const body = document.createElement('div');
    body.className = 'pane';
    body.innerHTML = `<textarea class="notes" spellcheck="false"></textarea><div class="note-status">자동 저장 대기</div>`;
    const area = $('textarea', body);
    const status = $('.note-status', body);
    area.value = notes;
    area.addEventListener('input', () => {
      notes = area.value;
      saveJson('notes', notes);
      status.textContent = `자동 저장됨 · ${fmt(bytes(notes))}`;
    });
    makeWindow(appMap.get('notes'), body, { width: 'min(680px, calc(100vw - 24px))' });
  }

  function openCalc() {
    const body = document.createElement('div');
    body.className = 'pane';
    body.innerHTML = `<div class="calc"><input readonly value="0" /><div class="calc-grid"></div></div>`;
    const display = $('input', body);
    const grid = $('.calc-grid', body);
    let expr = '';
    const keys = ['7','8','9','/','4','5','6','*','1','2','3','-','0','.','=','+','C','(',')','%'];
    keys.forEach((key) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = key;
      btn.addEventListener('click', () => {
        if (key === 'C') expr = '';
        else if (key === '=') {
          try {
            if (!/^[0-9+\-*/().%\s]+$/.test(expr)) throw new Error('bad expression');
            expr = String(Function(`"use strict"; return (${expr || 0})`)());
          } catch (_) { expr = 'Error'; }
        } else {
          if (expr === 'Error') expr = '';
          expr += key;
        }
        display.value = expr || '0';
      });
      grid.appendChild(btn);
    });
    makeWindow(appMap.get('calc'), body, { width: '390px', height: '500px' });
  }

  function openStudy() {
    const body = document.createElement('div');
    body.className = 'pane study-board';
    body.innerHTML = `
      <h2>2027 수능 대시보드</h2>
      <p>재수생 기준으로 오늘 할 행동만 남기는 학습 패널.</p>
      <div class="subject-list">
        <label><input type="checkbox"><span>화법과 작문</span><small>비문학 1지문 + 화작 세트</small></label>
        <label><input type="checkbox"><span>미적분</span><small>킬러보다 기본 계산 안정화</small></label>
        <label><input type="checkbox"><span>사회문화</span><small>도표 2문항 오답 제거</small></label>
        <label><input type="checkbox"><span>한국지리</span><small>지역·기후·인구 개념 압축</small></label>
      </div>
      <button type="button" data-open="notes">오늘 계획을 Notes에 적기</button>
    `;
    makeWindow(appMap.get('study'), body, { width: 'min(640px, calc(100vw - 24px))' });
  }

  function openSystem() {
    const body = document.createElement('div');
    body.className = 'pane';
    body.innerHTML = `
      <div class="system-grid">
        <div><b>OS</b><span>GORICS GUI OS custom shell</span></div>
        <div><b>Runtime</b><span>HTML/CSS/JS · GitHub Pages</span></div>
        <div><b>Storage</b><span>localStorage · ${Object.keys(files).length} files</span></div>
        <div><b>Network</b><span>${navigator.onLine ? 'online' : 'offline'}</span></div>
        <div><b>Viewport</b><span>${innerWidth} × ${innerHeight}</span></div>
        <div><b>VM</b><span>v86/ISO 옵션은 VM 패널에서 실행</span></div>
      </div>
      <div class="settings-row">
        <button type="button" data-theme>테마 전환</button>
        <button type="button" data-open="vm">실제 VM 열기</button>
        <button type="button" data-reset>레이아웃 리셋</button>
      </div>
    `;
    $('[data-theme]', body).addEventListener('click', () => {
      document.body.dataset.theme = document.body.dataset.theme === 'light' ? '' : 'light';
      toast(`테마: ${document.body.dataset.theme || 'dark'}`);
    });
    $('[data-reset]', body).addEventListener('click', () => {
      $$('.window').forEach((win, i) => {
        win.classList.remove('maximized', 'minimized');
        win.style.left = `${24 + i * 24}px`;
        win.style.top = `${76 + i * 24}px`;
      });
      toast('창 위치 리셋');
    });
    makeWindow(appMap.get('system'), body, { width: 'min(720px, calc(100vw - 24px))' });
  }

  function openVm() {
    const body = document.createElement('div');
    body.className = 'pane study-board';
    body.innerHTML = `
      <h2>Real Linux / VM Boot</h2>
      <p>메인은 자체 GUI OS로 즉시 실행하고, 실제 x86 Linux ISO/VM 부팅은 아래에서 분리 실행합니다.</p>
      <div class="subject-list">
        <label><span>GORICS WebBoot</span><small>내장 ISO/직접 커널 부팅 페이지</small></label>
        <label><span>DSL Linux GUI</span><small>공식 v86 GUI 프로필</small></label>
        <label><span>Safe Buildroot</span><small>가벼운 Linux 부팅 확인</small></label>
      </div>
      <div class="settings-row">
        <button type="button" data-url="../quantum-real/">GORICS WebBoot</button>
        <button type="button" data-url="https://copy.sh/v86/?profile=dsl">DSL GUI 원본</button>
        <button type="button" data-url="https://copy.sh/v86/?profile=buildroot">Safe Linux 원본</button>
      </div>
    `;
    $$('[data-url]', body).forEach((btn) => btn.addEventListener('click', () => open(btn.dataset.url, '_blank', 'noopener')));
    makeWindow(appMap.get('vm'), body, { width: 'min(690px, calc(100vw - 24px))' });
  }

  const appList = [
    { id: 'files', icon: '🗂️', name: 'Files', desc: '로컬 파일 관리자', open: openFiles },
    { id: 'browser', icon: '🌐', name: 'Browser', desc: '웹 탐색 / iframe 브라우저', open: openBrowser },
    { id: 'terminal', icon: '⌨️', name: 'Terminal', desc: '명령 실행 셸', open: openTerminal },
    { id: 'notes', icon: '📝', name: 'Notes', desc: '자동 저장 메모', open: openNotes },
    { id: 'calc', icon: '🧮', name: 'Calculator', desc: '계산기', open: openCalc },
    { id: 'study', icon: '📚', name: 'Study', desc: '수능 학습 패널', open: openStudy },
    { id: 'system', icon: '⚙️', name: 'System', desc: '설정 / 상태', open: openSystem },
    { id: 'vm', icon: '🖥️', name: 'Real VM', desc: 'Linux ISO/v86 부팅 옵션', open: openVm }
  ];
  const appMap = new Map(appList.map((app) => [app.id, app]));

  function renderLauncher(filter = '') {
    if (!launcherGrid) return;
    const term = filter.trim().toLowerCase();
    launcherGrid.innerHTML = '';
    appList
      .filter((app) => !term || `${app.id} ${app.name} ${app.desc}`.toLowerCase().includes(term))
      .forEach((app) => {
        const btn = document.createElement('button');
        btn.className = 'launcher-app';
        btn.type = 'button';
        btn.dataset.open = app.id;
        btn.innerHTML = `<span>${app.icon}</span><b>${esc(app.name)}</b><small>${esc(app.desc)}</small>`;
        launcherGrid.appendChild(btn);
      });
  }

  function toggleLauncher(force) {
    if (!launcher) return;
    launcher.classList.toggle('open', typeof force === 'boolean' ? force : !launcher.classList.contains('open'));
    if (launcher.classList.contains('open')) {
      renderLauncher(appSearch ? appSearch.value : '');
      setTimeout(() => appSearch && appSearch.focus(), 40);
    }
  }

  function boot() {
    const lines = ['kernel shell loading...', 'mounting localStorage...', 'starting window manager...', 'GORICS GUI OS ready'];
    lines.forEach((line, i) => setTimeout(() => { if (bootLine) bootLine.textContent = line; }, i * 260));
    setTimeout(() => bootScreen && bootScreen.classList.add('hidden'), 1180);
    tickClock();
    setInterval(tickClock, 1000);
    renderLauncher();
    toast('GORICS GUI OS 부팅 완료');
  }

  document.addEventListener('click', (event) => {
    const opener = event.target.closest('[data-open]');
    if (!opener) return;
    const id = opener.dataset.open;
    if (id === 'launcher') { toggleLauncher(); return; }
    const app = appMap.get(id);
    if (app) {
      app.open();
      toggleLauncher(false);
    }
  });
  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      toggleLauncher(true);
    }
    if (event.key === 'Escape') toggleLauncher(false);
  });
  window.addEventListener('online', tickClock);
  window.addEventListener('offline', tickClock);
  if (launcherToggle) launcherToggle.addEventListener('click', () => toggleLauncher());
  if (appSearch) appSearch.addEventListener('input', () => renderLauncher(appSearch.value));

  boot();
})();
