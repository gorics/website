const assert = require('assert');
const { shuffle } = require('./shuffle.js');

function testShuffle() {
    console.log('Running testShuffle...');

    // Test 1: Empty array
    let arr1 = [];
    let res1 = shuffle(arr1);
    assert.deepStrictEqual(res1, [], 'Empty array should remain empty');
    assert.strictEqual(arr1, res1, 'Should return the same array instance');

    // Test 2: Single element array
    let arr2 = [1];
    let res2 = shuffle(arr2);
    assert.deepStrictEqual(res2, [1], 'Single element array should remain unchanged');
    assert.strictEqual(arr2, res2, 'Should return the same array instance');

    // Test 3: Multiple elements array
    let arr3 = [1, 2, 3, 4, 5];
    let originalElements = [...arr3];
    let res3 = shuffle(arr3);

    assert.strictEqual(res3.length, originalElements.length, 'Length should remain the same');
    assert.strictEqual(arr3, res3, 'Should return the same array instance');

    // Check that all original elements are still in the array
    let sortedOriginal = [...originalElements].sort((a, b) => a - b);
    let sortedResult = [...res3].sort((a, b) => a - b);
    assert.deepStrictEqual(sortedResult, sortedOriginal, 'Array should contain the exact same elements');

    // Note: Due to the random nature of shuffle, we can't definitively assert that the order HAS changed.
    // However, we can assert that the array contains the correct items.

    // Test 4: Does it actually shuffle over multiple runs? (probabilistic)
    // Run shuffle 100 times on [1, 2, 3] and ensure we don't always get [1, 2, 3]
    let arr4 = [1, 2, 3];
    let changedOrder = false;
    for (let i = 0; i < 100; i++) {
        let copy = [...arr4];
        shuffle(copy);
        if (copy[0] !== 1 || copy[1] !== 2 || copy[2] !== 3) {
            changedOrder = true;
            break;
        }
    }
    assert.ok(changedOrder, 'Shuffle should likely change the order of elements over 100 runs');

    console.log('All tests passed for shuffle!');
}

try {
    testShuffle();
} catch (e) {
    console.error('Test failed:', e);
    process.exit(1);
}
