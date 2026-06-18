const assert = require('assert');
const { clamp } = require('./clamp.js');

// Happy paths (value within range)
assert.strictEqual(clamp(5, 1, 10), 5);
assert.strictEqual(clamp(0, -10, 10), 0);

// Edge cases (value equals min/max)
assert.strictEqual(clamp(1, 1, 10), 1);
assert.strictEqual(clamp(10, 1, 10), 10);

// Value below min
assert.strictEqual(clamp(0, 1, 10), 1);
assert.strictEqual(clamp(-5, 0, 10), 0);

// Value above max
assert.strictEqual(clamp(15, 1, 10), 10);
assert.strictEqual(clamp(100, 0, 50), 50);

// Min equals max
assert.strictEqual(clamp(5, 10, 10), 10);
assert.strictEqual(clamp(15, 10, 10), 10);
assert.strictEqual(clamp(10, 10, 10), 10);

// Negative numbers
assert.strictEqual(clamp(-5, -10, -1), -5);
assert.strictEqual(clamp(-15, -10, -1), -10);
assert.strictEqual(clamp(0, -10, -1), -1);

console.log('All clamp tests passed!');
