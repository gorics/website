import { chromium } from 'playwright';
import path from 'path';

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    const filePath = 'file://' + path.resolve('game/sokoban/index.html');
    await page.goto(filePath);

    // Patch the script correctly
    await page.evaluate(() => {
        window.callCount = 0;
        const boardWrapper = document.querySelector('.board');
        const originalGet = boardWrapper.getBoundingClientRect;
        boardWrapper.getBoundingClientRect = function() {
            window.callCount++;
            return originalGet.apply(this, arguments);
        };
        // Also mock clientWidth/Height getters to see how often they are called
        const originalCW = Object.getOwnPropertyDescriptor(Element.prototype, 'clientWidth').get;
        Object.defineProperty(boardWrapper, 'clientWidth', {
            get: function() {
                window.callCount++;
                return originalCW.apply(this, arguments);
            }
        });
        const originalCH = Object.getOwnPropertyDescriptor(Element.prototype, 'clientHeight').get;
        Object.defineProperty(boardWrapper, 'clientHeight', {
            get: function() {
                window.callCount++;
                return originalCH.apply(this, arguments);
            }
        });
    });

    const result = await page.evaluate(() => {
        const boardWrapper = document.querySelector('.board');

        const t0 = performance.now();
        for (let i = 0; i < 10000; i++) {
            const downEvent = new PointerEvent('pointerdown', { pointerId: 1, clientX: 100, clientY: 100 });
            boardWrapper.dispatchEvent(downEvent);

            // Force layout change
            document.body.style.padding = (20 + (i % 2)) + 'px';

            const upEvent = new PointerEvent('pointerup', { pointerId: 1, clientX: 105, clientY: 105 });
            boardWrapper.dispatchEvent(upEvent);
        }
        const t1 = performance.now();

        return { time: t1 - t0, calls: window.callCount };
    });

    console.log(`Optimized time: ${result.time} ms, layout queries: ${result.calls}`);
    await browser.close();
})();
