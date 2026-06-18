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

    // Level 1 logic:
    // #. @#
    // # $ #
    // move left, move down, move up, move right, move down

    // Using keyboard to solve level 1
    await page.keyboard.press('ArrowLeft'); // @ moves left
    await page.keyboard.press('ArrowDown'); // @ moves down, pushes $ down? Wait.
    // Let's check level 1 layout
    /*
        '#####',
        '#. @#',
        '# $ #',
        '#   #',
        '#####'
    */
    // . is (1,1). @ is (3,1). $ is (2,2).
    // To solve, $ must move to (1,1).
    // @ starts at (3,1).
    // Let's use pointer gestures to test the swipe logic.

    // First, let's reset to ensure clean state
    await page.click('#reset');

    const result = await page.evaluate(async () => {
        const boardWrapper = document.querySelector('.board');

        function sleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        async function swipe(direction) {
            const rect = boardWrapper.getBoundingClientRect();
            const startX = rect.left + rect.width / 2;
            const startY = rect.top + rect.height / 2;
            let dx = 0, dy = 0;
            const dist = 50; // threshold is ~18
            if (direction === 'up') dy = -dist;
            if (direction === 'down') dy = dist;
            if (direction === 'left') dx = -dist;
            if (direction === 'right') dx = dist;

            const downEvent = new PointerEvent('pointerdown', { pointerId: 1, clientX: startX, clientY: startY });
            boardWrapper.dispatchEvent(downEvent);

            await sleep(10);

            const upEvent = new PointerEvent('pointerup', { pointerId: 1, clientX: startX + dx, clientY: startY + dy });
            boardWrapper.dispatchEvent(upEvent);

            await sleep(10);
        }

        // Move player to push crate
        // @ starts at (3,1). Crate at (2,2). Goal at (1,1).
        // 1. Move Down -> @ at (3,2)
        await swipe('down');
        // 2. Move Left -> @ at (2,2) pushes crate to (1,2)
        await swipe('left');
        // 3. Move Down -> @ at (2,3)
        await swipe('down');
        // 4. Move Left -> @ at (1,3)
        await swipe('left');
        // 5. Move Up -> @ at (1,2) pushes crate to (1,1) -> Solved!
        await swipe('up');

        return {
            moves: document.getElementById('moves').textContent,
            pushes: document.getElementById('pushes').textContent,
            message: document.getElementById('message').textContent
        };
    });

    console.log(`After gestures: Moves ${result.moves}, Pushes ${result.pushes}`);
    console.log(`Message: ${result.message}`);

    if (result.message.includes('완료!')) {
        console.log('✅ Success: Gesture logic works correctly!');
    } else {
        console.log('❌ Error: Gesture logic failed or level not solved.');
        process.exit(1);
    }

    await browser.close();
})();
