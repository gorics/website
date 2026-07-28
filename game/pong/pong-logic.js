function calculatePaddleCollision(ball, p, paddleWidth, paddleHeight, isPlayer) {
    if (
        ball.x - ball.radius < p.x + paddleWidth &&
        ball.x + ball.radius > p.x &&
        ball.y + ball.radius > p.y &&
        ball.y - ball.radius < p.y + paddleHeight
    ) {
        const relativeIntersectY = (ball.y - (p.y + paddleHeight / 2)) / (paddleHeight / 2);
        const bounceAngle = relativeIntersectY * (Math.PI / 3);
        const direction = isPlayer ? 1 : -1;
        const speed = Math.min(10, Math.hypot(ball.vx, ball.vy) + 0.4);

        return {
            collided: true,
            vx: Math.cos(bounceAngle) * speed * direction,
            vy: Math.sin(bounceAngle) * speed,
            x: isPlayer ? p.x + paddleWidth + ball.radius : p.x - ball.radius
        };
    }
    return { collided: false };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { calculatePaddleCollision };
}
