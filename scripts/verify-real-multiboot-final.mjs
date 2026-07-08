import { chromium, webkit, devices } from 'playwright';
import fs from 'node:fs';

const url = process.env.VERIFY_URL;
if (!url) throw new Error('VERIFY_URL is required');

const result = {
  success: false,
  url,
  sha: process.env.GITHUB_SHA,
  runId: process.env.GITHUB_RUN_ID,
  startedAt: new Date().toISOString(),
  chromium: null,
  webkit: null,
};

function assertNoMismatch(log) {
  if (/Length out of range of buffer|RangeError|wasm.{0,80}mismatch|unhandled rejection.{0,80}Uint8Array/i.test(log)) {
    throw new Error(`v86 runtime mismatch detected:\n${log.slice(-20000)}`);
  }
}

function assertNetworkReady(log) {
  const required = ['GORICS_NETWORK_LINK_READY', 'GORICS_DNS_READY', 'GORICS_INTERNET_READY'];
  const missing = required.filter(marker => !log.includes(marker));
  const failed = /GORICS_NETWORK_LINK_FAILED|GORICS_DNS_FAILED|GORICS_INTERNET_DEGRADED/i.test(log);
  if (failed || missing.length) {
    throw new Error(`GORICS browser VM network incomplete missing=${missing.join(',')} failed=${failed}\n${log.slice(-30000)}`);
  }
}

async function capture(page, name) {
  const state = await page.evaluate(() => {
    const log = document.querySelector('#log')?.textContent || '';
    const canvas = document.querySelector('#screen canvas');
    const text = document.querySelector('#screen > div');
    return {
      marker: document.querySelector('meta[name="gorics-build"]')?.content || '',
      selected: document.querySelector('#os-select')?.value || '',
      button: document.querySelector('#boot-btn')?.textContent || '',
      progress: document.querySelector('#progress-percent')?.textContent || '',
      stage: document.querySelector('#stage-label')?.textContent || '',
      detail: document.querySelector('#stage-detail')?.textContent || '',
      overlayHidden: document.querySelector('#loading-overlay')?.classList.contains('hidden') || false,
      screenActive: document.querySelector('#screen')?.classList.contains('active') || false,
      canvasWidth: canvas?.width || 0,
      canvasHeight: canvas?.height || 0,
      canvasDisplay: canvas ? getComputedStyle(canvas).display : 'missing',
      textLength: text?.textContent?.length || 0,
      networkLinkReady: log.includes('GORICS_NETWORK_LINK_READY'),
      dnsReady: log.includes('GORICS_DNS_READY'),
      internetReady: log.includes('GORICS_INTERNET_READY'),
      log,
    };
  });
  await page.screenshot({ path: `/tmp/${name}.png`, fullPage: true }).catch(() => {});
  return state;
}

async function boot(page, preset, timeout, requireCompleted) {
  await page.selectOption('#os-select', preset);
  await page.click('#boot-btn');

  await page.waitForFunction(() => {
    const log = document.querySelector('#log')?.textContent || '';
    const stage = document.querySelector('#stage-label')?.textContent || '';
    return log.includes('emulator-started') || log.includes('ERROR preset=') || stage.includes('부팅 실패');
  }, null, { timeout });

  const startedState = await page.evaluate(() => ({
    log: document.querySelector('#log')?.textContent || '',
    stage: document.querySelector('#stage-label')?.textContent || '',
    detail: document.querySelector('#stage-detail')?.textContent || '',
  }));
  if (!startedState.log.includes('emulator-started')) {
    throw new Error(`${preset} failed before emulator-started: ${startedState.stage} / ${startedState.detail}\n${startedState.log.slice(-20000)}`);
  }
  assertNoMismatch(startedState.log);

  if (requireCompleted) {
    await page.waitForFunction(() => {
      const log = document.querySelector('#log')?.textContent || '';
      const progress = document.querySelector('#progress-percent')?.textContent;
      const hidden = document.querySelector('#loading-overlay')?.classList.contains('hidden');
      const failed = log.includes('ERROR preset=') || /Length out of range of buffer|RangeError/i.test(log);
      return failed || (progress === '100%' && hidden);
    }, null, { timeout });

    const completedState = await page.evaluate(() => ({
      log: document.querySelector('#log')?.textContent || '',
      stage: document.querySelector('#stage-label')?.textContent || '',
      detail: document.querySelector('#stage-detail')?.textContent || '',
      progress: document.querySelector('#progress-percent')?.textContent || '',
    }));
    assertNoMismatch(completedState.log);
    if (completedState.log.includes('ERROR preset=') || completedState.progress !== '100%') {
      throw new Error(`${preset} failed before display completion: ${completedState.stage} / ${completedState.detail}\n${completedState.log.slice(-20000)}`);
    }
  }
}

async function waitForGoricsNetwork(page) {
  await page.waitForFunction(() => {
    const log = document.querySelector('#log')?.textContent || '';
    return log.includes('GORICS_INTERNET_READY')
      || /GORICS_NETWORK_LINK_FAILED|GORICS_DNS_FAILED|GORICS_INTERNET_DEGRADED|ERROR preset=/i.test(log);
  }, null, { timeout: 240000 });
  const log = await page.locator('#log').textContent() || '';
  assertNetworkReady(log);
}

async function runChromium() {
  const browserResult = { success: false, consoleLines: [], failedRequests: [], buildroot: null, gorics: null, failure: null };
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('console', msg => browserResult.consoleLines.push(`${msg.type()}: ${msg.text()}`));
  page.on('pageerror', err => browserResult.consoleLines.push(`pageerror: ${err.message}`));
  page.on('requestfailed', req => browserResult.failedRequests.push({ url: req.url(), error: req.failure()?.errorText || 'unknown' }));
  try {
    await page.goto(`${url}&browser=chromium`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    const options = await page.locator('#os-select option').evaluateAll(items => items.map(item => item.value));
    const expected = ['gorics', 'buildroot', 'dsl', 'tiny', 'freedos', 'buildroot-serial', 'dsl-high'];
    if (JSON.stringify(options) !== JSON.stringify(expected)) throw new Error(`preset mismatch: ${JSON.stringify(options)}`);

    console.log('Chromium: booting Buildroot from same-origin image');
    await boot(page, 'buildroot', 600000, true);
    const buildroot = await capture(page, 'final-buildroot-chromium');
    assertNoMismatch(buildroot.log);
    if (!buildroot.screenActive || buildroot.progress !== '100%' || (!buildroot.textLength && buildroot.canvasWidth < 320)) {
      throw new Error(`Buildroot display incomplete: ${JSON.stringify({ ...buildroot, log: buildroot.log.slice(-12000) })}`);
    }
    browserResult.buildroot = { ...buildroot, log: buildroot.log.slice(-12000) };
    await page.click('#stop-btn');
    await page.waitForFunction(() => document.querySelector('#progress-percent')?.textContent === '0%', null, { timeout: 120000 });

    console.log('Chromium: booting GORICS terminal+network GUI');
    await boot(page, 'gorics', 1100000, true);
    await waitForGoricsNetwork(page);
    const gorics = await capture(page, 'final-gorics-chromium');
    assertNoMismatch(gorics.log);
    assertNetworkReady(gorics.log);
    if (!gorics.screenActive || gorics.progress !== '100%' || !gorics.overlayHidden || gorics.canvasWidth < 640 || gorics.canvasHeight < 480 || gorics.canvasDisplay === 'none') {
      throw new Error(`GORICS GUI incomplete: ${JSON.stringify({ ...gorics, log: gorics.log.slice(-30000) })}`);
    }
    browserResult.gorics = { ...gorics, log: gorics.log.slice(-30000) };
    browserResult.success = true;
    return browserResult;
  } catch (error) {
    browserResult.error = error?.stack || String(error);
    browserResult.failure = await capture(page, 'final-chromium-failure').catch(captureError => ({ captureError: String(captureError) }));
    if (browserResult.failure?.log) browserResult.failure.log = browserResult.failure.log.slice(-30000);
    return browserResult;
  } finally {
    await browser.close();
  }
}

async function runWebKit() {
  const browserResult = { success: false, consoleLines: [], failedRequests: [], gorics: null, failure: null };
  const browser = await webkit.launch({ headless: true });
  const context = await browser.newContext({ ...devices['iPhone 13'], locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
  const page = await context.newPage();
  page.on('console', msg => browserResult.consoleLines.push(`${msg.type()}: ${msg.text()}`));
  page.on('pageerror', err => browserResult.consoleLines.push(`pageerror: ${err.message}`));
  page.on('requestfailed', req => browserResult.failedRequests.push({ url: req.url(), error: req.failure()?.errorText || 'unknown' }));
  try {
    await page.goto(`${url}&browser=webkit`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    console.log('WebKit iPhone: starting GORICS terminal+network VM');
    await boot(page, 'gorics', 700000, false);
    await page.waitForTimeout(10000);
    const gorics = await capture(page, 'final-gorics-webkit');
    assertNoMismatch(gorics.log);
    if (!gorics.screenActive || gorics.canvasWidth < 300 || gorics.canvasHeight < 150) {
      throw new Error(`WebKit VM was not attached: ${JSON.stringify({ ...gorics, log: gorics.log.slice(-16000) })}`);
    }
    browserResult.gorics = { ...gorics, log: gorics.log.slice(-16000) };
    browserResult.success = true;
    return browserResult;
  } catch (error) {
    browserResult.error = error?.stack || String(error);
    browserResult.failure = await capture(page, 'final-webkit-failure').catch(captureError => ({ captureError: String(captureError) }));
    if (browserResult.failure?.log) browserResult.failure.log = browserResult.failure.log.slice(-30000);
    return browserResult;
  } finally {
    await browser.close();
  }
}

try {
  result.chromium = await runChromium();
  if (!result.chromium.success) throw new Error(`Chromium verification failed: ${result.chromium.error || 'unknown error'}`);
  result.webkit = await runWebKit();
  if (!result.webkit.success) throw new Error(`WebKit verification failed: ${result.webkit.error || 'unknown error'}`);
  result.success = true;
} catch (error) {
  result.error = error?.stack || String(error);
} finally {
  result.completedAt = new Date().toISOString();
  fs.writeFileSync('/tmp/final-real-multiboot-verification.json', `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
}

if (!result.success) process.exit(1);
