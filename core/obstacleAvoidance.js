class ObstacleAvoidance {
  static forceFor(vehicle, obstacles = [], options = {}) {
    const lookAhead = options.lookAhead ?? 90;
    const radius = options.radius ?? 24;
    const clear = () => { vehicle.avoidanceObstacle = null; vehicle.avoidanceThreat = 0; return createVector(0, 0); };
    if (!(Number.isFinite(lookAhead) && lookAhead > 0)) return clear();
    const direction = vehicle.vel.copy();
    if (direction.magSq() === 0) return clear();
    direction.setMag(lookAhead);
    let nearest = null;
    for (const obstacle of obstacles) {
      if (!obstacle?.pos || !Number.isFinite(obstacle.pos.x) || !Number.isFinite(obstacle.pos.y)) continue;
      const obstacleRadius = obstacle.hitboxRadius ?? obstacle.r ?? obstacle.radius ?? 0;
      if (!Number.isFinite(obstacleRadius) || obstacleRadius < 0) continue;
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
      vehicle.avoidanceThreat = 0;
      return createVector(0, 0);
    }
    // Retain the chosen side until the obstacle has left the corridor.
    if (vehicle.avoidanceObstacle !== nearest.obstacle) {
      vehicle.avoidanceObstacle = nearest.obstacle;
      vehicle.avoidanceSide = nearest.lateral > 0 ? -1 : 1;
    }
    // The closer the cell is, the more authoritative the lateral command is.
    // WeatherEffects uses this telemetry so turbulence cannot cancel the
    // escape vector selected by obstacle avoidance.
    const clearance = Math.max(1, radius + (nearest.obstacle.hitboxRadius ?? nearest.obstacle.r ?? nearest.obstacle.radius ?? 0));
    const urgency = Math.max(0.35, Math.min(1, 1 - (nearest.along - clearance) / Math.max(1, lookAhead)));
    vehicle.avoidanceThreat = urgency;
    return createVector(-nearest.uy, nearest.ux)
      .mult(vehicle.avoidanceSide * (options.maxForce ?? vehicle.maxForce) * urgency);
  }
}

if (typeof globalThis !== 'undefined') globalThis.ObstacleAvoidance = ObstacleAvoidance;
if (typeof module !== 'undefined' && module.exports) module.exports = ObstacleAvoidance;
