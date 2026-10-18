const assert = require('assert');
const { calculatePaddleCollision } = require('./pong-logic');

// Common paddle dimensions
const paddleWidth = 14;
const paddleHeight = 90;

console.log('--- Testing Pong Collision Logic ---');

// Test 1: Player Paddle Collision (Front center hit)
let ball = { x: 34, y: 100, radius: 8, vx: -5, vy: 0 }; // Moving towards player
let player = { x: 20, y: 100 - paddleHeight / 2 }; // Center of paddle is at y=100
let isPlayer = true;

let result = calculatePaddleCollision(ball, player, paddleWidth, paddleHeight, isPlayer);

assert.strictEqual(result.collided, true, 'Test 1 Failed: Ball should collide with player paddle');
assert.ok(result.vx > 0, 'Test 1 Failed: Ball should bounce to the right (vx > 0)');
assert.strictEqual(Math.abs(result.vy) < 0.01, true, 'Test 1 Failed: Center hit should have minimal vertical velocity');
assert.strictEqual(result.x, player.x + paddleWidth + ball.radius, 'Test 1 Failed: Ball x position should be set to right of player paddle');

console.log('Test 1 Passed: Player Paddle Collision (Center hit)');

// Test 2: Player Paddle Collision (Top hit - should bounce upwards)
ball = { x: 34, y: player.y, radius: 8, vx: -5, vy: 0 }; // Hit top edge of paddle

result = calculatePaddleCollision(ball, player, paddleWidth, paddleHeight, isPlayer);

assert.strictEqual(result.collided, true, 'Test 2 Failed: Ball should collide with player paddle');
assert.ok(result.vx > 0, 'Test 2 Failed: Ball should bounce to the right (vx > 0)');
assert.ok(result.vy < 0, 'Test 2 Failed: Top hit should bounce ball upwards (vy < 0)');

console.log('Test 2 Passed: Player Paddle Collision (Top hit)');

// Test 3: Player Paddle Collision (Bottom hit - should bounce downwards)
ball = { x: 34, y: player.y + paddleHeight, radius: 8, vx: -5, vy: 0 }; // Hit bottom edge of paddle

result = calculatePaddleCollision(ball, player, paddleWidth, paddleHeight, isPlayer);

assert.strictEqual(result.collided, true, 'Test 3 Failed: Ball should collide with player paddle');
assert.ok(result.vx > 0, 'Test 3 Failed: Ball should bounce to the right (vx > 0)');
assert.ok(result.vy > 0, 'Test 3 Failed: Bottom hit should bounce ball downwards (vy > 0)');

console.log('Test 3 Passed: Player Paddle Collision (Bottom hit)');

// Test 4: AI Paddle Collision (Front center hit)
let ai = { x: 600, y: 100 - paddleHeight / 2 };
ball = { x: 593, y: 100, radius: 8, vx: 5, vy: 0 }; // Overlapping slightly
isPlayer = false;

result = calculatePaddleCollision(ball, ai, paddleWidth, paddleHeight, isPlayer);

assert.strictEqual(result.collided, true, 'Test 4 Failed: Ball should collide with AI paddle');
assert.ok(result.vx < 0, 'Test 4 Failed: Ball should bounce to the left (vx < 0)');
assert.strictEqual(Math.abs(result.vy) < 0.01, true, 'Test 4 Failed: Center hit should have minimal vertical velocity');
assert.strictEqual(result.x, ai.x - ball.radius, 'Test 4 Failed: Ball x position should be set to left of AI paddle');

console.log('Test 4 Passed: AI Paddle Collision (Center hit)');

// Test 5: Ball misses paddle (above)
ball = { x: 34, y: player.y - 10, radius: 8, vx: -5, vy: 0 };
isPlayer = true;

result = calculatePaddleCollision(ball, player, paddleWidth, paddleHeight, isPlayer);

assert.strictEqual(result.collided, false, 'Test 5 Failed: Ball should not collide (above paddle)');

console.log('Test 5 Passed: Ball misses paddle (above)');

// Test 6: Ball misses paddle (below)
ball = { x: 34, y: player.y + paddleHeight + 10, radius: 8, vx: -5, vy: 0 };

result = calculatePaddleCollision(ball, player, paddleWidth, paddleHeight, isPlayer);

assert.strictEqual(result.collided, false, 'Test 6 Failed: Ball should not collide (below paddle)');

console.log('Test 6 Passed: Ball misses paddle (below)');

// Test 7: Ball misses paddle (too far right from player paddle)
ball = { x: player.x + paddleWidth + 10, y: 100, radius: 8, vx: -5, vy: 0 };

result = calculatePaddleCollision(ball, player, paddleWidth, paddleHeight, isPlayer);

assert.strictEqual(result.collided, false, 'Test 7 Failed: Ball should not collide (too far right)');

console.log('Test 7 Passed: Ball misses paddle (too far right)');

// Test 8: Ball misses paddle (too far left from player paddle)
ball = { x: player.x - 10, y: 100, radius: 8, vx: -5, vy: 0 };

result = calculatePaddleCollision(ball, player, paddleWidth, paddleHeight, isPlayer);

assert.strictEqual(result.collided, false, 'Test 8 Failed: Ball should not collide (too far left)');

console.log('Test 8 Passed: Ball misses paddle (too far left)');

console.log('--- All tests passed! ---');
