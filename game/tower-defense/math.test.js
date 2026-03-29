const assert = require('assert');
const { normalize } = require('./math.js');

function runTests() {
    console.log('Running tests for normalize...');

    // Test 1: Standard positive vector
    let result = normalize({ x: 3, y: 4 });
    // length is 5, so x should be 3/5=0.6, y should be 4/5=0.8
    assert.strictEqual(result.x, 0.6, 'Standard positive vector x');
    assert.strictEqual(result.y, 0.8, 'Standard positive vector y');

    // Test 2: Negative vector
    result = normalize({ x: -3, y: -4 });
    assert.strictEqual(result.x, -0.6, 'Negative vector x');
    assert.strictEqual(result.y, -0.8, 'Negative vector y');

    // Test 3: Zero vector (edge case)
    result = normalize({ x: 0, y: 0 });
    // Math.hypot(0, 0) || 1 -> 1. so x/1=0, y/1=0
    assert.strictEqual(result.x, 0, 'Zero vector x');
    assert.strictEqual(result.y, 0, 'Zero vector y');

    // Test 4: Axis aligned vector
    result = normalize({ x: 0, y: 10 });
    assert.strictEqual(result.x, 0, 'Axis aligned vector x');
    assert.strictEqual(result.y, 1, 'Axis aligned vector y');

    result = normalize({ x: 10, y: 0 });
    assert.strictEqual(result.x, 1, 'Axis aligned vector x');
    assert.strictEqual(result.y, 0, 'Axis aligned vector y');

    console.log('All tests passed!');
}

runTests();
