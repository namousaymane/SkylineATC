class PathFollowing {
  static project(point, start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) return { point: { x: start.x, y: start.y }, t: 0 };
    const t = Math.max(0, Math.min(1,
      ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
    return { point: { x: start.x + dx * t, y: start.y + dy * t }, t };
  }

  static forceFor(vehicle, path = [], options = {}) {
    if (!vehicle || !Array.isArray(path) || path.length < 2) return createVector(0, 0);
    const lookAhead = options.lookAhead ?? 55;
    const future = vehicle.pos.copy().add(vehicle.vel.copy().mult(options.predictionFrames ?? 15));
    let best = null;
    for (let index = 0; index < path.length - 1; index += 1) {
      const projection = this.project(future, path[index], path[index + 1]);
      const distance = Math.hypot(future.x - projection.point.x, future.y - projection.point.y);
      if (!best || distance < best.distance) best = { ...projection, index, distance };
    }
    let target = best.point;
    let remaining = Math.max(0, lookAhead);
    for (let index = best.index + 1; index < path.length; index += 1) {
      const end = path[index];
      const length = Math.hypot(end.x - target.x, end.y - target.y);
      if (length > remaining) {
        target = { x: target.x + (end.x - target.x) * remaining / length,
          y: target.y + (end.y - target.y) * remaining / length };
        break;
      }
      remaining -= length;
      target = end;
    }
    const last = path[path.length - 1];
    const atEnd = target.x === last.x && target.y === last.y;
    vehicle.pathTelemetry = { future: { x: future.x, y: future.y }, normal: { ...best.point }, target: { x: target.x, y: target.y }, arriving: atEnd && options.arriveAtEnd !== false };
    return atEnd && options.arriveAtEnd !== false
      ? vehicle.arrive(createVector(target.x, target.y))
      : vehicle.seek(createVector(target.x, target.y));
  }
}

if (typeof globalThis !== 'undefined') globalThis.PathFollowing = PathFollowing;
if (typeof module !== 'undefined' && module.exports) module.exports = PathFollowing;
