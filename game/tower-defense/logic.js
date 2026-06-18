function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function pointToSegmentDistance(point, a, b) {
    const ab = { x: b.x - a.x, y: b.y - a.y };
    const ap = { x: point.x - a.x, y: point.y - a.y };
    const t = Math.max(0, Math.min(1, (ap.x * ab.x + ap.y * ab.y) / (ab.x * ab.x + ab.y * ab.y)));
    const closest = { x: a.x + ab.x * t, y: a.y + ab.y * t };
    return distance(point, closest);
}

function canPlaceTower(x, y, canvasWidth, canvasHeight, towers, path) {
    const margin = 28;
    if (x < margin || y < margin || x > canvasWidth - margin || y > canvasHeight - margin) return false;
    if (towers.some((tower) => distance(tower, { x, y }) < 50)) return false;
    for (let i = 0; i < path.length - 1; i++) {
        const a = path[i];
        const b = path[i + 1];
        if (pointToSegmentDistance({ x, y }, a, b) < 32) return false;
    }
    return true;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        distance,
        pointToSegmentDistance,
        canPlaceTower
    };
}
