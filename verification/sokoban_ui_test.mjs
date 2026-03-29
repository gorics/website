import { chromium } from 'playwright';
import path from 'path';

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const filePath = 'file://' + path.resolve('game/sokoban/index.html');
    await page.goto(filePath);

    // Initial check
    let levelText = await page.locator('#level').innerText();
    let movesText = await page.locator('#moves').innerText();
    console.log(`Initial State: Level ${levelText}, Moves ${movesText}`);

    // Take screenshot
    await page.screenshot({ path: 'verification/sokoban_screenshot.png' });

    await browser.close();
})();
