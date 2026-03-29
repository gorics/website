function isGoal(levels, levelIndex, x, y) {
    const tile = levels[levelIndex]?.[y]?.[x];
    return tile === '.' || tile === '+' || tile === '*';
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { isGoal };
}
