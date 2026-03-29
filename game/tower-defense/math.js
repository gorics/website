function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function pointToSegmentDistance(point, a, b) {
    const ab = { x: b.x - a.x, y: b.y - a.y };
    const ap = { x: point.x - a.x, y: point.y - a.y };
    const abLengthSquared = ab.x * ab.x + ab.y * ab.y;

    // Handle the case where the segment is a single point (a == b)
    if (abLengthSquared === 0) {
        return distance(point, a);
    }

    const t = Math.max(0, Math.min(1, (ap.x * ab.x + ap.y * ab.y) / abLengthSquared));
    const closest = { x: a.x + ab.x * t, y: a.y + ab.y * t };
    return distance(point, closest);
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { distance, pointToSegmentDistance };
}