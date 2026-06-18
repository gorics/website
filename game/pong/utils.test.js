const assert = require('assert');
const { clamp } = require('./utils');

try {
    // Normal cases
    assert.strictEqual(clamp(5, 0, 10), 5, 'Should return value when within range');
    assert.strictEqual(clamp(-5, 0, 10), 0, 'Should return min when value is below range');
    assert.strictEqual(clamp(15, 0, 10), 10, 'Should return max when value is above range');

    // Edge cases
    assert.strictEqual(clamp(0, 0, 10), 0, 'Should return min when value equals min');
    assert.strictEqual(clamp(10, 0, 10), 10, 'Should return max when value equals max');

    // Negative numbers
    assert.strictEqual(clamp(-5, -10, -1), -5, 'Should return value when within negative range');
    assert.strictEqual(clamp(-15, -10, -1), -10, 'Should clamp below negative range');
    assert.strictEqual(clamp(0, -10, -1), -1, 'Should clamp above negative range');

    // Floats
    assert.strictEqual(clamp(5.5, 0.0, 10.0), 5.5, 'Should handle floats');
    assert.strictEqual(clamp(10.5, 0.0, 10.0), 10.0, 'Should clamp above float range');
    assert.strictEqual(clamp(-0.5, 0.0, 10.0), 0.0, 'Should clamp below float range');

    console.log('All tests passed!');
} catch (e) {
    console.error('Test failed:', e.message);
    process.exit(1);
}
