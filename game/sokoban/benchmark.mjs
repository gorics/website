import { chromium } from 'playwright';
import path from 'path';

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    const filePath = 'file://' + path.resolve('game/sokoban/index.html');
    await page.goto(filePath);

    const result = await page.evaluate(() => {
        const boardWrapper = document.querySelector('.board');
        const board = document.querySelector('#board');
        const startX = 100;
        const startY = 100;

        // Ensure board is not empty to avoid dividing by zero
        board.innerHTML = '<tr><td>@</td><td></td></tr><tr><td></td><td></td></tr>';

        const t0 = performance.now();
        for (let i = 0; i < 10000; i++) {
            // Trigger pointerdown
            const downEvent = new PointerEvent('pointerdown', { pointerId: 1, clientX: startX, clientY: startY });
            boardWrapper.dispatchEvent(downEvent);

            // Layout thrashing: modify style
            document.body.style.padding = (20 + (i % 2)) + 'px';

            // Trigger pointerup with small movement
            const upEvent = new PointerEvent('pointerup', { pointerId: 1, clientX: startX + 5, clientY: startY + 5 });
            boardWrapper.dispatchEvent(upEvent);
        }
        const t1 = performance.now();

        return t1 - t0;
    });

    console.log(`Baseline time: ${result} ms`);
    await browser.close();
})();
