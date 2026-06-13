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
  const r = await fetch(url, { signal: AbortSignal.timeout(feedsTimeoutMs), headers: { 'user-agent': 'gorics-newsbot/1.1' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

function parse(xml, c) {
  return [...xml.matchAll(/<item[\s\S]*?<\/item>/gi)].slice(0, maxPerFeed).map((m) => {
    const block = m[0];
    const rawDate = clean(tag(block, 'pubDate'), 80);
    const item = {
      id: `${c.id}-${Buffer.from(`${tag(block, 'title')}|${tag(block, 'link')}`).toString('base64url').slice(0, 14)}`,
      category: c.id,
      categoryName: c.name,
      categoryIcon: c.icon,
      title: normTitle(tag(block, 'title')),
      description: clean(tag(block, 'description'), 360),
      url: ent(tag(block, 'link')).trim(),
      source: source(block),
      publishedAt: Number.isNaN(Date.parse(rawDate)) ? new Date().toISOString() : new Date(rawDate).toISOString(),
      guid: clean(tag(block, 'guid'), 220)
    };
    item.score = score(item);
    return item;
  }).filter(x => x.title && x.url);
}

function titleKey(title) {
  return title.toLowerCase().replace(/[^0-9a-z가-힣]+/gi, '').slice(0, 120);
}

async function collect() {
  const byCategory = {}, all = [], seen = new Set(), errors = [];
  for (const c of categories) {
    const items = [];
    for (const q of c.queries) {
      try {
        for (const item of parse(await get(gUrl(q)), c)) {
          const key = titleKey(item.title);
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
  return `<!doctype html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="index,follow"><meta name="description" content="GORICS 뉴스 허브. 공개 RSS 기반 핫뉴스, 카테고리, 금융뉴스, RSS 피드를 한 곳에서 확인합니다."><link rel="alternate" type="application/rss+xml" title="GORICS HOT NEWS RSS" href="feed.xml"><title>GORICS NEWS HUB</title><style>
:root{color-scheme:dark;--bg:#070a12;--panel:#101827;--panel2:#152033;--line:rgba(148,163,184,.22);--text:#e5edf8;--muted:#94a3b8;--blue:#60a5fa;--green:#34d399;--violet:#a78bfa;--hot:#fb7185;--gold:#facc15;--shadow:0 24px 80px rgba(0,0,0,.34)}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 10% 0,rgba(96,165,250,.22),transparent 32rem),radial-gradient(circle at 90% 8%,rgba(251,113,133,.14),transparent 28rem),var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Apple SD Gothic Neo","Noto Sans KR",sans-serif}a{color:inherit;text-decoration:none}button,input,select{font:inherit}.wrap{width:min(1240px,calc(100% - 32px));margin:0 auto}.topnav{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:24px 0 0}.brand{display:flex;align-items:center;gap:10px;font-weight:950;letter-spacing:-.04em}.logo{display:grid;place-items:center;width:42px;height:42px;border-radius:14px;background:linear-gradient(135deg,var(--blue),var(--green));color:#06101f}.nav{display:flex;gap:8px;overflow:auto}.nav a{white-space:nowrap;border:1px solid transparent;border-radius:999px;padding:9px 12px;color:var(--muted);font-weight:850}.nav a:hover,.nav a.active{border-color:var(--line);background:rgba(255,255,255,.05);color:var(--text)}header{padding:24px 0 18px}.hero{display:grid;grid-template-columns:1.14fr .86fr;gap:16px}.panel,.toolbar,.card,.box{border:1px solid var(--line);background:linear-gradient(180deg,rgba(16,24,39,.94),rgba(10,16,28,.94));border-radius:26px;box-shadow:var(--shadow)}.lead{padding:clamp(22px,4vw,34px)}.kicker{color:var(--green);font-weight:900;letter-spacing:.09em;font-size:.82rem}.lead h1{margin:12px 0 14px;font-size:clamp(2.6rem,7vw,5.8rem);line-height:.93;letter-spacing:-.08em}.desc{color:var(--muted);line-height:1.7;margin:0}.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:22px}.btn{display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--line);border-radius:14px;padding:12px 15px;font-weight:950;background:rgba(255,255,255,.035);cursor:pointer}.btn.primary{background:linear-gradient(135deg,var(--blue),var(--violet));border-color:transparent;color:#050816}.btn.hot{background:rgba(251,113,133,.12);border-color:rgba(251,113,133,.28);color:#fecdd3}.btn:hover{transform:translateY(-1px)}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:22px}.stat{border:1px solid var(--line);border-radius:16px;padding:13px 14px;background:rgba(255,255,255,.035)}.stat span{display:block;color:var(--muted);font-size:.82rem}.stat b{display:block;margin-top:5px;font-size:1.08rem}.spot{padding:22px;display:grid;gap:14px}.spot h2{margin:0;font-size:1.18rem}.rank{display:grid;gap:10px;margin:0;padding:0;list-style:none}.rank li{display:grid;grid-template-columns:28px 1fr;gap:8px;color:var(--muted);font-size:.9rem;line-height:1.42}.rank b{color:var(--hot)}.rank a:hover,.card h2 a:hover{color:var(--blue)}.toolbar{position:sticky;top:0;z-index:10;margin:0 auto 18px;padding:14px;background:rgba(7,10,18,.88);backdrop-filter:blur(18px);border-radius:22px}.controls{display:grid;grid-template-columns:1fr auto auto;gap:10px}.search,.select,.reset{border:1px solid var(--line);background:#080d16;color:var(--text);border-radius:14px;padding:13px 14px;outline:none}.reset{cursor:pointer;color:#c4b5fd;font-weight:900}.tabs{display:flex;gap:8px;overflow:auto;padding-top:12px}.tab{white-space:nowrap;border:1px solid var(--line);background:#111a2b;color:var(--muted);border-radius:999px;padding:9px 12px;cursor:pointer;font-weight:850}.tab.active,.tab:hover{color:white;border-color:var(--blue)}.status{margin:10px 2px 0;color:var(--muted);font-size:.9rem}.layout{display:grid;grid-template-columns:270px 1fr;gap:16px}.side{display:grid;gap:14px;align-self:start;position:sticky;top:112px}.box{padding:18px}.box h3{margin:0 0 12px}.quick{display:grid;gap:9px}.quick a,.quick button{display:flex;justify-content:space-between;gap:10px;width:100%;border:1px solid var(--line);border-radius:14px;background:rgba(255,255,255,.035);color:var(--muted);padding:11px 12px;font-weight:850;text-align:left;cursor:pointer}.quick a:hover,.quick button:hover{color:var(--text);border-color:rgba(96,165,250,.65)}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;padding-bottom:54px}.card{padding:18px;min-height:242px;display:flex;flex-direction:column;transition:.18s}.card:hover{transform:translateY(-3px);border-color:rgba(96,165,250,.75)}.top{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}.chip,.score{border-radius:999px;padding:6px 9px;font-size:.78rem;font-weight:900}.chip{border:1px solid rgba(96,165,250,.3);background:rgba(96,165,250,.12);color:#cfe2ff}.score{border:1px solid rgba(251,113,133,.35);background:rgba(251,113,133,.12);color:#fecdd3}.card h2{font-size:1.14rem;line-height:1.45;margin:16px 0 10px;letter-spacing:-.02em}.card p{color:var(--muted);line-height:1.62;margin:0 0 18px;font-size:.94rem}.card footer{margin-top:auto;display:flex;justify-content:space-between;gap:12px;color:#7d8797;font-size:.84rem;border-top:1px solid var(--line);padding-top:12px}.empty{display:none;color:var(--muted);padding:38px;text-align:center;border:1px dashed var(--line);border-radius:22px;margin-bottom:54px}.notice{color:#fef3c7;background:rgba(250,204,21,.08);border:1px solid rgba(250,204,21,.24);border-radius:18px;padding:14px;margin:0 0 18px;line-height:1.6}@media(max-width:1040px){.hero,.layout{grid-template-columns:1fr}.side{position:static;grid-template-columns:1fr 1fr}.stats{grid-template-columns:repeat(2,1fr)}}@media(max-width:720px){.wrap{width:min(100% - 22px,1240px)}.topnav{display:block}.nav{margin-top:12px}.controls{grid-template-columns:1fr}.grid,.side{grid-template-columns:1fr}.stats{grid-template-columns:1fr 1fr}.lead{padding:22px}.actions{display:grid}}
</style></head><body><nav class="wrap topnav"><a class="brand" href="../"><span class="logo">G</span><span>GORICS.CLOUD</span></a><div class="nav" aria-label="주요 이동"><a href="../">홈</a><a class="active" href="./">뉴스</a><a href="financial/">금융뉴스</a><a href="../study/">스터디</a><a href="../pdf/">PDF</a><a href="feed.xml">RSS</a></div></nav><header class="wrap"><section class="hero"><div class="panel lead"><div class="kicker">NEWS HUB · AUTO UPDATED · PRIVACY REDACTED</div><h1>GORICS<br>NEWS</h1><p class="desc">국내외 공개 뉴스 RSS를 테마별로 모아 보여주는 뉴스 허브입니다. 전체 핫뉴스, 금융 전용 뉴스, RSS 피드를 한 곳에서 바로 이동합니다.</p><div class="actions"><a class="btn primary" href="financial/">💹 금융 뉴스 바로가기</a><a class="btn hot" href="feed.xml">📡 RSS 구독</a><a class="btn" href="../privacy.html">🔒 개인정보 처리 안내</a></div><div class="stats"><div class="stat"><span>마지막 갱신</span><b>${esc(kst(payload.generatedAt))}</b></div><div class="stat"><span>총 기사</span><b>${payload.total}</b></div><div class="stat"><span>테마</span><b>${payload.categories.length}</b></div><div class="stat"><span>수집 오류</span><b>${payload.errors.length}</b></div></div></div><aside class="panel spot"><h2>🔥 지금 뜨는 TOP 10</h2><ol id="rank" class="rank"></ol></aside></section></header><main class="wrap"><p class="notice">⚠️ 자동 수집 페이지입니다. 공개 RSS 메타데이터 기반이며, 이메일·전화번호·주민등록번호 형태·카드번호·IP·세부 주소 패턴은 생성 단계에서 비공개 처리합니다.</p><section class="toolbar"><div class="controls"><input id="search" class="search" placeholder="뉴스 제목·요약·언론사 검색" autocomplete="off"><select id="sort" class="select"><option value="hot">HOT순</option><option value="latest">최신순</option></select><button id="reset" class="reset" type="button">초기화</button></div><div id="tabs" class="tabs"></div><div id="status" class="status">뉴스를 불러오는 중입니다.</div></section><section class="layout"><aside class="side"><section class="box"><h3>바로가기</h3><div class="quick"><a href="financial/"><span>금융 뉴스</span><b>→</b></a><a href="feed.xml"><span>전체 RSS</span><b>→</b></a><a href="../"><span>메인 홈</span><b>→</b></a><a href="../study/"><span>스터디</span><b>→</b></a></div></section><section class="box"><h3>빠른 검색</h3><div class="quick"><button data-key="속보">속보</button><button data-key="AI">AI</button><button data-key="수능">수능</button><button data-key="환율">환율</button><button data-key="정책">정책</button></div></section></aside><section><div id="grid" class="grid"></div><div id="empty" class="empty">검색 결과가 없습니다.</div></section></section></main><script id="payload" type="application/json">${esc(JSON.stringify(payload))}</script><script>
const data=JSON.parse(document.getElementById('payload').textContent),grid=document.getElementById('grid'),tabs=document.getElementById('tabs'),search=document.getElementById('search'),empty=document.getElementById('empty'),rank=document.getElementById('rank'),status=document.getElementById('status'),sort=document.getElementById('sort'),reset=document.getElementById('reset');let current='all';const e=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));const time=iso=>{const d=new Date(iso);return isNaN(d)?'-':new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(d)};function ordered(){const arr=[...(data.allItems||[])];return sort.value==='latest'?arr.sort((a,b)=>new Date(b.publishedAt)-new Date(a.publishedAt)):arr.sort((a,b)=>(b.score||0)-(a.score||0)||new Date(b.publishedAt)-new Date(a.publishedAt))}function card(x){return '<article class="card" data-category="'+e(x.category)+'" data-text="'+e((x.title+' '+x.description+' '+(x.source?.name||'')+' '+x.categoryName).toLowerCase())+'"><div class="top"><span class="chip">'+e(x.categoryIcon)+' '+e(x.categoryName)+'</span><span class="score">HOT '+e(x.score||0)+'</span></div><h2><a href="'+e(x.url)+'" target="_blank" rel="noopener noreferrer">'+e(x.title)+'</a></h2><p>'+e(x.description||'요약 정보가 제공되지 않은 기사입니다. 원문에서 전체 내용을 확인하세요.')+'</p><footer><span>'+e(x.source?.name||'원문')+'</span><time datetime="'+e(x.publishedAt)+'">'+e(time(x.publishedAt))+'</time></footer></article>'}function draw(){const items=ordered();grid.innerHTML=items.map(card).join('');rank.innerHTML=items.slice(0,10).map((x,i)=>'<li><b>'+(i+1)+'</b><a href="'+e(x.url)+'" target="_blank" rel="noopener noreferrer">'+e(x.title)+'</a></li>').join('');tabs.innerHTML='<button class="tab active" data-filter="all">전체 <b>'+items.length+'</b></button>'+data.categories.map(c=>'<button class="tab" data-filter="'+e(c.id)+'">'+e(c.icon)+' '+e(c.name)+' <b>'+c.count+'</b></button>').join('');tabs.querySelectorAll('.tab').forEach(t=>t.onclick=()=>{tabs.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));t.classList.add('active');current=t.dataset.filter;apply()});apply()}function apply(){const term=search.value.trim().toLowerCase();let n=0;document.querySelectorAll('.card').forEach(c=>{const ok=(current==='all'||c.dataset.category===current)&&(!term||c.dataset.text.includes(term));c.style.display=ok?'':'none';if(ok)n++});empty.style.display=n?'none':'block';status.textContent='현재 '+n+'개 뉴스 표시'+(term?' · 검색어: '+search.value.trim():'')+(current!=='all'?' · 테마 필터 적용':'')+'.'}search.oninput=apply;sort.onchange=draw;reset.onclick=()=>{search.value='';sort.value='hot';current='all';draw()};document.querySelectorAll('[data-key]').forEach(b=>b.onclick=()=>{search.value=b.dataset.key;apply();window.scrollTo({top:document.querySelector('.toolbar').offsetTop,behavior:'smooth'})});draw();
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
  page: 'news-hub',
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
