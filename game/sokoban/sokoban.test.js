const assert = require('assert');
const { isGoal } = require('./sokoban');

const mockLevels = [
    [
        '#####',
        '#. @#',
        '# * #',
        '# + #',
        '#   #',
        '#####'
    ]
];

function runTests() {
    console.log('Testing isGoal()...');

    // Happy paths
    assert.strictEqual(isGoal(mockLevels, 0, 1, 1), true, 'Goal (.) should return true');
    assert.strictEqual(isGoal(mockLevels, 0, 2, 2), true, 'Crate on goal (*) should return true');
    assert.strictEqual(isGoal(mockLevels, 0, 2, 3), true, 'Player on goal (+) should return true');

    // Negative paths
    assert.strictEqual(isGoal(mockLevels, 0, 0, 0), false, 'Wall (#) should return false');
    assert.strictEqual(isGoal(mockLevels, 0, 3, 1), false, 'Player (@) should return false');
    assert.strictEqual(isGoal(mockLevels, 0, 2, 4), false, 'Empty floor ( ) should return false');

    // Out-of-bounds edge cases
    assert.strictEqual(isGoal(mockLevels, 0, -1, 0), false, 'Negative x should return false');
    assert.strictEqual(isGoal(mockLevels, 0, 0, -1), false, 'Negative y should return false');
    assert.strictEqual(isGoal(mockLevels, 0, 10, 0), false, 'Out of bounds x should return false');
    assert.strictEqual(isGoal(mockLevels, 0, 0, 10), false, 'Out of bounds y should return false');
    assert.strictEqual(isGoal(mockLevels, 1, 0, 0), false, 'Invalid levelIndex should return false');
    assert.strictEqual(isGoal([], 0, 0, 0), false, 'Empty levels array should return false');
    assert.strictEqual(isGoal(mockLevels, 0, undefined, undefined), false, 'Undefined coordinates should return false');

    console.log('All tests passed!');
}

runTests();
