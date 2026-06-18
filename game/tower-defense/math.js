function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { distance };
}
