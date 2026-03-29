const assert = require('assert');
const { distance } = require('./math.js');

function runTests() {
    let passed = 0;
    let failed = 0;

    function test(name, fn) {
        try {
            fn();
            passed++;
            console.log(`✅ ${name}`);
        } catch (error) {
            failed++;
            console.error(`❌ ${name}`);
            console.error(`   ${error.message}`);
        }
    }

    console.log('Running math.js tests...\n');

    test('Standard Pythagorean triple (3-4-5)', () => {
        assert.strictEqual(distance({x: 0, y: 0}, {x: 3, y: 4}), 5);
    });

    test('Reverse order (should be the same)', () => {
        assert.strictEqual(distance({x: 3, y: 4}, {x: 0, y: 0}), 5);
    });

    test('Identical points (should be 0)', () => {
        assert.strictEqual(distance({x: 10, y: 10}, {x: 10, y: 10}), 0);
    });

    test('Negative coordinates', () => {
        assert.strictEqual(distance({x: -1, y: -1}, {x: -4, y: -5}), 5);
    });

    test('Floating point coordinates', () => {
        const dist = distance({x: 1.5, y: 2.5}, {x: 4.5, y: 6.5}); // dx=3, dy=4 -> 5
        assert.strictEqual(dist, 5);
    });

    test('Mixed positive and negative coordinates', () => {
        // dx = 3 - (-2) = 5
        // dy = -1 - 11 = -12
        // dist = hypot(5, -12) = 13
        assert.strictEqual(distance({x: -2, y: 11}, {x: 3, y: -1}), 13);
    });

    test('Invalid input (missing coordinates) results in NaN', () => {
        assert.ok(Number.isNaN(distance({x: 0}, {y: 0})));
        assert.ok(Number.isNaN(distance({}, {})));
    });

    console.log(`\nTest Summary: ${passed} passed, ${failed} failed`);

    if (failed > 0) {
        process.exit(1);
    }
}

runTests();
