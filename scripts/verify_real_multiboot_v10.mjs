import { chromium } from 'playwright';
import fs from 'node:fs';

const target = process.env.TARGET_URL;
if (!target) throw new Error('TARGET_URL is required');
const proof = '/tmp/real-multiboot-v10-proof';
const startedAt = Date.now();
fs.mkdirSync(proof, { recursive: true });

const result = {
  version: 'v10',
  run_id: process.env.GITHUB_RUN_ID,
  target,
  started_at: new Date().toISOString(),
  success: false,
  responsive: {},
  emulator_started: false,
  xorg_ready: false,
  mapped_window_ready: false,
  gui_ready: false,
  graphical_canvas: false,
  pixel_content_ready: false,
  overlay_hidden: false,
  controls_ready: false,
  completion_logged: false,
  console: [],
  page_errors: [],
  failed_requests: [],
  log_tail: '',
};

const browser = await chromium.launch({
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--js-flags=--max-old-space-size=2048',
  ],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const page = await context.newPage();
page.setDefaultTimeout(120000);
page.on('console', message => {
  const line = `${message.type()}: ${message.text()}`;
  result.console.push(line);
  if (result.console.length > 1800) result.console.shift();
  console.log('[browser]', line);
});
page.on('pageerror', error => result.page_errors.push(String(error)));
page.on('requestfailed', request => {
  const line = `${request.url()} :: ${request.failure()?.errorText || 'failed'}`;
  result.failed_requests.push(line);
  if (result.failed_requests.length > 800) result.failed_requests.shift();
});

function hasFatalMarker(log) {
  return /ERROR preset=|GORICS_WEB_GUI_FAILED|GORICS_XORG_FAILED|GORICS_XORG_TIMEOUT|download-error/.test(log);
}

try {
  for (const width of [320, 375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
    await page.goto(`${target}&layout=${width}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForSelector('#boot-btn:not([disabled])');
    const layout = await page.evaluate(() => {
      const box = selector => {
        const node = document.querySelector(selector);
        if (!node) return null;
        const rect = node.getBoundingClientRect();
        return { left: rect.left, right: rect.right, width: rect.width };
      };
      return {
        viewport: innerWidth,
        scroll_width: document.documentElement.scrollWidth,
        app: box('.iso-app'),
        panel: box('.control-panel'),
        screen: box('#screen-wrap'),
        log_panel: box('.log-panel'),
        boot_visible: Boolean(document.querySelector('#boot-btn')?.offsetParent),
      };
    });
    layout.pass = layout.boot_visible
      && layout.scroll_width <= layout.viewport + 2
      && layout.app?.left >= -1
      && layout.app?.right <= layout.viewport + 1
      && layout.panel?.right <= layout.viewport + 1
      && layout.screen?.right <= layout.viewport + 1
      && layout.log_panel?.right <= layout.viewport + 1;
    result.responsive[String(width)] = layout;
    await page.screenshot({ path: `${proof}/layout-${width}.png`, fullPage: true });
    if (!layout.pass) throw new Error(`responsive layout failed at ${width}px`);
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${target}&boot=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('#boot-btn:not([disabled])');
  await page.screenshot({ path: `${proof}/00-before-boot.png`, fullPage: true });
  await page.click('#boot-btn');

  let lastProgressShot = 0;
  const deadline = Date.now() + 22 * 60_000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(3000);
    const log = await page.locator('#log').innerText().catch(() => '');
    result.log_tail = log.slice(-70000);
    result.emulator_started ||= log.includes('emulator-started');
    result.xorg_ready ||= log.includes('GORICS_XORG_READY');
    result.mapped_window_ready ||= log.includes('GORICS_VISIBLE_WINDOW_READY');
    result.gui_ready ||= log.includes('GORICS_WEB_GUI_READY');
    result.completion_logged ||= log.includes('display completion trigger=') && log.includes('display ready preset=gorics');

    const ui = await page.evaluate(() => {
      const canvas = document.querySelector('#screen canvas');
      const text = document.querySelector('#screen > div');
      const overlay = document.querySelector('#loading-overlay');
      const overlayStyle = overlay ? getComputedStyle(overlay) : null;
      let pixels = {
        sample_count: 0,
        unique_colors: 0,
        dominant_ratio: 1,
        non_dominant_ratio: 0,
        min_luma: 255,
        max_luma: 0,
        luma_range: 0,
      };
      if (canvas?.width >= 640 && canvas?.height >= 480) {
        try {
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          const image = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          const counts = new Map();
          let minLuma = 255;
          let maxLuma = 0;
          let total = 0;
          for (let y = 0; y < canvas.height; y += 8) {
            for (let x = 0; x < canvas.width; x += 8) {
              const i = (y * canvas.width + x) * 4;
              const r = image[i];
              const g = image[i + 1];
              const b = image[i + 2];
              const key = `${r},${g},${b}`;
              counts.set(key, (counts.get(key) || 0) + 1);
              const luma = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
              minLuma = Math.min(minLuma, luma);
              maxLuma = Math.max(maxLuma, luma);
              total += 1;
            }
          }
          const dominant = Math.max(0, ...counts.values());
          pixels = {
            sample_count: total,
            unique_colors: counts.size,
            dominant_ratio: total ? dominant / total : 1,
            non_dominant_ratio: total ? 1 - dominant / total : 0,
            min_luma: minLuma,
            max_luma: maxLuma,
            luma_range: maxLuma - minLuma,
          };
        } catch (error) {
          pixels.error = String(error);
        }
      }
      return {
        canvas_width: canvas?.width || 0,
        canvas_height: canvas?.height || 0,
        canvas_display: canvas ? getComputedStyle(canvas).display : 'missing',
        text_display: text ? getComputedStyle(text).display : 'missing',
        screen_active: document.querySelector('#screen')?.classList.contains('active') || false,
        overlay_class_hidden: overlay?.classList.contains('hidden') || false,
        overlay_aria_hidden: overlay?.getAttribute('aria-hidden') === 'true',
        overlay_visibility: overlayStyle?.visibility || 'missing',
        overlay_opacity: Number(overlayStyle?.opacity ?? 1),
        overlay_pointer_events: overlayStyle?.pointerEvents || 'missing',
        progress: document.querySelector('#progress-percent')?.textContent || '',
        overlay_progress: document.querySelector('#overlay-percent')?.textContent || '',
        stage: document.querySelector('#stage-label')?.textContent || '',
        boot_text: document.querySelector('#boot-btn')?.textContent?.trim() || '',
        boot_disabled: document.querySelector('#boot-btn')?.disabled ?? true,
        keyboard_disabled: document.querySelector('#keyboard-btn')?.disabled ?? true,
        stop_disabled: document.querySelector('#stop-btn')?.disabled ?? true,
        select_disabled: document.querySelector('#os-select')?.disabled ?? false,
        pixels,
      };
    });
    result.ui = ui;
    result.graphical_canvas = ui.canvas_width >= 640
      && ui.canvas_height >= 480
      && ui.canvas_display !== 'none'
      && ui.text_display === 'none'
      && ui.screen_active;
    result.pixel_content_ready = ui.pixels.unique_colors >= 12
      && ui.pixels.luma_range >= 80
      && ui.pixels.non_dominant_ratio >= 0.05
      && ui.pixels.dominant_ratio <= 0.95;
    result.overlay_hidden = ui.overlay_class_hidden
      && ui.overlay_aria_hidden
      && ui.overlay_visibility === 'hidden'
      && ui.overlay_opacity <= 0.01
      && ui.overlay_pointer_events === 'none';
    result.controls_ready = ui.progress === '100%'
      && ui.overlay_progress === '100%'
      && ui.stage.includes('화면 출력 완료')
      && ui.boot_text === '실행 중'
      && !ui.boot_disabled
      && !ui.keyboard_disabled
      && !ui.stop_disabled
      && ui.select_disabled;

    if (result.emulator_started
        && result.xorg_ready
        && result.mapped_window_ready
        && result.gui_ready
        && result.graphical_canvas
        && result.pixel_content_ready
        && result.overlay_hidden
        && result.controls_ready
        && result.completion_logged) {
      result.success = true;
      break;
    }
    if (hasFatalMarker(log)) throw new Error('fatal marker in browser log');
    const elapsed = Date.now() - startedAt;
    if (elapsed - lastProgressShot >= 120000) {
      lastProgressShot = elapsed;
      await page.screenshot({ path: `${proof}/progress-${Math.floor(elapsed / 1000)}s.png`, fullPage: true });
    }
  }

  if (!result.success) throw new Error(`visible desktop timeout: ${JSON.stringify(result.ui)}`);
  await page.waitForTimeout(8000);
  const stable = await page.evaluate(() => {
    const canvas = document.querySelector('#screen canvas');
    const overlay = document.querySelector('#loading-overlay');
    const style = overlay ? getComputedStyle(overlay) : null;
    return {
      canvas_width: canvas?.width || 0,
      canvas_height: canvas?.height || 0,
      hidden: overlay?.classList.contains('hidden') || false,
      aria_hidden: overlay?.getAttribute('aria-hidden') === 'true',
      visibility: style?.visibility || 'missing',
      opacity: Number(style?.opacity ?? 1),
      progress: document.querySelector('#progress-percent')?.textContent || '',
      boot_text: document.querySelector('#boot-btn')?.textContent?.trim() || '',
    };
  });
  result.stable_after_8s = stable;
  if (!(stable.hidden && stable.aria_hidden && stable.visibility === 'hidden'
      && stable.opacity <= 0.01 && stable.progress === '100%' && stable.boot_text === '실행 중')) {
    throw new Error(`completion state unstable: ${JSON.stringify(stable)}`);
  }
  await page.screenshot({ path: `${proof}/99-visible-desktop.png`, fullPage: true });
  const canvas = page.locator('#screen canvas');
  if (await canvas.count()) await canvas.screenshot({ path: `${proof}/99-screen-canvas.png` });
} catch (error) {
  result.error = String(error?.stack || error);
  await page.screenshot({ path: `${proof}/99-failure.png`, fullPage: true }).catch(() => {});
} finally {
  result.finished_at = new Date().toISOString();
  result.duration_seconds = Math.round((Date.now() - startedAt) / 1000);
  fs.writeFileSync(`${proof}/result.json`, JSON.stringify(result, null, 2) + '\n');
  fs.writeFileSync(`${proof}/log.txt`, result.log_tail || '');
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
}

if (!result.success) process.exit(1);
