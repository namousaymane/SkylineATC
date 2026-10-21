class Separation {
  static exempt(first, second) {
    const a = first.source ?? first; const b = second.source ?? second;
    return a.destroyed || b.destroyed || a.interceptTarget === b || b.interceptTarget === a ||
      (a.mission === 'EXIT' && a.departurePartner === b) || (b.mission === 'EXIT' && b.departurePartner === a) ||
      (a.escortPartner === b && b.escortPartner === a);
  }
  static altitudeBand(aircraft) {
    const current = Number.isFinite(aircraft?.altitude) ? aircraft.altitude : 0;
    const assigned = aircraft?.altitudeOrderActive && Number.isFinite(aircraft?.assignedAltitude) && aircraft.assignedAltitude > 0 ? aircraft.assignedAltitude : current;
    return { low: Math.min(current, assigned), high: Math.max(current, assigned) };
  }

  static verticalGap(first, second) {
    const a = Separation.altitudeBand(first); const b = Separation.altitudeBand(second);
    if (a.high >= b.low && b.high >= a.low) return 0;
    return Math.max(a.low, b.low) - Math.min(a.high, b.high);
  }

  static closestApproach(vehicle, peer, horizon = 90) {
    const rx = peer.pos.x - vehicle.pos.x; const ry = peer.pos.y - vehicle.pos.y;
    const vx = (peer.vel?.x ?? 0) - (vehicle.vel?.x ?? 0); const vy = (peer.vel?.y ?? 0) - (vehicle.vel?.y ?? 0);
    const speedSq = vx * vx + vy * vy;
    const time = speedSq > 1e-9 ? Math.max(0, Math.min(horizon, -(rx * vx + ry * vy) / speedSq)) : 0;
    const dx = rx + vx * time; const dy = ry + vy * time;
    return { time, distance: Math.hypot(dx, dy), dx, dy };
  }

  static advisoryFor(vehicle, peers = [], options = {}) {
    const range = options.advisoryRange ?? 6 * (vehicle.tcasUnitsPerNm ?? 370.4);
    let advisory = null;
    for (const peer of peers) {
      if (!peer || peer === vehicle || peer.source === vehicle || !(peer.altitude > 0) || !(vehicle.altitude > 0)) continue;
      if (Separation.exempt(vehicle, peer)) continue;
      const vertical = Separation.verticalGap(vehicle, peer);
      if (vertical > (options.advisoryVertical ?? 1200)) continue;
      const cpa = Separation.closestApproach(vehicle, peer, options.lookAhead ?? 90);
      const current = Math.hypot(peer.pos.x - vehicle.pos.x, peer.pos.y - vehicle.pos.y);
      const rx = peer.pos.x - vehicle.pos.x; const ry = peer.pos.y - vehicle.pos.y;
      const rvx = (peer.vel?.x ?? 0) - (vehicle.vel?.x ?? 0); const rvy = (peer.vel?.y ?? 0) - (vehicle.vel?.y ?? 0);
      const closing = rx * rvx + ry * rvy < 0;
      if (Math.min(current, cpa.distance) > range || (!closing && current > (options.raRange ?? 150))) continue;
      const level = vertical <= (options.raVertical ?? 600) && cpa.distance <= (options.raRange ?? 150) ? 'RA' : 'TA';
      if (!advisory || (level === 'RA' && advisory.level !== 'RA') || (level === advisory.level && cpa.distance < advisory.distance)) advisory = { level, callsign: peer.callsign, distance: cpa.distance, time: cpa.time };
    }
    return advisory;
  }

  static forceFor(vehicle, peers = [], options = {}) {
    const radius = options.radius ?? 150;
    const vertical = options.verticalThreshold ?? 600;
    const result = createVector(0, 0);
    let count = 0;
    for (const peer of peers) {
      if (!peer || peer === vehicle || peer.source === vehicle) continue;
      if (Separation.exempt(vehicle, peer)) continue;
      if (options.airborneOnly && (!(vehicle.altitude > 0) || !(peer.altitude > 0))) continue;
      if (vehicle.altitude !== undefined && peer.altitude !== undefined &&
        Separation.verticalGap(vehicle, peer) > vertical) continue;
      const currentDx = vehicle.pos.x - peer.pos.x;
      const currentDy = vehicle.pos.y - peer.pos.y;
      const currentDistanceSquared = currentDx * currentDx + currentDy * currentDy;
      const cpa = options.lookAhead ? Separation.closestApproach(vehicle, peer, options.lookAhead) : null;
      const useCpa = cpa && cpa.time > 0 && cpa.distance < Math.sqrt(currentDistanceSquared);
      const dx = useCpa ? -cpa.dx : currentDx;
      const dy = useCpa ? -cpa.dy : currentDy;
      const distanceSquared = useCpa ? cpa.distance * cpa.distance : currentDistanceSquared;
      if (distanceSquared >= radius * radius) continue;
      const distance = Math.sqrt(distanceSquared);
      if (options.airborneOnly && vehicle.vel.magSq() > .0001) {
        // A longitudinal repulsion can stop a head-on aircraft. Resolve laterally
        // instead: a stable right-hand turn on both opposing tracks opens space.
        const speed = vehicle.vel.mag(); const right = createVector(-vehicle.vel.y / speed, vehicle.vel.x / speed);
        const side = dx * right.x + dy * right.y;
        const sign = Math.abs(side) < .01 ? 1 : Math.sign(side);
        result.add(right.mult(sign / Math.max(1, distanceSquared)));
      } else if (distance === 0) {
        // Stable opposing directions, including co-located aircraft at rest.
        const ownKey = String(vehicle.callsign ?? peers.indexOf(vehicle));
        const peerKey = String(peer.callsign ?? peers.indexOf(peer));
        result.add(createVector(ownKey < peerKey ? -1 : 1, 0).mult(1));
      } else {
        result.add(createVector(dx / distance, dy / distance).mult(1 / Math.max(1, distanceSquared)));
      }
      count += 1;
    }
    if (count === 0 || result.magSq() === 0) return result;
    // Keep inverse-square strength instead of normalizing it away.
    result.mult((options.maxForce ?? vehicle.maxForce) * radius * radius / 16);
    result.limit(options.maxForce ?? vehicle.maxForce);
    return result;
  }
}

if (typeof globalThis !== 'undefined') globalThis.Separation = Separation;
if (typeof module !== 'undefined' && module.exports) module.exports = Separation;
