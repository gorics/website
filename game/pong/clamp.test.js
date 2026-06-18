const assert = require('assert');
const { clamp } = require('./clamp');

try {
    assert.strictEqual(clamp(5, 0, 10), 5);
    assert.strictEqual(clamp(-5, 0, 10), 0);
    assert.strictEqual(clamp(15, 0, 10), 10);
    assert.strictEqual(clamp(-5, -10, 0), -5);
    assert.strictEqual(clamp(-15, -10, 0), -10);
    assert.strictEqual(clamp(5, -10, 0), 0);
    assert.strictEqual(clamp(0, 0, 10), 0);
    assert.strictEqual(clamp(10, 0, 10), 10);
    assert.strictEqual(clamp(5.5, 0.0, 10.0), 5.5);
    assert.strictEqual(clamp(-0.5, 0.0, 10.0), 0.0);
    assert.strictEqual(clamp(10.5, 0.0, 10.0), 10.0);
    console.log('All clamp tests passed!');
} catch (error) {
    console.error('Test failed:', error.message);
    process.exit(1);
}
