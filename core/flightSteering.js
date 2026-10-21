/** Coordinated game-scale turns: change velocity by force, never rotate velocity in place. */
class FlightSteering {
  static turnRate(a) { return ({ B738: .65, B788: .5, A388: .4, H145: .8 }[a.modelId] ?? .8) * Math.PI / 180; }
  static constrain(a, force) {
    if (!(a.altitude > 0) || a.model?.helicopter || a.destroyed) return force;
    const speed = a.vel.mag();
    if (speed < .001) return force;
    const desired = a.vel.copy().add(force);
    const angle = a.vel.heading();
    const error = Math.atan2(Math.sin(desired.heading() - angle), Math.cos(desired.heading() - angle));
    const rate = FlightSteering.turnRate(a);
    const heading = angle + Math.max(-rate, Math.min(rate, error));
    // Fixed-wing aircraft must keep flying through a reversal or avoidance turn.
    const minimum = Math.min(a.maxSpeed, (a.model?.cruise ?? a.maxSpeed) * .65);
    const desiredSpeed = Math.max(minimum, Math.min(a.maxSpeed, desired.mag()));
    const nextSpeed = speed + Math.max(-a.maxForce * .2, Math.min(a.maxForce * .2, desiredSpeed - speed));
    return createVector(Math.cos(heading) * nextSpeed - a.vel.x, Math.sin(heading) * nextSpeed - a.vel.y).limit(a.maxForce);
  }
  static forceFor(a, target) {
    const speed = a.vel.mag();
    const current = speed > .001 ? Math.atan2(a.vel.y, a.vel.x) : (a.heading ?? 0) * Math.PI / 180;
    const desired = Math.atan2(target.y - a.pos.y, target.x - a.pos.x);
    let error = Math.atan2(Math.sin(desired - current), Math.cos(desired - current));
    // Stable side for exact reversals; avoids floating-point left/right flip-flopping.
    if (Math.abs(Math.abs(error) - Math.PI) < 1e-8) error = Math.PI;
    const rate = FlightSteering.turnRate(a);
    const angle = current + Math.max(-rate, Math.min(rate, error));
    const nextSpeed = speed + Math.max(-a.maxForce * .2, Math.min(a.maxForce * .2, a.maxSpeed - speed));
    return createVector(Math.cos(angle) * nextSpeed - a.vel.x, Math.sin(angle) * nextSpeed - a.vel.y).limit(a.maxForce);
  }
}
globalThis.FlightSteering = FlightSteering;
