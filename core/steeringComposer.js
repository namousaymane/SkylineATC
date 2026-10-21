class SteeringComposer {
  static combine(vehicle, contributions = []) {
    const force = createVector(0, 0);
    for (const contribution of contributions) {
      if (!contribution || contribution.enabled === false || !contribution.force) continue;
      const weight = contribution.weight ?? 1;
      if (!Number.isFinite(weight) || weight < 0 ||
        !Number.isFinite(contribution.force.x) || !Number.isFinite(contribution.force.y)) continue;
      force.add(contribution.force.copy().mult(weight));
    }
    force.limit(Math.max(0, vehicle.maxForce));
    return force;
  }
}

if (typeof globalThis !== 'undefined') globalThis.SteeringComposer = SteeringComposer;
if (typeof module !== 'undefined' && module.exports) module.exports = SteeringComposer;
