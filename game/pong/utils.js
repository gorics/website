function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { clamp };
}