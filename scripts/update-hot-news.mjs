import fs from 'node:fs/promises';

const out = 'news';
const maxPerFeed = 12;
const maxPerCategory = 28;
const maxTotal = 220;
const timeoutMs = 12000;

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
const ent = s => String(s ?? '').replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, x => entMap[x] ?? x).replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
const strip = s => ent(s).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const redact = s => s.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[이메일 비공개]').replace(/\b(?:\+?82[-.\s]?)?0?1[016789][-.\s]?\d{3,4}[-.\s]?\d{4}\b/g, '[전화번호 비공개]').replace(/\b0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}\b/g, '[전화번호 비공개]').replace(/\b\d{6}[-\s]?[1-4]\d{6}\b/g, '[고유식별번호 비공개]').replace(/\b(?:\d[ -]*?){13,19}\b/g, '[카드번호 비공개]').replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[IP 비공개]').replace(/(?:서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)[^\s,]{0,15}(?:로|길)\s?\d{1,4}(?:-\d{1,4})?/g, '[주소 비공개]').replace(/\s+/g, ' ').trim();
const clean = (s, n = 260) => { const v = redact(strip(s)); return v.length <= n ? v : `${v.slice(0, n).replace(/\s+\S*$/, '')}…`; };
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const tag = (block, name) => (block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'))?.[1] ?? '').trim();
const source = block => { const m = block.match(/<source[^>]*url="([^"]*)"[^>]*>([\s\S]*?)<\/source>/i); return { name: m ? clean(m[2], 80) : 'Google News', url: m ? ent(m[1]) : '' }; };
const normTitle = s => clean(s, 180).replace(/\s+-\s+[^-]{2,40}$/u, '').replace(/\s+/g, ' ').trim();
const gUrl = q => `https://news.google.com/rss/search?q=${encodeURIComponent(`${q} when:1d`)}&hl=ko&gl=KR&ceid=KR:ko`;

function score(item) {
  const age = Math.max(0, (Date.now() - new Date(item.publishedAt).getTime()) / 36e5 || 24);
  return Math.round(Math.max(0, 48 - age) + hotWords.reduce((a, w) => a + (item.title.includes(w) ? 8 : 0), 0) + (item.source.name !== 'Google News' ? 4 : 0));
}
async function get(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { 'user-agent': 'gorics-newsbot/1.2' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}
function parse(xml, c) {
  return [...xml.matchAll(/<item[\s\S]*?<\/item>/gi)].slice(0, maxPerFeed).map(m => {
    const block = m[0];
    const rawDate = clean(tag(block, 'pubDate'), 80);
    const item = { id: `${c.id}-${Buffer.from(`${tag(block, 'title')}|${tag(block, 'link')}`).toString('base64url').slice(0, 14)}`, category: c.id, categoryName: c.name, categoryIcon: c.icon, title: normTitle(tag(block, 'title')), description: clean(tag(block, 'description'), 360), url: ent(tag(block, 'link')).trim(), source: source(block), publishedAt: Number.isNaN(Date.parse(rawDate)) ? new Date().toISOString() : new Date(rawDate).toISOString(), guid: clean(tag(block, 'guid'), 220) };
    item.score = score(item);
    return item;
  }).filter(x => x.title && x.url);
}
const titleKey = title => title.toLowerCase().replace(/[^0-9a-z가-힣]+/gi, '').slice(0, 120);
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
      } catch (e) { errors.push({ category: c.id, query: q, message: e.message }); }
    }
    byCategory[c.id] = items.sort((a, b) => b.score - a.score || new Date(b.publishedAt) - new Date(a.publishedAt)).slice(0, maxPerCategory);
    all.push(...byCategory[c.id]);
  }
  return { byCategory, allItems: all.sort((a, b) => b.score - a.score || new Date(b.publishedAt) - new Date(a.publishedAt)).slice(0, maxTotal), errors };
}
function addLegacy(payload) {
  const toLegacy = x => ({ id: x.id, title: x.title, link: x.url, source: x.source?.name || '원문', theme: x.categoryName || x.category || '뉴스', published_at: x.publishedAt, summary: x.description || '', tags: [x.categoryName || x.category || '뉴스'], score: x.score || 0 });
  payload.generated_at = payload.generatedAt;
  payload.items = (payload.allItems || []).map(toLegacy);
  payload.theme_order = (payload.categories || []).map(c => c.name);
  payload.themes = {};
  for (const c of payload.categories || []) payload.themes[c.name] = (payload.byCategory?.[c.id] || []).map(toLegacy);
  return payload;
}
function html() {
  return `<!doctype html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="index,follow"><meta name="description" content="GORICS 동적 뉴스 허브. news/data.json을 읽어 최신 공개 뉴스 RSS를 표시합니다."><link rel="alternate" type="application/rss+xml" title="GORICS HOT NEWS RSS" href="feed.xml"><title>GORICS NEWS</title><style>
:root{color-scheme:dark;--bg:#070a12;--panel:#101827;--line:rgba(148,163,184,.24);--text:#e5edf8;--muted:#94a3b8;--blue:#60a5fa;--green:#34d399;--hot:#fb7185;--violet:#a78bfa;--gold:#facc15}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 12% 0,rgba(96,165,250,.2),transparent 32rem),radial-gradient(circle at 90% 0,rgba(251,113,133,.13),transparent 30rem),var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Apple SD Gothic Neo","Noto Sans KR",sans-serif}a{color:inherit;text-decoration:none}button,input,select{font:inherit}.wrap{width:min(1180px,calc(100% - 28px));margin:0 auto}.nav{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:22px 0}.brand{font-weight:950;letter-spacing:-.04em}.links{display:flex;gap:8px;overflow:auto}.links a{white-space:nowrap;border:1px solid transparent;border-radius:999px;padding:9px 12px;color:var(--muted);font-weight:850}.links a:hover,.links a.on{border-color:var(--line);background:rgba(255,255,255,.05);color:var(--text)}.hero{display:grid;grid-template-columns:1.15fr .85fr;gap:16px;margin:12px 0 18px}.panel,.card,.box,.toolbar{border:1px solid var(--line);background:linear-gradient(180deg,rgba(16,24,39,.96),rgba(10,16,28,.96));border-radius:24px;box-shadow:0 24px 80px rgba(0,0,0,.3)}.lead{padding:clamp(22px,4vw,34px)}.kicker{color:var(--green);font-weight:950;letter-spacing:.08em;font-size:.82rem}.lead h1{margin:12px 0 12px;font-size:clamp(2.6rem,8vw,5.8rem);line-height:.92;letter-spacing:-.08em}.desc{margin:0;color:var(--muted);line-height:1.7}.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:20px}.btn{border:1px solid var(--line);border-radius:14px;padding:12px 14px;font-weight:950;background:rgba(255,255,255,.04);cursor:pointer}.btn.primary{background:linear-gradient(135deg,var(--blue),var(--violet));border-color:transparent;color:#050816}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:18px}.stat{border:1px solid var(--line);border-radius:16px;padding:13px;background:rgba(255,255,255,.035)}.stat span{display:block;color:var(--muted);font-size:.82rem}.stat b{display:block;margin-top:5px}.box,.toolbar{padding:18px}.rank{display:grid;gap:9px;margin:0;padding:0;list-style:none}.rank li{display:grid;grid-template-columns:28px 1fr;gap:8px;color:var(--muted);line-height:1.42}.rank b{color:var(--hot)}.notice{margin:0 0 18px;border:1px solid rgba(250,204,21,.25);border-radius:18px;background:rgba(250,204,21,.08);color:#fde68a;padding:14px;line-height:1.6}.toolbar{position:sticky;top:0;z-index:5;margin-bottom:16px;background:rgba(7,10,18,.9);backdrop-filter:blur(16px)}.controls{display:grid;grid-template-columns:1fr auto auto;gap:10px}.search,.select{border:1px solid var(--line);background:#080d16;color:var(--text);border-radius:14px;padding:12px 13px;outline:none}.tabs{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.tab{border:1px solid var(--line);border-radius:999px;padding:8px 11px;color:#cbd5e1;background:rgba(255,255,255,.04);font-weight:850;cursor:pointer}.tab.active{border-color:var(--blue);color:#fff}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;padding-bottom:54px}.card{padding:18px;min-height:220px;display:flex;flex-direction:column}.meta{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}.chip,.score{border-radius:999px;padding:6px 9px;font-size:.78rem;font-weight:950}.chip{border:1px solid rgba(96,165,250,.3);background:rgba(96,165,250,.12);color:#cfe2ff}.score{border:1px solid rgba(251,113,133,.35);background:rgba(251,113,133,.12);color:#fecdd3}.card h2{font-size:1.12rem;line-height:1.45;margin:15px 0 10px}.card p{margin:0;color:var(--muted);line-height:1.62}.card footer{margin-top:auto;padding-top:12px;border-top:1px solid var(--line);display:flex;justify-content:space-between;gap:10px;color:#7d8797;font-size:.84rem}.muted{color:var(--muted)}.error{border-color:rgba(251,113,133,.45);background:rgba(251,113,133,.08)}@media(max-width:860px){.nav{display:block}.links{margin-top:12px}.hero,.grid,.controls{grid-template-columns:1fr}.stats{grid-template-columns:1fr 1fr}}
</style></head><body><nav class="wrap nav"><a class="brand" href="../">GORICS.CLOUD</a><div class="links"><a href="../">홈</a><a class="on" href="./">뉴스</a><a href="financial/">금융뉴스</a><a href="../study/">스터디</a><a href="../pdf/">PDF</a><a href="feed.xml">RSS</a></div></nav><header class="wrap hero"><section class="panel lead"><div class="kicker">DYNAMIC NEWS · DATA.JSON</div><h1>GORICS<br>NEWS</h1><p class="desc">정적 고정 뉴스가 아니라 <b>news/data.json</b>을 동적으로 읽어 표시합니다. 실패하면 무한 대기하지 않고 에러와 재시도 버튼을 보여줍니다.</p><div class="actions"><a class="btn primary" href="financial/">💹 금융 뉴스</a><a class="btn" href="feed.xml">📡 RSS</a><button class="btn" id="retryTop" type="button">🔄 다시 읽기</button></div><div class="stats"><div class="stat"><span>상태</span><b id="state">연결 중</b></div><div class="stat"><span>기사</span><b id="total">-</b></div><div class="stat"><span>테마</span><b id="themeCount">-</b></div><div class="stat"><span>갱신</span><b id="updated">-</b></div></div></section><aside class="box"><h2>🔥 TOP</h2><ol id="rank" class="rank"><li><b>·</b><span class="muted">데이터 연결 중</span></li></ol></aside></header><main class="wrap"><p class="notice">⚠️ 개인정보 패턴은 생성 단계에서 비공개 처리됩니다. 이 페이지는 로컬 방문자 추적/쿠키/분석 스크립트를 넣지 않습니다.</p><section class="toolbar"><div class="controls"><input id="q" class="search" placeholder="제목·요약·언론사 검색"><select id="sort" class="select"><option value="hot">HOT순</option><option value="latest">최신순</option></select><button id="retry" class="btn" type="button">다시 읽기</button></div><div id="tabs" class="tabs"></div><div id="status" class="muted" style="margin-top:10px">뉴스 데이터 연결 중입니다.</div></section><section id="grid" class="grid"></section></main><script>
const grid=document.getElementById('grid'),tabs=document.getElementById('tabs'),rank=document.getElementById('rank'),statusEl=document.getElementById('status'),q=document.getElementById('q'),sort=document.getElementById('sort');let data=null,items=[],current='all';const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));const date=iso=>{const d=new Date(iso);return isNaN(d)?'-':new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(d)};function normalize(p){const arr=Array.isArray(p.allItems)&&p.allItems.length?p.allItems:(p.items||[]).map(x=>({id:x.id,category:x.theme,categoryName:x.theme,categoryIcon:'📰',title:x.title,description:x.summary,url:x.link,source:{name:x.source||'원문'},publishedAt:x.published_at,score:x.score||0}));return arr.filter(x=>x&&x.title&&(x.url||x.link));}function cats(p){if(Array.isArray(p.categories)&&p.categories.length)return p.categories.map(c=>({id:c.id||c.name,name:c.name||c.id,icon:c.icon||'📰',count:c.count||0}));const names=[...new Set(items.map(x=>x.categoryName||x.category||'뉴스'))];return names.map(n=>({id:n,name:n,icon:'📰',count:items.filter(x=>(x.categoryName||x.category)===n).length}));}function card(x){return '<article class="card"><div class="meta"><span class="chip">'+esc(x.categoryIcon||'📰')+' '+esc(x.categoryName||x.category||'뉴스')+'</span><span class="score">HOT '+esc(x.score||0)+'</span></div><h2><a target="_blank" rel="noopener noreferrer" href="'+esc(x.url||x.link)+'">'+esc(x.title)+'</a></h2><p>'+esc(x.description||x.summary||'요약 없음')+'</p><footer><span>'+esc(x.source?.name||x.source||'원문')+'</span><time>'+esc(date(x.publishedAt||x.published_at))+'</time></footer></article>'}function render(){const term=q.value.trim().toLowerCase();let arr=[...items];arr=sort.value==='latest'?arr.sort((a,b)=>new Date(b.publishedAt||b.published_at)-new Date(a.publishedAt||a.published_at)):arr.sort((a,b)=>(b.score||0)-(a.score||0));arr=arr.filter(x=>(current==='all'||x.category===current||x.categoryName===current)&&(!term||(x.title+' '+(x.description||x.summary||'')+' '+(x.source?.name||x.source||'')).toLowerCase().includes(term)));grid.innerHTML=arr.length?arr.map(card).join(''):'<article class="card error"><h2>표시할 뉴스가 없습니다</h2><p>검색어 또는 테마를 바꿔보세요.</p></article>';statusEl.textContent='현재 '+arr.length+'개 표시';}function draw(p){data=p;items=normalize(p);const categoryList=cats(p);document.getElementById('state').textContent='정상';document.getElementById('total').textContent=String(items.length);document.getElementById('themeCount').textContent=String(categoryList.length);document.getElementById('updated').textContent=date(p.generatedAt||p.generated_at);rank.innerHTML=items.slice(0,8).map((x,i)=>'<li><b>'+(i+1)+'</b><a target="_blank" rel="noopener noreferrer" href="'+esc(x.url||x.link)+'">'+esc(x.title)+'</a></li>').join('');tabs.innerHTML='<button class="tab active" data-id="all">전체 '+items.length+'</button>'+categoryList.map(c=>'<button class="tab" data-id="'+esc(c.id)+'">'+esc(c.icon)+' '+esc(c.name)+' '+esc(c.count||'')+'</button>').join('');tabs.querySelectorAll('.tab').forEach(btn=>btn.onclick=()=>{tabs.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));btn.classList.add('active');current=btn.dataset.id;render();});render();}async function load(){document.getElementById('state').textContent='연결 중';statusEl.textContent='뉴스 데이터 연결 중입니다.';grid.innerHTML='';const ac=new AbortController();const t=setTimeout(()=>ac.abort(),7000);try{const res=await fetch('./data.json?v='+Date.now(),{cache:'no-store',signal:ac.signal});if(!res.ok)throw new Error('HTTP '+res.status);const p=await res.json();clearTimeout(t);draw(p);}catch(e){clearTimeout(t);document.getElementById('state').textContent='실패';statusEl.textContent='데이터 연결 실패: '+e.message;grid.innerHTML='<article class="card error"><h2>뉴스 데이터 연결 실패</h2><p>무한 로딩 대신 여기서 멈췄습니다. 다시 읽기를 누르거나 금융뉴스/RSS로 이동하세요.</p><div class="actions"><button class="btn" onclick="load()">다시 읽기</button><a class="btn" href="financial/">금융뉴스</a><a class="btn" href="feed.xml">RSS</a></div></article>';rank.innerHTML='<li><b>!</b><span>데이터 연결 실패</span></li>';}}q.oninput=render;sort.onchange=render;document.getElementById('retry').onclick=load;document.getElementById('retryTop').onclick=load;load();
</script></body></html>`;
}
function feed(payload) { return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>GORICS HOT NEWS</title><link>https://gorics.github.io/website/news/</link><description>Privacy-redacted Korean hot news hub updated hourly.</description><lastBuildDate>${new Date(payload.generatedAt).toUTCString()}</lastBuildDate>${payload.allItems.slice(0, 60).map(x => `<item><title>${esc(x.title)}</title><link>${esc(x.url)}</link><guid>${esc(x.guid || x.url)}</guid><pubDate>${new Date(x.publishedAt).toUTCString()}</pubDate><category>${esc(x.categoryName)}</category><description>${esc(x.description)}</description></item>`).join('')}</channel></rss>`; }

const generatedAt = new Date().toISOString();
const { byCategory, allItems, errors } = await collect();
const payload = addLegacy({ generatedAt, source: 'Google News RSS search feeds; public metadata only', page: 'dynamic-news-hub', privacy: { policy: 'No account, email, phone, resident ID, card number, IP address, or precise street-address patterns are intentionally published.', redaction: ['email', 'phone', 'resident-registration-like number', 'card-like number', 'IP address', 'street-address-like pattern'] }, categories: categories.map(c => ({ id: c.id, name: c.name, icon: c.icon, count: byCategory[c.id]?.length ?? 0 })), total: allItems.length, byCategory, allItems, errors });
await fs.mkdir(out, { recursive: true });
await fs.mkdir(`${out}/news`, { recursive: true });
await fs.writeFile(`${out}/data.json`, `${JSON.stringify(payload, null, 2)}\n`);
await fs.writeFile(`${out}/news/data.json`, `${JSON.stringify(payload, null, 2)}\n`);
await fs.writeFile(`${out}/index.html`, html());
await fs.writeFile(`${out}/feed.xml`, feed(payload));
console.log(`Generated ${payload.total} dynamic news items. Feed errors: ${errors.length}`);
