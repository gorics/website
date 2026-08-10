const assert = require('assert');
const { processInput } = require('./wordle.js');

function runTests() {
    console.log('Running Wordle tests...');
    let passed = 0;
    let failed = 0;

    function test(name, fn) {
        try {
            fn();
            console.log(`✅ ${name}`);
            passed++;
        } catch (error) {
            console.error(`❌ ${name}`);
            console.error(error);
            failed++;
        }
    }

    test('ignores input when game is finished', () => {
        const state = { finished: true };
        assert.deepStrictEqual(processInput('A', state, 0, 5), { action: 'none' });
        assert.deepStrictEqual(processInput('ENTER', state, 5, 5), { action: 'none' });
        assert.deepStrictEqual(processInput('DEL', state, 5, 5), { action: 'none' });
    });

    test('handles DELETE when col > 0', () => {
        const state = { finished: false };
        assert.deepStrictEqual(processInput('DEL', state, 1, 5), { action: 'delete' });
        assert.deepStrictEqual(processInput('DEL', state, 5, 5), { action: 'delete' });
    });

    test('ignores DELETE when col === 0', () => {
        const state = { finished: false };
        assert.deepStrictEqual(processInput('DEL', state, 0, 5), { action: 'none' });
    });

    test('handles ENTER', () => {
        const state = { finished: false };
        assert.deepStrictEqual(processInput('ENTER', state, 5, 5), { action: 'submit' });
        assert.deepStrictEqual(processInput('ENTER', state, 0, 5), { action: 'submit' }); // Assuming validation is done later
    });

    test('ignores letter input when col >= cols', () => {
        const state = { finished: false };
        assert.deepStrictEqual(processInput('A', state, 5, 5), { action: 'none' });
        assert.deepStrictEqual(processInput('A', state, 6, 5), { action: 'none' });
    });

    test('handles valid lowercase and uppercase letter input', () => {
        const state = { finished: false };
        assert.deepStrictEqual(processInput('a', state, 0, 5), { action: 'add', letter: 'A' });
        assert.deepStrictEqual(processInput('Z', state, 4, 5), { action: 'add', letter: 'Z' });
    });

    test('ignores invalid input (numbers, symbols)', () => {
        const state = { finished: false };
        assert.deepStrictEqual(processInput('1', state, 0, 5), { action: 'none' });
        assert.deepStrictEqual(processInput('!', state, 0, 5), { action: 'none' });
        assert.deepStrictEqual(processInput(' ', state, 0, 5), { action: 'none' });
        assert.deepStrictEqual(processInput('Enter', state, 0, 5), { action: 'none' }); // Enter is not ENTER
        assert.deepStrictEqual(processInput('Backspace', state, 0, 5), { action: 'none' }); // Backspace is not DEL
    });

    console.log(`\nTests finished. ${passed} passed, ${failed} failed.`);
    if (failed > 0) process.exit(1);
}

runTests();
