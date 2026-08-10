const assert = require('assert');
const { canPlaceTower } = require('./logic.js');

function runTests() {
    console.log('Running Tower Defense logic tests...');

    const canvasWidth = 720;
    const canvasHeight = 480;
    const margin = 28;

    // Sample path similar to the actual game path
    const path = [
        { x: 60, y: 460 },
        { x: 60, y: 300 },
        { x: 240, y: 300 }
    ];

    // Empty towers array initially
    let towers = [];

    // Test 1: Happy Path - Valid placement
    // x, y well within boundaries, no towers, far from path
    let result = canPlaceTower(150, 150, canvasWidth, canvasHeight, towers, path);
    assert.strictEqual(result, true, 'Should be able to place a tower in a valid empty spot');

    // Test 2: Canvas Boundary Violations (margin = 28)
    // Left boundary
    result = canPlaceTower(margin - 1, 150, canvasWidth, canvasHeight, towers, path);
    assert.strictEqual(result, false, 'Should fail to place a tower too close to the left edge');

    // Top boundary
    result = canPlaceTower(150, margin - 1, canvasWidth, canvasHeight, towers, path);
    assert.strictEqual(result, false, 'Should fail to place a tower too close to the top edge');

    // Right boundary
    result = canPlaceTower(canvasWidth - margin + 1, 150, canvasWidth, canvasHeight, towers, path);
    assert.strictEqual(result, false, 'Should fail to place a tower too close to the right edge');

    // Bottom boundary
    result = canPlaceTower(150, canvasHeight - margin + 1, canvasWidth, canvasHeight, towers, path);
    assert.strictEqual(result, false, 'Should fail to place a tower too close to the bottom edge');

    // Test 3: Tower Overlap Violations (distance < 50)
    towers = [{ x: 150, y: 150, type: 'basic', cooldown: 0 }];

    // Exactly on the same spot
    result = canPlaceTower(150, 150, canvasWidth, canvasHeight, towers, path);
    assert.strictEqual(result, false, 'Should fail to place a tower on top of another tower');

    // Just within 50px (e.g., 49px away)
    result = canPlaceTower(150 + 49, 150, canvasWidth, canvasHeight, towers, path);
    assert.strictEqual(result, false, 'Should fail to place a tower within 50px of another tower');

    // Just outside 50px (e.g., 50px away)
    result = canPlaceTower(150 + 50, 150, canvasWidth, canvasHeight, towers, path);
    assert.strictEqual(result, true, 'Should be able to place a tower exactly 50px away from another tower');

    // Reset towers
    towers = [];

    // Test 4: Path Overlap Violations (distance < 32)
    // The path segment is from (60, 460) to (60, 300)

    // Exactly on the path
    result = canPlaceTower(60, 400, canvasWidth, canvasHeight, towers, path);
    assert.strictEqual(result, false, 'Should fail to place a tower exactly on the path');

    // Just within 32px of the path (e.g., 31px away horizontally)
    result = canPlaceTower(60 + 31, 400, canvasWidth, canvasHeight, towers, path);
    assert.strictEqual(result, false, 'Should fail to place a tower within 32px of the path');

    // Just outside 32px of the path (e.g., 32px away horizontally)
    result = canPlaceTower(60 + 32, 400, canvasWidth, canvasHeight, towers, path);
    assert.strictEqual(result, true, 'Should be able to place a tower exactly 32px away from the path');

    console.log('All tests passed successfully! 🎉');
}

runTests();
