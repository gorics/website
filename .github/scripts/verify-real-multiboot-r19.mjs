import fs from 'node:fs';

const resultPath = process.env.RESULT_PATH || '/tmp/real-multiboot-r19.json';
const screenshotPath = process.env.SCREENSHOT_PATH || '/tmp/real-multiboot-r19.png';
const verifyUrl = process.env.VERIFY_URL;
const result = {
  success: false,
  state: 'initializing',
  version: '20260710-r19-stability',
  run_id: process.env.GITHUB_RUN_ID || null,
  workflow_sha: process.env.GITHUB_SHA || null,
  url: verifyUrl || null,
  architecture: 'i386',
  desktop: 'openbox-tint2-pcmanfm-xterm-visible-r12',
  emulator_started: false,
  xorg_ready: false,
  gui_ready: false,
  graphical_canvas: false,
  console: [],
  failed_requests: [],
  started_at: new Date().toISOString(),
};

let browser;
let page;

function persist() {
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
}

try {
  if (!verifyUrl) throw new Error('VERIFY_URL is missing');
  const { chromium } = await import('playwright');
  result.state = 'browser-launching';
  browser = await chromium.launch({
    headless: true,
    args: ['--disable-dev-shm-usage', '--no-sandbox', '--disable-gpu'],
  });
  page = await browser.newPage({
    viewport: { width: 412, height: 915 },
    userAgent: 'Mozilla/5.0 (Linux; Android 15; GORICS-R19-Verifier-V2) AppleWebKit/537.36 Chrome/149 Mobile Safari/537.36',
  });
  page.setDefaultTimeout(120000);
  page.on('console', message => result.console.push(`${message.type()}: ${message.text()}`));
  page.on('pageerror', error => result.console.push(`pageerror: ${error.message}`));
  page.on('requestfailed', request => result.failed_requests.push({
    url: request.url(),
    error: request.failure()?.errorText || 'unknown',
  }));

  result.state = 'page-loading';
  await page.goto(verifyUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('#boot-btn:not([disabled])', { timeout: 120000 });
  result.state = 'boot-requested';
  await page.click('#boot-btn');

  await page.waitForFunction(() => /emulator-started/.test(document.querySelector('#log')?.textContent || ''), null, { timeout: 600000 });
  result.emulator_started = true;
  result.state = 'emulator-started';
  persist();

  await page.waitForFunction(() => {
    const canvas = document.querySelector('#screen canvas');
    const running = document.querySelector('#boot-btn')?.textContent?.includes('실행 중');
    return Boolean(running && canvas && canvas.width >= 640 && canvas.height >= 480 && getComputedStyle(canvas).display !== 'none');
  }, null, { timeout: 900000 });
  await page.waitForTimeout(5000);

  const details = await page.evaluate(() => {
    const canvas = document.querySelector('#screen canvas');
    const log = document.querySelector('#log')?.textContent || '';
    return {
      canvas_width: canvas?.width || 0,
      canvas_height: canvas?.height || 0,
      canvas_display: canvas ? getComputedStyle(canvas).display : 'missing',
      boot_button_text: document.querySelector('#boot-btn')?.textContent || '',
      pointer_geometry: document.querySelector('#screen')?.dataset.pointerGeometry || null,
      stage_label: document.querySelector('#stage-label')?.textContent || '',
      stage_detail: document.querySelector('#stage-detail')?.textContent || '',
      log_tail: log.split('\n').slice(-220),
    };
  });

  const graphical = details.canvas_width >= 640
    && details.canvas_height >= 480
    && details.canvas_display !== 'none'
    && details.boot_button_text.includes('실행 중');
  Object.assign(result, details, {
    success: graphical,
    state: graphical ? 'completed' : 'display-incomplete',
    xorg_ready: graphical,
    gui_ready: graphical,
    graphical_canvas: graphical,
    screen_sizes: [`[${details.canvas_width},${details.canvas_height},32]`],
    completed_at: new Date().toISOString(),
  });
  await page.screenshot({ path: screenshotPath, fullPage: true });
} catch (error) {
  result.state = 'failed';
  result.error = error?.stack || String(error);
  result.completed_at = new Date().toISOString();
  if (page) {
    const log = await page.locator('#log').textContent().catch(() => '');
    result.log_tail = (log || '').split('\n').slice(-260);
    result.page_url = page.url();
    result.stage_label = await page.locator('#stage-label').textContent().catch(() => '');
    result.stage_detail = await page.locator('#stage-detail').textContent().catch(() => '');
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
  }
} finally {
  await browser?.close().catch(() => {});
  persist();
  console.log(JSON.stringify(result, null, 2));
}

if (!result.success) process.exit(1);
