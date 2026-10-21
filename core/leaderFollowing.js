class LeaderFollowing {
  static forceFor(vehicle, leader, options = {}) {
    if (!leader?.pos) return createVector(0, 0);
    const distance = options.distance ?? 42;
    const direction = leader.vel?.copy?.() ?? createVector(0, 0);
    if (direction.magSq() === 0 && vehicle.vel?.magSq?.() > 0) direction.set(vehicle.vel.x, vehicle.vel.y);
    if (direction.magSq() === 0 && Number.isFinite(leader.heading)) direction.set(Math.cos(leader.heading * Math.PI / 180), Math.sin(leader.heading * Math.PI / 180));
    if (direction.magSq() === 0) direction.set(1, 0);
    direction.setMag(distance);
    const target = leader.pos.copy().sub(direction);
    return vehicle.arrive(target).limit(options.maxForce ?? vehicle.maxForce);
  }
}

if (typeof globalThis !== 'undefined') globalThis.LeaderFollowing = LeaderFollowing;
if (typeof module !== 'undefined' && module.exports) module.exports = LeaderFollowing;
