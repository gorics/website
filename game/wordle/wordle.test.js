const assert = require('assert');
const { determineInputAction } = require('./wordle.js');

function runTests() {
    console.log('Running wordle tests...');

    // Test 1: Ignore input when game is finished
    let action = determineInputAction('A', true, 0, 5);
    assert.deepStrictEqual(action, { type: 'IGNORE' }, 'Should ignore input when finished');

    action = determineInputAction('ENTER', true, 5, 5);
    assert.deepStrictEqual(action, { type: 'IGNORE' }, 'Should ignore ENTER when finished');

    action = determineInputAction('DEL', true, 1, 5);
    assert.deepStrictEqual(action, { type: 'IGNORE' }, 'Should ignore DEL when finished');

    // Test 2: Handling 'DEL'
    action = determineInputAction('DEL', false, 1, 5);
    assert.deepStrictEqual(action, { type: 'DELETE' }, 'Should return DELETE for DEL when col > 0');

    action = determineInputAction('DEL', false, 0, 5);
    assert.deepStrictEqual(action, { type: 'IGNORE' }, 'Should return IGNORE for DEL when col is 0');

    // Test 3: Handling 'ENTER'
    action = determineInputAction('ENTER', false, 5, 5);
    assert.deepStrictEqual(action, { type: 'SUBMIT' }, 'Should return SUBMIT for ENTER');

    action = determineInputAction('ENTER', false, 0, 5);
    assert.deepStrictEqual(action, { type: 'SUBMIT' }, 'Should return SUBMIT for ENTER regardless of col (submitRow handles col validation)');

    // Test 4: Extracting single alphabetical characters
    action = determineInputAction('A', false, 0, 5);
    assert.deepStrictEqual(action, { type: 'ADD', letter: 'A' }, 'Should return ADD for single letter');

    action = determineInputAction('z', false, 0, 5);
    assert.deepStrictEqual(action, { type: 'ADD', letter: 'Z' }, 'Should return ADD for lowercase letter and convert to uppercase');

    // Test 5: Ignoring non-alphabetical characters or multiple characters
    action = determineInputAction('1', false, 0, 5);
    assert.deepStrictEqual(action, { type: 'IGNORE' }, 'Should ignore numbers');

    action = determineInputAction('!', false, 0, 5);
    assert.deepStrictEqual(action, { type: 'IGNORE' }, 'Should ignore special characters');

    action = determineInputAction('AB', false, 0, 5);
    assert.deepStrictEqual(action, { type: 'IGNORE' }, 'Should ignore multiple letters');

    action = determineInputAction('', false, 0, 5);
    assert.deepStrictEqual(action, { type: 'IGNORE' }, 'Should ignore empty string');

    // Test 6: Ignoring letter input when col >= maxCols
    action = determineInputAction('A', false, 5, 5);
    assert.deepStrictEqual(action, { type: 'IGNORE' }, 'Should ignore letter when col == maxCols');

    action = determineInputAction('A', false, 6, 5);
    assert.deepStrictEqual(action, { type: 'IGNORE' }, 'Should ignore letter when col > maxCols');

    console.log('All tests passed!');
}

runTests();
