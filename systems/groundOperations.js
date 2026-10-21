/** Sequential scalar-projection following, with explicit runway checkpoints. */
class GroundOperations {
  constructor(session) { this.session = session; }
  static distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  static projection(point, runway) { return PathFollowing.project(point, { x: runway.x1, y: runway.y1 }, { x: runway.x2, y: runway.y2 }); }

  departureRoute(parking, runway) {
    const route = AirportGeometry.route(this.session.airport, parking, { x: runway.x1, y: runway.y1 });
    if (!route) return null;
    return this.checkpoints(route, runway.physicalId);
  }

  checkpoints(route, departurePhysical = null) {
    const out = [{ ...route[0] }];
    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1]; const b = route[i]; const stops = [];
      for (const r of this.session.airport.runways) {
        const distance = p => AirportGeometry.distanceToSegment(p, { x: r.x1, y: r.y1 }, { x: r.x2, y: r.y2 });
        const boundary = r.width / 2 + 3;
        // Detect an entry even when a long graph edge traverses the whole strip.
        const count = Math.max(2, Math.ceil(GroundOperations.distance(a, b) / 2)); let prior = 0; let entered = false;
        for (let j = 1; j <= count; j++) {
          const t = j / count; const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
          if (distance(a) >= boundary && distance(p) < boundary) {
            let low = prior; let high = t;
            for (let k = 0; k < 20; k++) { const mid = (low + high) / 2; const q = { x: a.x + (b.x - a.x) * mid, y: a.y + (b.y - a.y) * mid }; if (distance(q) < boundary) high = mid; else low = mid; }
            stops.push({ t: low, x: a.x + (b.x - a.x) * low, y: a.y + (b.y - a.y) * low, type: r.id === departurePhysical ? 'HOLD_SHORT' : 'RUNWAY_CROSSING', runwayId: r.id }); entered = true; break;
          }
          prior = t;
        }
        if (entered && r.id === departurePhysical) break;
      }
      for (const stop of stops.sort((p, q) => p.t - q.t)) out.push(stop);
      out.push({ ...b });
    }
    // If a taxiway ends just short of the threshold, the final node still holds.
    if (departurePhysical && !out.some(p => p.type === 'HOLD_SHORT')) {
      if (out.length < 3) return null;
      out[out.length - 2] = { ...out[out.length - 2], type: 'HOLD_SHORT', runwayId: departurePhysical };
    }
    return out.filter((p, i) => !i || p.type || GroundOperations.distance(p, out[i - 1]) > .05);
  }

  start(aircraft, route, phase, onComplete) {
    if (!route || route.length < 2) return false;
    aircraft.groundRoute = route; aircraft.routeIndex = 1; aircraft.groundPhase = phase;
    aircraft.routeComplete = onComplete; aircraft.holdPosition = false; aircraft.guidance = null;
    aircraft.pathLookAhead = 2; aircraft.pathPredictionFrames = 3;
    aircraft.rayonZoneDeFreinage = 5; aircraft.maxForce = .07;
    return true;
  }

  beforeStep() {
    for (const a of this.session.simulation.entities.filter(e => e instanceof ModelAircraft && e.altitude === 0)) {
      if (a.crossingRunway && !this.onRunway(a, a.crossingRunway, 4) && a.crossingEntered) {
        this.session.runwayController.release(a.crossingRunway, a);
        this.session.recordEvent(`${a.callsign} : traversée terminée, piste dégagée.`); a.crossingRunway = null;
      }
      if (a.crossingRunway && this.onRunway(a, a.crossingRunway, 0)) a.crossingEntered = true;
      if (a.destroyed || !a.groundRoute || a.holdPosition) continue;
      const route = a.groundRoute; const target = route[a.routeIndex];
      if (!target) continue;
      a.path = [route[a.routeIndex - 1], target]; a.target = null;
      a.maxSpeed = a.groundPhase === 'PUSHBACK' ? a.model.taxi * .5 : a.model.taxi;
      a.pathArriveAtEnd = Boolean(target.type || a.routeIndex === route.length - 1);
      // Arrival can stop early on a tiny segment; always preserve physical integration.
      if (GroundOperations.distance(a.pos, target) < .55 && (!a.pathArriveAtEnd || a.vel.mag() < .09)) {
        if (target.type && !target.authorized) {
          a.state = target.type === 'HOLD_SHORT' ? 'HOLD_SHORT' : 'WAITING_RUNWAY_CROSSING';
          a.holdPosition = true; a.path = null; a.target = null; a.pendingCheckpoint = target; continue;
        }
        a.routeIndex++;
        if (a.routeIndex >= route.length) {
          a.groundRoute = null; a.path = null; a.target = null; a.holdPosition = true;
          const complete = a.routeComplete; a.routeComplete = null; complete?.();
        }
      }
    }
  }

  onRunway(aircraft, id, extra = 0) {
    const r = this.session.runwayController.resources.get(id)?.runway;
    if (!r) return false;
    const footprint = aircraft.model ? Math.max(aircraft.model.length, aircraft.model.span) * .125 : aircraft.r ?? 0;
    return AirportGeometry.distanceToSegment(aircraft.pos, { x: r.x1, y: r.y1 }, { x: r.x2, y: r.y2 }) < r.width / 2 + extra + footprint;
  }

  resumeCheckpoint(a) {
    if (!a.pendingCheckpoint) return false;
    a.pendingCheckpoint.authorized = true; a.pendingCheckpoint = null;
    // Let the follower consume the authorized point, including a final checkpoint.
    a.holdPosition = false; return true;
  }
}
globalThis.GroundOperations = GroundOperations;
