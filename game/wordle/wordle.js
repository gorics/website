function getInputAction(key, isFinished, col, maxCols) {
    if (isFinished) return { action: 'none' };

    if (key === 'DEL' || key === 'Backspace') {
        return { action: 'delete' };
    }

    if (key === 'ENTER' || key === 'Enter') {
        return { action: 'submit' };
    }

    if (col >= maxCols) return { action: 'none' };

    const letter = key.toUpperCase();
    if (!/^[A-Z]$/.test(letter)) return { action: 'none' };

    return { action: 'add', letter: letter };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getInputAction };
}
