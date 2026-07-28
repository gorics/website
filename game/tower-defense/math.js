function normalize(vec) {
    const length = Math.hypot(vec.x, vec.y) || 1;
    return { x: vec.x / length, y: vec.y / length };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { normalize };
}
