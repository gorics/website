const assert = require('assert');
const { pointToSegmentDistance } = require('./math');

console.log("Running pointToSegmentDistance tests...");

// Happy path: point perfectly above the middle of a segment
{
    const point = { x: 5, y: 5 };
    const a = { x: 0, y: 0 };
    const b = { x: 10, y: 0 };
    const distance = pointToSegmentDistance(point, a, b);
    assert.strictEqual(distance, 5, 'Failed: point above middle of segment');
}

// Edge case: point past the end points of the segment
{
    const point = { x: 15, y: 0 };
    const a = { x: 0, y: 0 };
    const b = { x: 10, y: 0 };
    const distance = pointToSegmentDistance(point, a, b);
    assert.strictEqual(distance, 5, 'Failed: point past the end point b');
}

{
    const point = { x: -5, y: 0 };
    const a = { x: 0, y: 0 };
    const b = { x: 10, y: 0 };
    const distance = pointToSegmentDistance(point, a, b);
    assert.strictEqual(distance, 5, 'Failed: point past the end point a');
}

// Edge case: point on the segment itself
{
    const point = { x: 5, y: 0 };
    const a = { x: 0, y: 0 };
    const b = { x: 10, y: 0 };
    const distance = pointToSegmentDistance(point, a, b);
    assert.strictEqual(distance, 0, 'Failed: point on the segment');
}

// Edge case: zero-length segment where start and end points are identical
{
    const point = { x: 5, y: 5 };
    const a = { x: 0, y: 0 };
    const b = { x: 0, y: 0 };
    const distance = pointToSegmentDistance(point, a, b);
    assert.strictEqual(distance, Math.hypot(5, 5), 'Failed: zero-length segment');
}

console.log("All pointToSegmentDistance tests passed!");
