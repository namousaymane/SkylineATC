class WeatherEffects {
  static forceFor(aircraft, storms = [], options = {}) {
    const force = createVector(0, 0);
    if (!aircraft?.pos || aircraft.altitude <= 0) return force;
    const influenceScale = options.influenceScale ?? 2.2;
    // Turbulence is subordinate to obstacle avoidance. While a storm is in
    // the projected flight corridor, its lateral impulse must not cancel the
    // deterministic escape side selected by the avoidance behavior.
    const avoidanceThreat = aircraft.avoidanceThreat ?? 0;
    const turbulenceScale = options.suppressDuringAvoidance === false
      ? 1
      : Math.max(0, 1 - avoidanceThreat);
    for (const storm of storms) {
      if (!storm?.pos) continue;
      const dx = aircraft.pos.x - storm.pos.x;
      const dy = aircraft.pos.y - storm.pos.y;
      const distance = Math.hypot(dx, dy);
      const zone = (storm.hitboxRadius ?? storm.radius ?? storm.r ?? 0) * influenceScale + (aircraft.r ?? 0);
      if (!(zone > 0) || distance >= zone) continue;
      const falloff = 1 - distance / zone;
      const direction = distance > 1e-9 ? createVector(dx / distance, dy / distance) : createVector(1, 0);
      // Turbulence is a lateral disturbance around the cell, not a teleport or a target change.
      const lateral = createVector(-direction.y, direction.x);
      const sign = Math.sin((storm.phase ?? 0) + distance * 0.05) >= 0 ? 1 : -1;
      lateral.mult(sign * falloff * (storm.intensity ?? 1) * turbulenceScale * (options.strength ?? aircraft.maxForce));
      force.add(lateral);
    }
    return force.limit(options.maxForce ?? aircraft.maxForce);
  }

  static isUnstableApproach(aircraft, storms = [], threshold = 0.65) {
    return storms.some(storm => {
      if (!storm?.pos || (storm.intensity ?? 1) < threshold) return false;
      const distance = Math.hypot(aircraft.pos.x - storm.pos.x, aircraft.pos.y - storm.pos.y);
      return distance <= (storm.hitboxRadius ?? storm.radius ?? storm.r ?? 0) + (aircraft.r ?? 0);
    });
  }
}

if (typeof globalThis !== 'undefined') globalThis.WeatherEffects = WeatherEffects;
if (typeof module !== 'undefined' && module.exports) module.exports = WeatherEffects;
