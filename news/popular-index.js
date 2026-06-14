(() => {
  const SOURCES = ['./latest-20260613-2135.json', './latest.json', './data.json'];
  const $ = (selector) => document.querySelector(selector);
  const grid = $('#grid');
  const tabs = $('#tabs');
  const q = $('#q');
  const sort = $('#sort');
  const state = $('#state');
  const rank = $('#rank');
  let items = [];
  let current = 'all';

  const src = (item) => (typeof item.source === 'object' ? item.source.name || '원문' : item.source || '원문');
  const dateValue = (item) => item.publishedAt || item.date || item.published_at || item.pubDate || '';
  const scoreValue = (item) => Number(item.score ?? item.priority ?? item.hotScore ?? 0) || 0;
  const when = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  };
  const safeUrl = (value) => {
    try {
      const url = new URL(value, location.href);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : '#';
    } catch {
      return '#';
    }
  };

  function flatten(payload) {
    if (!payload) return [];
    const result = [];
    ['allItems', 'items', 'posts', 'news'].forEach((key) => {
      if (Array.isArray(payload[key])) result.push(...payload[key]);
    });
    if (payload.byCategory && typeof payload.byCategory === 'object') {
      Object.values(payload.byCategory).forEach((value) => {
        if (Array.isArray(value)) result.push(...value);
      });
    }
    return result;
  }

  function normalize(item, index) {
    return {
      id: item.id || `news-${index}`,
      category: item.category || item.theme || 'news',
      categoryName: item.categoryName || item.category_ko || item.themeName || item.theme || item.category || '뉴스',
      categoryIcon: item.categoryIcon || item.icon || '📰',
      title: item.title || item.name || '',
      description: item.description || item.summary || item.contentSnippet || '',
      url: item.url || item.link || '',
      source: item.source || '원문',
      publishedAt: dateValue(item),
      score: scoreValue(item),
      tags: Array.isArray(item.tags) ? item.tags : [],
    };
  }

  function dedupe(list) {
    const urls = new Set();
    const titles = new Set();
    const output = [];
    list.map(normalize).forEach((item) => {
      if (!item.title || !item.url) return;
      const urlKey = item.url.toLowerCase().replace(/\/$/, '');
      const titleKey = `${item.title}|${src(item)}`.toLowerCase().replace(/\s+/g, ' ');
      if (urls.has(urlKey) || titles.has(titleKey)) return;
      urls.add(urlKey);
      titles.add(titleKey);
      output.push(item);
    });
    return output;
  }

  function sortedItems() {
    return [...items].sort(
      sort.value === 'latest'
        ? (a, b) => new Date(b.publishedAt) - new Date(a.publishedAt) || b.score - a.score
        : (a, b) => b.score - a.score || new Date(b.publishedAt) - new Date(a.publishedAt)
    );
  }

  function createExternalLink(href, text, className) {
    const link = document.createElement('a');
    link.href = safeUrl(href);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = text;
    if (className) link.className = className;
    return link;
  }

  function renderCard(item) {
    const article = document.createElement('article');
    article.className = 'card';

    const meta = document.createElement('div');
    meta.className = 'meta';
    const category = document.createElement('span');
    category.textContent = `${item.categoryIcon} ${item.categoryName}`;
    const score = document.createElement('b');
    score.textContent = `HOT ${item.score}`;
    meta.append(category, score);

    const title = document.createElement('h2');
    title.append(createExternalLink(item.url, item.title));

    const description = document.createElement('p');
    description.className = 'muted';
    description.textContent = item.description || '요약 없음';

    const source = document.createElement('p');
    source.className = 'muted';
    source.textContent = `${src(item)} · ${when(item.publishedAt)}`;

    article.append(meta, title, description, source);
    return article;
  }

  function renderRank() {
    rank.replaceChildren();
    const top = [...items]
      .sort((a, b) => b.score - a.score || new Date(b.publishedAt) - new Date(a.publishedAt))
      .slice(0, 10);
    if (!top.length) {
      const empty = document.createElement('li');
      const mark = document.createElement('b');
      mark.textContent = '!';
      const text = document.createElement('span');
      text.textContent = '뉴스 없음';
      empty.append(mark, text);
      rank.append(empty);
      return;
    }
    top.forEach((item, index) => {
      const li = document.createElement('li');
      const num = document.createElement('b');
      num.textContent = String(index + 1);
      const body = document.createElement('span');
      const link = createExternalLink(item.url, item.title);
      const meta = document.createElement('small');
      meta.textContent = `${src(item)} · HOT ${item.score} · ${item.categoryName}`;
      body.append(link, meta);
      li.append(num, body);
      rank.append(li);
    });
  }

  function renderTabs() {
    tabs.replaceChildren();
    const all = document.createElement('button');
    all.type = 'button';
    all.className = 'tab on';
    all.dataset.category = 'all';
    all.textContent = `전체 ${items.length}`;
    tabs.append(all);

    const counts = new Map();
    const labels = new Map();
    items.forEach((item) => {
      counts.set(item.category, (counts.get(item.category) || 0) + 1);
      labels.set(item.category, `${item.categoryIcon} ${item.categoryName}`);
    });
    [...counts]
      .sort((a, b) => b[1] - a[1])
      .forEach(([category, count]) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'tab';
        button.dataset.category = category;
        button.textContent = `${labels.get(category) || category} ${count}`;
        tabs.append(button);
      });
  }

  function render() {
    const query = q.value.toLowerCase().trim();
    const list = sortedItems().filter((item) => {
      const haystack = `${item.title} ${item.description} ${src(item)} ${item.tags.join(' ')}`.toLowerCase();
      return (current === 'all' || item.category === current) && (!query || haystack.includes(query));
    });
    grid.replaceChildren();
    if (list.length) {
      list.forEach((item) => grid.append(renderCard(item)));
    } else {
      const empty = document.createElement('article');
      empty.className = 'card empty';
      empty.textContent = '표시할 뉴스 없음';
      grid.append(empty);
    }
    state.textContent = `표시 ${list.length} / 전체 ${items.length} · 인기뉴스 ${Math.min(10, items.length)}위까지 표시`;
    renderRank();
  }

  async function getJson(path) {
    try {
      const response = await fetch(`${path}?v=${Date.now()}`, { cache: 'no-store' });
      return response.ok ? response.json() : null;
    } catch {
      return null;
    }
  }

  async function load() {
    state.textContent = '뉴스 데이터 연결 중';
    grid.textContent = '뉴스 데이터 연결 중';
    rank.replaceChildren();
    const loading = document.createElement('li');
    const mark = document.createElement('b');
    mark.textContent = '·';
    const text = document.createElement('span');
    text.textContent = '순위 계산 중';
    loading.append(mark, text);
    rank.append(loading);

    const payloads = await Promise.all(SOURCES.map(getJson));
    items = dedupe(payloads.flatMap(flatten));
    current = 'all';
    renderTabs();
    render();
  }

  q.addEventListener('input', render);
  sort.addEventListener('change', render);
  $('#reload').addEventListener('click', load);
  tabs.addEventListener('click', (event) => {
    const button = event.target.closest('.tab');
    if (!button) return;
    current = button.dataset.category;
    tabs.querySelectorAll('.tab').forEach((item) => item.classList.remove('on'));
    button.classList.add('on');
    render();
  });
  load();
})();
