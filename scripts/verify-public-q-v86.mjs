import { chromium } from 'playwright';
import fs from 'node:fs';

const target = process.env.TARGET_URL;
const startedAt = Date.now();
const result = {
  run_id: process.env.GITHUB_RUN_ID,
  target,
  started_at: new Date().toISOString(),
  success: false,
  gui_ready: false,
  xorg_ready: false,
  emulator_started: false,
  graphical_canvas: false,
  screen_sizes: [],
  console: [],
  page_errors: [],
  failed_requests: [],
  log_tail: '',
};

fs.mkdirSync('browser-proof', { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: [
    '--disable-dev-shm-usage',
    '--no-sandbox',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--js-flags=--max-old-space-size=2048',
  ],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
page.setDefaultTimeout(120_000);
page.on('console', (message) => {
  const text = `${message.type()}: ${message.text()}`;
  result.console.push(text);
  if (result.console.length > 1000) result.console.shift();
  console.log('[browser]', text);
});
page.on('pageerror', (error) => {
  result.page_errors.push(String(error));
  console.error('[pageerror]', error);
});
page.on('requestfailed', (request) => {
  const text = `${request.url()} :: ${request.failure()?.errorText || 'failed'}`;
  result.failed_requests.push(text);
  if (result.failed_requests.length > 500) result.failed_requests.shift();
  console.error('[requestfailed]', text);
});

try {
  const response = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  result.page_http = response?.status() || null;
  await page.waitForSelector('#boot-btn', { timeout: 60_000 });
  const initial = await page.locator('#log').innerText();
  if (!initial.includes('page. q')) throw new Error(`unexpected public version: ${initial}`);
  await page.screenshot({ path: 'browser-proof/00-page-q.png', fullPage: true });
  await page.click('#boot-btn');

  let lastScreenshot = 0;
  let previousLog = '';
  const deadline = Date.now() + 18 * 60_000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(5000);
    const log = await page.locator('#log').innerText().catch(() => '');
    result.log_tail = log.slice(-30_000);
    if (log !== previousLog) {
      console.log('--- LOG TAIL ---\n' + log.slice(-5000));
      previousLog = log;
    }
    if (log.includes('emulator-started')) result.emulator_started = true;
    if (log.includes('GORICS_XORG_READY')) result.xorg_ready = true;
    if (log.includes('GORICS_WEB_GUI_READY')) result.gui_ready = true;

    const details = await page.evaluate(() => {
      const canvas = document.querySelector('#screen canvas');
      const text = document.querySelector('#screen > div');
      const screen = document.querySelector('#screen');
      return {
        canvas_width: canvas?.width || 0,
        canvas_height: canvas?.height || 0,
        canvas_display: canvas ? getComputedStyle(canvas).display : 'missing',
        text_display: text ? getComputedStyle(text).display : 'missing',
        screen_active: screen?.classList.contains('active') || false,
      };
    });
    result.canvas = details;
    result.graphical_canvas = details.canvas_width >= 640
      && details.canvas_height >= 480
      && details.canvas_display !== 'none'
      && details.text_display === 'none';

    const matches = [...log.matchAll(/screen-set-size\s+(\[[^\n]+\])/g)].map((match) => match[1]);
    result.screen_sizes = [...new Set(matches)].slice(-20);

    if (result.gui_ready && result.xorg_ready && result.emulator_started && result.graphical_canvas) {
      result.success = true;
      break;
    }
    if (/ERROR |download-error|GORICS_WEB_GUI_FAILED|GORICS_XORG_FAILED|GORICS_XORG_TIMEOUT/.test(log)) {
      throw new Error('fatal marker in browser log');
    }
    const elapsed = Date.now() - startedAt;
    if (elapsed - lastScreenshot >= 120_000) {
      lastScreenshot = elapsed;
      await page.screenshot({ path: `browser-proof/progress-${Math.floor(elapsed / 1000)}s.png`, fullPage: true });
    }
  }
  if (!result.success) throw new Error('public q graphical Openbox readiness timeout');
  await page.waitForTimeout(30_000);
  await page.screenshot({ path: 'browser-proof/99-openbox-ready.png', fullPage: true });
  const canvas = page.locator('#screen canvas');
  if (await canvas.count()) {
    await canvas.screenshot({ path: 'browser-proof/99-screen-canvas.png' }).catch(() => {});
  }
} catch (error) {
  result.error = String(error?.stack || error);
  await page.screenshot({ path: 'browser-proof/99-failure.png', fullPage: true }).catch(() => {});
} finally {
  result.finished_at = new Date().toISOString();
  result.duration_seconds = Math.round((Date.now() - startedAt) / 1000);
  fs.writeFileSync('browser-proof/result.json', JSON.stringify(result, null, 2) + '\n');
  fs.writeFileSync('browser-proof/log.txt', result.log_tail || '');
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
}

if (!result.success) process.exit(1);
