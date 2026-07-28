const assert = require('assert');
const { getInputAction } = require('./wordle.js');

function runTests() {
    console.log('Running wordle.js tests...');

    // Valid letters
    assert.deepStrictEqual(getInputAction('a', false, 0, 5), { action: 'add', letter: 'A' }, "Should accept 'a' and return 'A'");
    assert.deepStrictEqual(getInputAction('A', false, 0, 5), { action: 'add', letter: 'A' }, "Should accept 'A'");
    assert.deepStrictEqual(getInputAction('z', false, 0, 5), { action: 'add', letter: 'Z' }, "Should accept 'z' and return 'Z'");
    assert.deepStrictEqual(getInputAction('Z', false, 0, 5), { action: 'add', letter: 'Z' }, "Should accept 'Z'");

    // Invalid letters and symbols
    assert.deepStrictEqual(getInputAction('1', false, 0, 5), { action: 'none' }, "Should reject numbers");
    assert.deepStrictEqual(getInputAction(' ', false, 0, 5), { action: 'none' }, "Should reject space");
    assert.deepStrictEqual(getInputAction('-', false, 0, 5), { action: 'none' }, "Should reject symbols");
    assert.deepStrictEqual(getInputAction('ㄱ', false, 0, 5), { action: 'none' }, "Should reject non-English characters");

    // Multi-character inputs (like meta keys)
    assert.deepStrictEqual(getInputAction('Shift', false, 0, 5), { action: 'none' }, "Should reject 'Shift'");
    assert.deepStrictEqual(getInputAction('CapsLock', false, 0, 5), { action: 'none' }, "Should reject 'CapsLock'");
    assert.deepStrictEqual(getInputAction('F1', false, 0, 5), { action: 'none' }, "Should reject 'F1'");

    // Special functional keys (Delete / Backspace)
    assert.deepStrictEqual(getInputAction('DEL', false, 0, 5), { action: 'delete' }, "Should handle 'DEL'");
    assert.deepStrictEqual(getInputAction('Backspace', false, 0, 5), { action: 'delete' }, "Should handle 'Backspace'");

    // Special functional keys (Enter)
    assert.deepStrictEqual(getInputAction('ENTER', false, 0, 5), { action: 'submit' }, "Should handle 'ENTER'");
    assert.deepStrictEqual(getInputAction('Enter', false, 0, 5), { action: 'submit' }, "Should handle 'Enter'");

    // Game state constraints: Finished
    assert.deepStrictEqual(getInputAction('A', true, 0, 5), { action: 'none' }, "Should ignore input if game is finished");
    assert.deepStrictEqual(getInputAction('DEL', true, 0, 5), { action: 'none' }, "Should ignore DEL if game is finished");
    assert.deepStrictEqual(getInputAction('ENTER', true, 0, 5), { action: 'none' }, "Should ignore ENTER if game is finished");

    // Game state constraints: Column full
    assert.deepStrictEqual(getInputAction('A', false, 5, 5), { action: 'none' }, "Should ignore letter if column is full");
    assert.deepStrictEqual(getInputAction('DEL', false, 5, 5), { action: 'delete' }, "Should allow DEL if column is full");
    assert.deepStrictEqual(getInputAction('ENTER', false, 5, 5), { action: 'submit' }, "Should allow ENTER if column is full");

    console.log('✅ All wordle.js tests passed!');
}

runTests();
