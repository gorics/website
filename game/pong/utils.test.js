const assert = require('assert');
const { clamp } = require('./utils');

function testClamp() {
    console.log('Running tests for clamp()...');

    // Values within range
    assert.strictEqual(clamp(5, 1, 10), 5, 'Should return the value if within range (5 in [1, 10])');
    assert.strictEqual(clamp(0, -5, 5), 0, 'Should return the value if within range (0 in [-5, 5])');

    // Values below minimum
    assert.strictEqual(clamp(0, 1, 10), 1, 'Should return min if value is below min (0 < 1)');
    assert.strictEqual(clamp(-10, -5, 5), -5, 'Should return min if value is below min (-10 < -5)');

    // Values above maximum
    assert.strictEqual(clamp(15, 1, 10), 10, 'Should return max if value is above max (15 > 10)');
    assert.strictEqual(clamp(10, -5, 5), 5, 'Should return max if value is above max (10 > 5)');

    // Edge cases: value exactly on boundaries
    assert.strictEqual(clamp(1, 1, 10), 1, 'Should return value if exactly on min boundary (1 = 1)');
    assert.strictEqual(clamp(10, 1, 10), 10, 'Should return value if exactly on max boundary (10 = 10)');

    // Edge cases: min and max are equal
    assert.strictEqual(clamp(5, 5, 5), 5, 'Should return value if min, max, and value are equal');
    assert.strictEqual(clamp(1, 5, 5), 5, 'Should return max/min if min and max are equal and value is below');
    assert.strictEqual(clamp(10, 5, 5), 5, 'Should return max/min if min and max are equal and value is above');

    // Float values
    assert.strictEqual(clamp(5.5, 1.1, 10.9), 5.5, 'Should handle float values within range');
    assert.strictEqual(clamp(0.1, 1.1, 10.9), 1.1, 'Should handle float values below range');
    assert.strictEqual(clamp(11.1, 1.1, 10.9), 10.9, 'Should handle float values above range');

    console.log('All clamp() tests passed successfully! ✅');
}

testClamp();
