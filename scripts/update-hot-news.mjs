import fs from 'node:fs/promises';

const out = 'news';
const maxPerFeed = 12;
const maxPerCategory = 28;
const maxTotal = 220;
const feedsTimeoutMs = 12000;

const categories = [
  ['top', '종합 핫뉴스', '🔥', ['대한민국 주요 뉴스', '속보 OR 단독', '오늘 이슈']],
  ['politics', '정치·정책', '🏛️', ['대한민국 정치 국회', '대통령실 정부 정책', '선거 정당 국회']],
  ['economy', '경제·금융', '💹', ['한국 경제 증시 환율 금리', '부동산 금융 시장', '기업 실적 투자']],
  ['society', '사회·교육', '🏫', ['사회 사건 교육 의료 노동', '교육부 수능 대학 입시', '복지 노동 의료 안전']],
  ['world', '국제', '🌍', ['국제 미국 중국 일본 유럽', '중동 전쟁 외교', '글로벌 정치 안보']],
  ['tech', 'AI·과학기술', '🤖', ['AI 인공지능 반도체 배터리', '과학 기술 우주 로봇', '빅테크 스타트업 사이버보안']],
  ['climate', '기후·환경·재난', '🌱', ['기후 환경 에너지 재난', '폭염 태풍 지진 산불', '탄소중립 원전 재생에너지']],
  ['culture', '문화·엔터', '🎬', ['문화 영화 음악 방송 웹툰', 'K팝 드라마 공연 전시', '게임 콘텐츠 OTT']],
  ['sports', '스포츠', '⚽', ['스포츠 축구 야구 농구 배구', 'KBO K리그 프리미어리그', '올림픽 월드컵 스포츠']],
  ['analysis', '심층·해설', '🧭', ['뉴스 분석 해설 전망', '이슈 정리 배경 영향', '전문가 진단 전망']]
].map(([id, name, icon, queries]) => ({ id, name, icon, queries }));

const hotWords = ['속보', '단독', '긴급', '확정', '발표', '최대', '최초', '사상', '급등', '급락', '폭등', '폭락', '논란', '충격', '위기', '경고', '전망', '돌파', '확산', '대응', '인상', '인하', 'AI', '반도체'];

const entMap = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&nbsp;': ' ' };
const ent = s => String(s ?? '')
  .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, x => entMap[x] ?? x)
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
const strip = s => ent(s).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const redact = s => s
  .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[이메일 비공개]')
  .replace(/\b(?:\+?82[-.\s]?)?0?1[016789][-.\s]?\d{3,4}[-.\s]?\d{4}\b/g, '[전화번호 비공개]')
  .replace(/\b0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}\b/g, '[전화번호 비공개]')
  .replace(/\b\d{6}[-\s]?[1-4]\d{6}\b/g, '[고유식별번호 비공개]')
  .replace(/\b(?:\d[ -]*?){13,19}\b/g, '[카드번호 비공개]')
  .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[IP 비공개]')
  .replace(/(?:서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)[^\s,]{0,15}(?:로|길)\s?\d{1,4}(?:-\d{1,4})?/g, '[주소 비공개]')
  .replace(/\s+/g, ' ').trim();
const clean = (s, n = 260) => {
  const v = redact(strip(s));
  return v.length <= n ? v : `${v.slice(0, n).replace(/\s+\S*$/, '')}…`;
};
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const tag = (block, name) => (block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'))?.[1] ?? '').trim();
const source = block => {
  const m = block.match(/<source[^>]*url="([^"]*)"[^>]*>([\s\S]*?)<\/source>/i);
  return { name: m ? clean(m[2], 80) : 'Google News', url: m ? ent(m[1]) : '' };
};
const normTitle = s => clean(s, 180).replace(/\s+-\s+[^-]{2,40}$/u, '').replace(/\s+/g, ' ').trim();
const gUrl = q => `https://news.google.com/rss/search?q=${encodeURIComponent(`${q} when:1d`)}&hl=ko&gl=KR&ceid=KR:ko`;
const kst = iso => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));

function score(item) {
  const age = Math.max(0, (Date.now() - new Date(item.publishedAt).getTime()) / 36e5 || 24);
  return Math.round(Math.max(0, 48 - age) + hotWords.reduce((a, w) => a + (item.title.includes(w) ? 8 : 0), 0) + (item.source.name !== 'Google News' ? 4 : 0));
}

async function get(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(feedsTimeoutMs), headers: { 'user-agent': 'gorics-newsbot/1.0' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

function parse(xml, c) {
  return [...xml.matchAll(/<item[\s\S]*?<\/item>/gi)].slice(0, maxPerFeed).map((m) => {
    const block = m[0];
    const rawDate = clean(tag(block, 'pubDate'), 80);
    const publishedAt = Number.isNaN(Date.parse(rawDate)) ? new Date().toISOString() : new Date(rawDate).toISOString();
    const item = {
      id: `${c.id}-${Buffer.from(`${tag(block, 'title')}|${tag(block, 'link')}`).toString('base64url').slice(0, 14)}`,
      category: c.id,
      categoryName: c.name,
      categoryIcon: c.icon,
      title: normTitle(tag(block, 'title')),
      description: clean(tag(block, 'description'), 360),
      url: ent(tag(block, 'link')).trim(),
      source: source(block),
      publishedAt,
      guid: clean(tag(block, 'guid'), 220)
    };
    item.score = score(item);
    return item;
  }).filter(x => x.title && x.url);
}

async function collect() {
  const byCategory = {}, all = [], seen = new Set(), errors = [];
  for (const c of categories) {
    const items = [];
    for (const q of c.queries) {
      try {
        for (const item of parse(await get(gUrl(q)), c)) {
          const key = item.title.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          items.push(item);
        }
      } catch (e) {
        errors.push({ category: c.id, query: q, message: e.message });
      }
    }
    byCategory[c.id] = items.sort((a, b) => b.score - a.score || new Date(b.publishedAt) - new Date(a.publishedAt)).slice(0, maxPerCategory);
    all.push(...byCategory[c.id]);
  }
  return { byCategory, allItems: all.sort((a, b) => b.score - a.score || new Date(b.publishedAt) - new Date(a.publishedAt)).slice(0, maxTotal), errors };
}

function html(payload) {
  return `<!doctype html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="index,follow"><meta name="description" content="개인정보를 자동 제거한 테마별 핫뉴스 링크 허브. 매시간 GitHub Actions로 갱신됩니다."><title>GORICS HOT NEWS</title><style>
:root{color-scheme:dark;--bg:#071018;--panel:#0e1a25;--panel2:#132435;--line:#22364a;--text:#e6edf3;--muted:#9fb0c0;--accent:#58a6ff;--hot:#ff7b72;--ok:#3fb950}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at top left,#13243a,var(--bg) 45%);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}a{color:inherit;text-decoration:none}.wrap{width:min(1220px,calc(100% - 32px));margin:0 auto}header{padding:46px 0 22px}.hero{display:grid;grid-template-columns:1.4fr .8fr;gap:22px}.box,.toolbar{background:rgba(14,26,37,.88);border:1px solid var(--line);border-radius:24px;box-shadow:0 18px 60px rgba(0,0,0,.28)}.box{padding:30px}.kicker{color:var(--ok);font-weight:800;letter-spacing:.08em;font-size:.82rem}h1{font-size:clamp(2.2rem,6vw,5.2rem);line-height:.95;margin:14px 0 18px}.desc{color:var(--muted);line-height:1.7}.pills{display:flex;flex-wrap:wrap;gap:10px;margin-top:22px}.pill,.chip,.score,.tab{border:1px solid var(--line);background:var(--panel2);border-radius:999px}.pill{padding:9px 13px;color:var(--muted);font-size:.9rem}.pill b{color:var(--text)}.rank{display:flex;flex-direction:column;gap:10px;margin:0;padding:0;list-style:none}.rank li{display:grid;grid-template-columns:28px 1fr;gap:8px;color:var(--muted);font-size:.92rem;line-height:1.42}.rank b{color:var(--hot)}.rank a:hover,.card h2 a:hover{color:var(--accent)}.toolbar{padding:16px;margin:8px 0 22px;position:sticky;top:10px;z-index:10}.search{width:100%;border:1px solid var(--line);background:#071018;color:var(--text);border-radius:14px;padding:14px 16px;outline:none;font-size:1rem}.tabs{display:flex;gap:8px;overflow:auto;padding-top:12px}.tab{white-space:nowrap;color:var(--muted);padding:9px 12px;cursor:pointer}.tab.active,.tab:hover{color:white;border-color:var(--accent)}.notice{color:var(--muted);font-size:.9rem}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;padding-bottom:48px}.card{background:rgba(14,26,37,.94);border:1px solid var(--line);border-radius:20px;padding:18px;min-height:245px;display:flex;flex-direction:column;transition:.18s}.card:hover{transform:translateY(-3px);border-color:rgba(88,166,255,.8)}.top{display:flex;justify-content:space-between;gap:10px}.chip{color:#c8e1ff;background:rgba(88,166,255,.12);padding:6px 9px;font-size:.78rem}.score{color:#ffd8d5;background:rgba(255,123,114,.12);padding:6px 9px;font-size:.74rem;font-weight:800}.card h2{font-size:1.12rem;line-height:1.45;margin:16px 0 10px}.card p{color:var(--muted);line-height:1.62;margin:0 0 18px;font-size:.94rem}.card footer{margin-top:auto;display:flex;justify-content:space-between;gap:12px;color:#7d8b99;font-size:.82rem;border-top:1px solid var(--line);padding-top:12px}.empty{display:none;color:var(--muted);padding:36px;text-align:center;border:1px dashed var(--line);border-radius:20px}@media(max-width:980px){.hero{grid-template-columns:1fr}.grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:640px){.wrap{width:min(100% - 20px,1220px)}.box{padding:24px}.grid{grid-template-columns:1fr}.toolbar{top:0;border-radius:0 0 18px 18px}}
</style></head><body><header class="wrap"><section class="hero"><div class="box"><div class="kicker">AUTO UPDATED EVERY HOUR · PRIVACY REDACTED</div><h1>GORICS<br>HOT NEWS</h1><p class="desc">국내외 공개 뉴스 RSS를 테마별로 모아 보여주는 핫뉴스 허브입니다. 이메일, 전화번호, 주민등록번호, 카드번호, IP, 세부 주소 패턴은 생성 단계에서 자동 비공개 처리합니다. 전체 기사는 각 언론사 원문 링크에서 확인하세요.</p><div class="pills"><span class="pill">마지막 갱신 <b>${esc(kst(payload.generatedAt))}</b></span><span class="pill">총 기사 <b>${payload.total}</b></span><span class="pill">테마 <b>${payload.categories.length}</b></span><span class="pill">수집 오류 <b>${payload.errors.length}</b></span></div></div><aside class="box"><h3>🔥 지금 뜨는 TOP 10</h3><ol id="rank" class="rank"></ol></aside></section></header><main class="wrap"><p class="notice">⚠️ 자동 수집 페이지입니다. 공개 RSS 메타데이터 기반이며, 민감정보 패턴은 정규식으로 제거됩니다. 인물명·기관명 등 기사 맥락상 필요한 공적 정보는 원문 보도를 따릅니다.</p><section class="toolbar"><input id="search" class="search" placeholder="뉴스 제목·요약·언론사 검색" autocomplete="off"><div id="tabs" class="tabs"></div></section><section id="grid" class="grid"></section><div id="empty" class="empty">검색 결과가 없습니다.</div></main><script id="payload" type="application/json">${esc(JSON.stringify(payload))}</script><script>
const data=JSON.parse(document.getElementById('payload').textContent),grid=document.getElementById('grid'),tabs=document.getElementById('tabs'),search=document.getElementById('search'),empty=document.getElementById('empty'),rank=document.getElementById('rank');let current='all';const e=s=>String(s??'').replace(/[&<>\"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[m]));const time=iso=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'medium',timeStyle:'short'}).format(new Date(iso));function card(x){return '<article class="card" data-category="'+e(x.category)+'" data-text="'+e((x.title+' '+x.description+' '+x.source.name).toLowerCase())+'"><div class="top"><span class="chip">'+e(x.categoryIcon)+' '+e(x.categoryName)+'</span><span class="score">HOT '+x.score+'</span></div><h2><a href="'+e(x.url)+'" target="_blank" rel="noopener noreferrer">'+e(x.title)+'</a></h2><p>'+(e(x.description||'요약 정보가 제공되지 않은 기사입니다. 원문에서 전체 내용을 확인하세요.'))+'</p><footer><span>'+e(x.source.name)+'</span><time datetime="'+e(x.publishedAt)+'">'+e(time(x.publishedAt))+'</time></footer></article>'}function draw(){grid.innerHTML=data.allItems.map(card).join('');rank.innerHTML=data.allItems.slice(0,10).map((x,i)=>'<li><b>'+(i+1)+'</b><a href="'+e(x.url)+'" target="_blank" rel="noopener noreferrer">'+e(x.title)+'</a></li>').join('');tabs.innerHTML='<button class="tab active" data-filter="all">전체 <b>'+data.total+'</b></button>'+data.categories.map(c=>'<button class="tab" data-filter="'+e(c.id)+'">'+e(c.icon)+' '+e(c.name)+' <b>'+c.count+'</b></button>').join('');tabs.querySelectorAll('.tab').forEach(t=>t.onclick=()=>{tabs.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));t.classList.add('active');current=t.dataset.filter;apply()});apply()}function apply(){const term=search.value.trim().toLowerCase();let n=0;document.querySelectorAll('.card').forEach(c=>{const ok=(current==='all'||c.dataset.category===current)&&(!term||c.dataset.text.includes(term));c.style.display=ok?'':'none';if(ok)n++});empty.style.display=n?'none':'block'}search.oninput=apply;draw();
</script></body></html>`;
}

function feed(payload) {
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>GORICS HOT NEWS</title><link>https://gorics.github.io/website/news/</link><description>Privacy-redacted Korean hot news hub updated hourly.</description><lastBuildDate>${new Date(payload.generatedAt).toUTCString()}</lastBuildDate>${payload.allItems.slice(0, 60).map(x => `<item><title>${esc(x.title)}</title><link>${esc(x.url)}</link><guid>${esc(x.guid || x.url)}</guid><pubDate>${new Date(x.publishedAt).toUTCString()}</pubDate><category>${esc(x.categoryName)}</category><description>${esc(x.description)}</description></item>`).join('')}</channel></rss>`;
}

const generatedAt = new Date().toISOString();
const { byCategory, allItems, errors } = await collect();
const payload = {
  generatedAt,
  source: 'Google News RSS search feeds; public metadata only',
  privacy: {
    policy: 'No account, email, phone, resident ID, card number, IP address, or precise street-address patterns are intentionally published.',
    redaction: ['email', 'phone', 'resident-registration-like number', 'card-like number', 'IP address', 'street-address-like pattern']
  },
  categories: categories.map(c => ({ id: c.id, name: c.name, icon: c.icon, count: byCategory[c.id]?.length ?? 0 })),
  total: allItems.length,
  byCategory,
  allItems,
  errors
};
await fs.mkdir(out, { recursive: true });
await fs.writeFile(`${out}/data.json`, `${JSON.stringify(payload, null, 2)}\n`);
await fs.writeFile(`${out}/index.html`, html(payload));
await fs.writeFile(`${out}/feed.xml`, feed(payload));
console.log(`Generated ${payload.total} news items. Feed errors: ${errors.length}`);
