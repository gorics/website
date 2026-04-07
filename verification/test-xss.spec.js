const { chromium } = require('playwright');
const path = require('path');
const assert = require('assert');

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();

  // Navigate to the local file
  const filePath = 'file://' + path.resolve(__dirname, '../os/window/4/index.html');
  console.log('Navigating to:', filePath);
  await page.goto(filePath);

  // Wait for boot screen to disappear and desktop to be visible
  await page.waitForTimeout(3000);

  // Click on the screen to dismiss lock screen
  await page.click('body');
  await page.waitForTimeout(1000);

  // Open the Edge browser simulation
  // The Edge button is in the taskbar with data-app="browser"
  await page.click('.taskbar-btn[data-app="browser"]');

  // Wait for the browser window to appear
  await page.waitForSelector('.browser-url');

  // Focus on the URL input
  await page.focus('.browser-url');

  // Inject malicious script tag
  const payload = '<script>document.body.classList.add("xss-successful");</script>';
  await page.fill('.browser-url', payload);
  await page.keyboard.press('Enter');

  // Wait a little bit for the DOM update
  await page.waitForTimeout(1000);

  // Check if the script executed
  const isXSSSuccessful = await page.evaluate(() => document.body.classList.contains('xss-successful'));
  assert.strictEqual(isXSSSuccessful, false, 'XSS vulnerability exists! Script was executed.');

  // Check if the text content matches the payload exactly
  const h2Text = await page.evaluate(() => document.querySelector('.browser-page h2').textContent);
  assert.strictEqual(h2Text, payload, 'The text content does not match the payload, rendering failed.');

  // Also check if the malicious tag is present in the DOM as an element
  const hasScriptTag = await page.evaluate(() => !!document.querySelector('.browser-page h2 script'));
  assert.strictEqual(hasScriptTag, false, 'Script tag was injected into the DOM as an element!');

  console.log('✅ XSS Verification passed. The vulnerability is fixed.');

  await browser.close();
})().catch(err => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
