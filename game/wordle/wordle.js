function determineInputAction(key, isFinished, col, maxCols) {
    if (isFinished) {
        return { type: 'IGNORE' };
    }

    if (key === 'DEL') {
        if (col > 0) {
            return { type: 'DELETE' };
        }
        return { type: 'IGNORE' };
    }

    if (key === 'ENTER') {
        return { type: 'SUBMIT' };
    }

    if (col >= maxCols) {
        return { type: 'IGNORE' };
    }

    const letter = key.toUpperCase();
    if (/^[A-Z]$/.test(letter)) {
        return { type: 'ADD', letter: letter };
    }

    return { type: 'IGNORE' };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { determineInputAction };
}
