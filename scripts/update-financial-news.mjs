import fs from 'node:fs/promises';

const out = 'news/financial';
const perFeed = 18, perCategory = 55, totalLimit = 450, timeoutMs = 8000, concurrency = 10;
const categories = [
  ['market','증시·시장','📈',['코스피 코스닥 증시 외국인 기관','미국 증시 나스닥 S&P500 다우','주식시장 급등 급락 투자','ETF 펀드 채권 시장','개인투자자 신용거래 반대매매']],
  ['macro','금리·환율·거시','🏦',['금리 환율 물가 GDP 한국은행','미국 연준 FOMC 금리 달러','경제성장률 경기침체 인플레이션','원달러 환율 국채 금리','고용 소비 심리 경기 전망']],
  ['company','기업·실적·산업','🏭',['기업 실적 반도체 배터리 자동차','삼성전자 SK하이닉스 현대차 LG에너지솔루션 실적','IPO 상장 공모주 기업공개','수출입 공급망 관세 무역','AI 반도체 HBM 데이터센터 투자']],
  ['finance','은행·증권·보험','💳',['은행 대출 예금 금융당국','가계부채 주택담보대출 신용대출','보험 증권 카드 캐피탈 금융','금융위원회 금융감독원 정책','예대금리차 연체율 부실채권']],
  ['realestate','부동산·PF','🏙️',['부동산 집값 전세 매매 분양','아파트 청약 재건축 재개발','PF 부동산 금융 대출','주택담보대출 전세대출 규제','오피스 상가 토지 경매']],
  ['crypto','가상자산','₿',['비트코인 이더리움 가상자산 ETF','암호화폐 규제 거래소 스테이블코인','가상자산 시장 급등 급락','디지털자산 토큰증권 STO','코인 거래소 상장폐지 해킹']],
  ['global','글로벌 경제','🌐',['중국 경제 일본 경제 유럽 경제','국제유가 원자재 금 구리','글로벌 금융시장 달러 엔화 위안화','중동 리스크 유가 공급망','무역분쟁 관세 수출입 경제']],
  ['policy','정책·세금·재정','📜',['정부 경제정책 세금 예산 재정','부동산 대책 대출 규제 세제','상법 자본시장법 세제 개편','연금 세금 복지 예산 경제','소득세 법인세 종부세 금융투자소득세']],
  ['consumer','소비·유통·생활경제','🛒',['소비자물가 유통 식품 가격','소상공인 자영업 내수 소비','카드 소비 백화점 편의점 이커머스','최저임금 임금 고용 생활경제','통신비 전기요금 공공요금']]
].map(([id,name,icon,queries])=>({id,name,icon,queries}));
const hotWords = ['속보','단독','긴급','확정','발표','최대','최초','사상','급등','급락','폭등','폭락','위기','경고','전망','돌파','인상','인하','금리','환율','코스피','코스닥','나스닥','비트코인','가상자산','부동산','대출','은행','증권','보험','실적','IPO','원유','유가','달러','국채','물가','연준','FOMC','한국은행','규제','세금','관세','AI','반도체','HBM'];
const entMap = {'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'",'&apos;':"'",'&nbsp;':' '};
const ent = s => String(s ?? '').replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, x => entMap[x] ?? x).replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n))).replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCharCode(parseInt(n,16)));
const strip = s => ent(s).replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
const redact = s => s.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[이메일 비공개]').replace(/\b(?:\+?82[-.\s]?)?0?1[016789][-.\s]?\d{3,4}[-.\s]?\d{4}\b/g,'[전화번호 비공개]').replace(/\b0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}\b/g,'[전화번호 비공개]').replace(/\b\d{6}[-\s]?[1-4]\d{6}\b/g,'[고유식별번호 비공개]').replace(/\b(?:\d[ -]*?){13,19}\b/g,'[카드번호 비공개]').replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g,'[IP 비공개]').replace(/(?:서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)[^\s,]{0,15}(?:로|길)\s?\d{1,4}(?:-\d{1,4})?/g,'[주소 비공개]').replace(/\s+/g,' ').trim();
const clean = (s,n=320)=>{const v=redact(strip(s));return v.length<=n?v:`${v.slice(0,n).replace(/\s+\S*$/,'')}…`;};
const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const tag = (block,name)=>(block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`,'i'))?.[1] ?? '').trim();
const src = block => {const m=block.match(/<source[^>]*url="([^"]*)"[^>]*>([\s\S]*?)<\/source>/i);return {name:m?clean(m[2],80):'Google News',url:m?ent(m[1]):''};};
const normTitle = s => clean(s,180).replace(/\s+-\s+[^-]{2,45}$/u,'').replace(/\s+/g,' ').trim();
const gUrl = q => `https://news.google.com/rss/search?q=${encodeURIComponent(`${q} when:2d`)}&hl=ko&gl=KR&ceid=KR:ko`;
function score(item){const age=Math.max(0,(Date.now()-new Date(item.publishedAt).getTime())/36e5||24);return Math.round(Math.max(0,60-age)+hotWords.reduce((a,w)=>a+(item.title.includes(w)?8:0),0)+(item.source.name!=='Google News'?5:0));}
async function get(url){const r=await fetch(url,{signal:AbortSignal.timeout(timeoutMs),headers:{'user-agent':'gorics-financial-newsbot/1.0'}});if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.text();}
function parse(xml,c){return [...xml.matchAll(/<item[\s\S]*?<\/item>/gi)].slice(0,perFeed).map(m=>{const block=m[0],rawDate=clean(tag(block,'pubDate'),80);const item={id:`${c.id}-${Buffer.from(`${tag(block,'title')}|${tag(block,'link')}`).toString('base64url').slice(0,14)}`,category:c.id,categoryName:c.name,categoryIcon:c.icon,title:normTitle(tag(block,'title')),description:clean(tag(block,'description'),430),url:ent(tag(block,'link')).trim(),source:src(block),publishedAt:Number.isNaN(Date.parse(rawDate))?new Date().toISOString():new Date(rawDate).toISOString(),guid:clean(tag(block,'guid'),220)};item.score=score(item);return item;}).filter(x=>x.title&&x.url);}
async function mapLimit(items,limit,fn){const results=new Array(items.length);let i=0;const workers=Array.from({length:Math.min(limit,items.length)},async()=>{while(i<items.length){const n=i++;try{results[n]={ok:true,value:await fn(items[n])};}catch(error){results[n]={ok:false,error};}}});await Promise.all(workers);return results;}
async function collect(){const byCategory=Object.fromEntries(categories.map(c=>[c.id,[]])),errors=[];const tasks=categories.flatMap(c=>c.queries.map(q=>({c,q})));const results=await mapLimit(tasks,concurrency,async({c,q})=>({c,q,items:parse(await get(gUrl(q)),c)}));for(let i=0;i<results.length;i++){const r=results[i],t=tasks[i];if(!r.ok)errors.push({category:t.c.id,query:t.q,message:r.error?.message??'unknown error'});else byCategory[r.value.c.id].push(...r.value.items);}const seen=new Set(),all=[];for(const c of categories){const unique=[];for(const item of byCategory[c.id].sort((a,b)=>b.score-a.score||new Date(b.publishedAt)-new Date(a.publishedAt))){const key=item.title.toLowerCase().replace(/[\s\W_]+/g,'');if(seen.has(key))continue;seen.add(key);unique.push(item);}byCategory[c.id]=unique.slice(0,perCategory);all.push(...byCategory[c.id]);}return {byCategory,allItems:all.sort((a,b)=>b.score-a.score||new Date(b.publishedAt)-new Date(a.publishedAt)).slice(0,totalLimit),errors};}
function feed(payload){return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>GORICS FINANCIAL NEWS</title><link>https://gorics.github.io/website/news/financial/</link><description>Privacy-redacted Korean financial news desk updated hourly.</description><lastBuildDate>${new Date(payload.generatedAt).toUTCString()}</lastBuildDate>${payload.allItems.slice(0,100).map(x=>`<item><title>${esc(x.title)}</title><link>${esc(x.url)}</link><guid>${esc(x.guid||x.url)}</guid><pubDate>${new Date(x.publishedAt).toUTCString()}</pubDate><category>${esc(x.categoryName)}</category><description>${esc(x.description)}</description></item>`).join('')}</channel></rss>`;}
const generatedAt=new Date().toISOString();
const {byCategory,allItems,errors}=await collect();
const payload={generatedAt,source:'Google News RSS search feeds; public financial metadata only',page:'financial',privacy:{policy:'No account, email, phone, resident ID, card number, IP address, or precise street-address patterns are intentionally published.',redaction:['email','phone','resident-registration-like number','card-like number','IP address','street-address-like pattern']},categories:categories.map(c=>({id:c.id,name:c.name,icon:c.icon,count:byCategory[c.id]?.length??0})),total:allItems.length,byCategory,allItems,errors};
await fs.mkdir(out,{recursive:true});
await fs.writeFile(`${out}/data.json`,`${JSON.stringify(payload,null,2)}\n`);
await fs.writeFile(`${out}/feed.xml`,feed(payload));
console.log(`Generated ${payload.total} financial news items. Feed errors: ${errors.length}`);
