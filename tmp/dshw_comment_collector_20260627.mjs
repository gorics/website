import fs from 'node:fs';
import { load } from 'cheerio';

const shardIndex = Number(process.env.SHARD_INDEX);
const shardCount = Number(process.env.SHARD_COUNT || 40);
const concurrency = Number(process.env.REQUEST_CONCURRENCY || 4);
const delayMs = Number(process.env.REQUEST_DELAY_MS || 450);
const inputPath = 'tmp/dshw_comment_continuation_retry2_20260627.csv';
const crawledAt = new Date().toISOString();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clean = (value) => String(value ?? '').replace(/\u00a0/g, ' ').replace(/\r\n/g, '\n').trim();
const csvCell = (value) => '"' + String(value ?? '').replaceAll('"', '""') + '"';

const commentHeaders = [
  'gallery_id','post_id','comment_id','parent_comment_id','mention_target_comment_id',
  'is_reply','comment_page','comment_order_in_page','raw_ch','author_display',
  'author_user_id','author_ip_fragment','created_at_display','recommend_count',
  'comment_text','comment_html','media_urls_json','raw_attrs_json','raw_row_html',
  'source_url','crawl_timestamp'
];
const statusHeaders = [
  'gallery_id','post_id','expected_comment_count','captured_comment_count',
  'request_pages','http_statuses_json','status','error','crawl_timestamp'
];

const lines = fs.readFileSync(inputPath, 'utf8').trim().split(/\r?\n/).slice(1);
const assigned = lines.map((line) => {
  const [postId, expected] = line.split(',');
  return { post_id: postId, expected_comment_count: Number(expected) || 0 };
}).filter((_, index) => index % shardCount === shardIndex);

async function requestPage(postId, page) {
  const sourceUrl = `https://m.dcinside.com/board/dshw/${postId}`;
  const form = new URLSearchParams({
    id: 'dshw', no: postId, cpage: String(page), managerskill: '', del_scope: '1', csort: ''
  });
  let last = { status: 0, text: '', error: '' };
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30000);
      const response = await fetch('https://m.dcinside.com/ajax/response-comment', {
        method: 'POST', signal: controller.signal,
        headers: {
          'user-agent': 'Mozilla/5.0 (Linux; Android 13; SM-S918N) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36',
          'accept': '*/*', 'accept-language': 'ko-KR,ko;q=0.9',
          'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'x-requested-with': 'XMLHttpRequest', 'referer': sourceUrl,
        }, body: form,
      });
      clearTimeout(timer);
      last = { status: response.status, text: await response.text(), error: '' };
      if (response.ok) return last;
    } catch (error) {
      last = { status: 0, text: '', error: error?.name || String(error) };
    }
    await sleep(1200 * attempt);
  }
  return last;
}

function parseRows(html, postId, page) {
  const $ = load(html, { decodeEntities: false });
  let rows = $('li[no], li[data-no], li[data-cno]');
  if (!rows.length) rows = $('li').filter((_, element) => /comment|reply|cmt/i.test($(element).attr('class') || ''));
  return rows.map((index, element) => {
    const row = $(element);
    const content = row.find('p.txt, .comment_txt, .cmt_txtbox, .usertxt').first();
    const author = row.find('.ginfo-area .nick, .nick, .nickname, .us-nick').first();
    const ipText = clean(row.find('.ginfo-area .ip, .ip, .blockCommentIp').first().text());
    const commentHtml = content.html() || '';
    const mention = commentHtml.match(/mntFocus\((\d+)/)?.[1] || '';
    const media = [];
    content.find('img,iframe,video,audio,source').each((_, mediaEl) => {
      const mediaNode = $(mediaEl);
      const url = mediaNode.attr('data-original') || mediaNode.attr('src') || '';
      if (url) media.push(url.startsWith('//') ? `https:${url}` : url);
    });
    const attrs = element.attribs || {};
    return {
      gallery_id: 'dshw', post_id: postId,
      comment_id: attrs.no || attrs['data-no'] || attrs['data-cno'] || '',
      parent_comment_id: attrs.parent || attrs['data-parent'] || attrs.p_no || '',
      mention_target_comment_id: mention,
      is_reply: /comment-add|reply/i.test(attrs.class || '') ? '1' : '0',
      comment_page: String(page), comment_order_in_page: String(index + 1),
      raw_ch: attrs.ch || '', author_display: clean(author.text()),
      author_user_id: author.attr('data-info') || author.attr('data-uid') || row.find('[data-info]').first().attr('data-info') || '',
      author_ip_fragment: ipText.replace(/^\(|\)$/g, ''),
      created_at_display: clean(row.find('.date, .date_time, .cmt_date').first().text()),
      recommend_count: clean(row.find('.recom-num, .cmt_recommend, .up_num').first().text()),
      comment_text: clean(content.text()), comment_html: commentHtml,
      media_urls_json: JSON.stringify([...new Set(media)]),
      raw_attrs_json: JSON.stringify(attrs), raw_row_html: $.html(element),
      source_url: `https://m.dcinside.com/board/dshw/${postId}`,
      crawl_timestamp: crawledAt,
    };
  }).get().filter((row) => row.comment_id || row.comment_text || row.author_display);
}

const comments = [];
const statuses = [];
let nextIndex = 0;
async function collectPost(input) {
  const byId = new Map();
  const httpStatuses = [];
  let error = '';
  let pages = 0;
  for (let page = 1; page <= 100; page += 1) {
    const response = await requestPage(input.post_id, page);
    pages += 1;
    httpStatuses.push(response.status);
    if (!response.text || response.status >= 400) {
      if (page === 1 && input.expected_comment_count > 0) error = response.error || `http_${response.status}`;
      break;
    }
    const parsed = parseRows(response.text, input.post_id, page);
    let newIds = 0;
    for (const row of parsed) {
      const key = row.comment_id || `${page}:${row.comment_order_in_page}:${row.comment_text}`;
      if (!byId.has(key)) { byId.set(key, row); newIds += 1; }
    }
    if (!parsed.length || !newIds || parsed.length < 100) break;
    await sleep(delayMs);
  }
  const records = [...byId.values()];
  comments.push(...records);
  const captured = records.length;
  let status = captured ? 'captured' : 'none';
  if (error) status = 'error';
  else if (input.expected_comment_count > captured) status = 'short_of_displayed_count';
  else if (input.expected_comment_count !== captured) status = 'count_changed';
  statuses.push({
    gallery_id: 'dshw', post_id: input.post_id,
    expected_comment_count: String(input.expected_comment_count),
    captured_comment_count: String(captured), request_pages: String(pages),
    http_statuses_json: JSON.stringify(httpStatuses), status, error,
    crawl_timestamp: crawledAt,
  });
}

async function worker(workerId) {
  while (nextIndex < assigned.length) {
    const index = nextIndex++;
    await collectPost(assigned[index]);
    if (statuses.length % 100 === 0) console.log(`shard=${shardIndex} posts=${statuses.length}/${assigned.length} comments=${comments.length}`);
    await sleep(delayMs + workerId * 60);
  }
}

await Promise.all(Array.from({ length: concurrency }, (_, index) => worker(index)));
const writeCsv = (headers, rows) => '\ufeff' + headers.join(',') + '\n' + rows.map((row) => headers.map((header) => csvCell(row[header])).join(',')).join('\n') + '\n';
fs.writeFileSync(`dshw_comments_${shardIndex}.csv`, writeCsv(commentHeaders, comments));
fs.writeFileSync(`dshw_comment_status_${shardIndex}.csv`, writeCsv(statusHeaders, statuses));
const log = {
  shard_index: shardIndex, shard_count: shardCount, assigned_posts: assigned.length,
  posts_with_expected_comments: assigned.filter((row) => row.expected_comment_count > 0).length,
  expected_comment_total: assigned.reduce((sum, row) => sum + row.expected_comment_count, 0),
  captured_comment_rows: comments.length,
  status_counts: Object.fromEntries([...new Set(statuses.map((row) => row.status))].map((status) => [status, statuses.filter((row) => row.status === status).length])),
  started_at: crawledAt, ended_at: new Date().toISOString(),
};
fs.writeFileSync(`dshw_comment_log_${shardIndex}.json`, JSON.stringify(log, null, 2));
console.log(JSON.stringify(log, null, 2));
