function processInput(key, state, col, cols) {
    if (state.finished) return { action: 'none' };
    if (key === 'DEL') {
        if (col > 0) {
            return { action: 'delete' };
        }
        return { action: 'none' };
    }
    if (key === 'ENTER') {
        return { action: 'submit' };
    }
    if (col >= cols) return { action: 'none' };
    const letter = key.toUpperCase();
    if (!/^[A-Z]$/.test(letter)) return { action: 'none' };
    return { action: 'add', letter };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { processInput };
}
