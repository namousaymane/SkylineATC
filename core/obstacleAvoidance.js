class ObstacleAvoidance {
  static forceFor(vehicle, obstacles = [], options = {}) {
    const lookAhead = options.lookAhead ?? 90;
    const radius = options.radius ?? 24;
    if (!(lookAhead > 0)) return createVector(0, 0);
    const direction = vehicle.vel.copy();
    if (direction.magSq() === 0) return createVector(0, 0);
    direction.setMag(lookAhead);
    let nearest = null;
    for (const obstacle of obstacles) {
      if (!obstacle || !obstacle.pos) continue;
      const obstacleRadius = obstacle.hitboxRadius ?? obstacle.r ?? obstacle.radius ?? 0;
      const ux = direction.x / lookAhead;
      const uy = direction.y / lookAhead;
      const dx = obstacle.pos.x - vehicle.pos.x;
      const dy = obstacle.pos.y - vehicle.pos.y;
      const along = dx * ux + dy * uy;
      const lateral = dx * -uy + dy * ux;
      const corridor = radius + obstacleRadius;
      if (along >= -obstacleRadius && along <= lookAhead + obstacleRadius &&
        Math.abs(lateral) <= corridor && (!nearest || along < nearest.along)) {
        nearest = { obstacle, along, lateral, ux, uy };
      }
    }
    if (!nearest) {
      vehicle.avoidanceObstacle = null;
      return createVector(0, 0);
    }
    // Retain the chosen side until the obstacle has left the corridor.
    if (vehicle.avoidanceObstacle !== nearest.obstacle) {
      vehicle.avoidanceObstacle = nearest.obstacle;
      vehicle.avoidanceSide = nearest.lateral > 0 ? -1 : 1;
    }
    return createVector(-nearest.uy, nearest.ux)
      .mult(vehicle.avoidanceSide * (options.maxForce ?? vehicle.maxForce));
  }
}

if (typeof globalThis !== 'undefined') globalThis.ObstacleAvoidance = ObstacleAvoidance;
if (typeof module !== 'undefined' && module.exports) module.exports = ObstacleAvoidance;
