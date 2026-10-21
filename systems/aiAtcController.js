/** Optional high-level tower controller. It issues only normal TowerSession clearances. */
class AIAtcController {
  constructor(session) {
    this.session = session;
    this.enabled = false;
    this.lastActionAt = new Map();
    this.cooldownSteps = 24;
    this.brain = null; this.stateSince = new Map(); this.decisions = []; this.lastDecision = null;
    this.lastDecisionStep = -Infinity; this.decisionInterval = 24;
  }

  setBrain(data) {
    const brain = data instanceof NeuralNetwork ? data.clone() : NeuralNetwork.deserialize(data);
    ATCPolicy.validate(brain); this.brain = brain; this.lastDecisionStep = -Infinity;
    this.session.recordEvent('Contrôleur neuronal ATC installé — les avions conservent leurs steering behaviors.');
    return brain;
  }

  traffic() { return this.session.simulation.entities.filter(a => a instanceof ModelAircraft && !a.destroyed && a.operation !== 'HELICOPTER' && !(a instanceof FighterJet)); }

  nearestArrival(runway, except = null) {
    const nm = (this.session.airport.metersToPixels ?? .2) * 1852;
    return this.traffic().filter(a => a !== except && a.operation === 'ARRIVAL' && a.guidance && a.altitude > 0 &&
      this.session.direction(a.assignedRunway)?.physicalId === runway.physicalId)
      .reduce((min, a) => Math.min(min, Math.hypot(a.pos.x - runway.x1, a.pos.y - runway.y1) / nm), 99);
  }

  approachSlot(a, runway) {
    const s = this.session; const nm = (s.airport.metersToPixels ?? .2) * 1852;
    if (s.departures.parkings.get(a.parkingId)?.reservedFor !== a.callsign && !s.findFreeParking(a.model)) return false;
    if (this.nearestArrival(runway, a) < 6) return false;
    return !this.traffic().some(b => b !== a && b.operation === 'ARRIVAL' && b.altitude > 0 && b.guidance &&
      s.direction(b.assignedRunway)?.physicalId === runway.physicalId && Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y) < 4 * nm);
  }

  groundMovementAvailable(a) {
    if (this.traffic().some(b => b !== a && b.altitude === 0 && b.groundRoute && !b.holdPosition)) return false;
    // Do not start a departure pushback into the only taxiway while an
    // arrival is already being vectored to the field.  The real tower keeps
    // the stand/taxiway available for the inbound aircraft, then releases
    // the departure once the arrival is parked or has left the surface.
    if (a.operation === 'DEPARTURE' && this.traffic().some(b => b !== a && b.operation === 'ARRIVAL' && ['ROLL_OUT', 'WAITING_TAXI', 'TAXI_IN'].includes(b.state))) return false;
    return true;
  }

  candidates() {
    const s = this.session; const step = s.simulation.stepCount; const nm = (s.airport.metersToPixels ?? .2) * 1852;
    const traffic = this.traffic(); const choices = [{ type: 'WAIT', priority: 0 }];
    const add = (type, aircraft, priority, extra = {}) => choices.push({ type, aircraft, priority, ...extra });
    for (const a of traffic) {
      if (this.stateSince.get(a)?.state !== a.state) this.stateSince.set(a, { state: a.state, step });
      if (step - (this.lastActionAt.get(a) ?? -Infinity) < this.cooldownSteps || a.outsideSectorTarget || a.tcasAdvisory?.level === 'RA') continue;
      const age = Math.min(1, (step - this.stateSince.get(a).step) / 3600);
      const r = s.direction(a.assignedRunway ?? a.expectedRunway) ?? s.runway;
      if (a.operation === 'ARRIVAL') {
        if (['INBOUND', 'HOLDING', 'NAV_HEADING', 'NAV_DIRECT', 'NAV_HOLD_ENTRY', 'NAV_HOLD', 'GO_AROUND'].includes(a.state) && (a.state !== 'GO_AROUND' || (a.goAroundAge ?? 0) > 240)) {
          // Prefer the expected flow; reciprocal runways are not opened simultaneously.
          const expected = s.direction(a.expectedRunway) ?? s.runway;
          const runways = s.directions.filter(q => q.lengthMeters >= a.model.minRunway && (q.id === expected.id || q.physicalId !== expected.physicalId));
          for (const runway of runways) if (this.approachSlot(a, runway)) add('APPROACH', a, 4 + age + (a.emergency ? 3 : 0), { runway });
          if (!runways.some(q => this.approachSlot(a, q)) && !a.airNavigation?.holding) {
            const fix = s.navPoints.filter(p => !['EXIT', 'FINAL'].includes(p.type)).sort((p, q) => GroundOperations.distance(a.pos, p) - GroundOperations.distance(a.pos, q))[0];
            if (fix) add('HOLD', a, 3 + age, { fix });
          }
        }
        if (['APPROACH', 'FINAL'].includes(a.state) && !a.landingCleared && s.canAuthorizeLanding(a) && this.runwayAvailable(a)) add('LAND', a, 8 + age);
        if (['APPROACH', 'FINAL'].includes(a.state) && !this.runwayAvailable(a) && a.guidance.geometry(a.pos).along > -nm) add('GO_AROUND', a, 9);
        if (a.state === 'WAITING_TAXI' && this.groundMovementAvailable(a) && (s.departures.parkings.get(a.parkingId)?.reservedFor === a.callsign || s.findFreeParking(a.model))) add('TAXI', a, 6 + age);
        if (a.state === 'ROLL_OUT' && GroundOperations.projection(a.pos, r).t > .25 && a.vel.mag() <= Math.max(.95, a.model.taxi * 2.2) && s.findFreeParking(a.model)) add('EXPEDITE', a, 7);
      } else if (a.operation === 'DEPARTURE') {
        if (!a.departureExitFix && ['PARKED', 'READY_TAXI', 'TAXIING', 'HOLD_SHORT', 'LINING_UP', 'LINE_UP_WAIT'].includes(a.state)) {
          const bearing = AirNavigation.heading({ x: r.x1, y: r.y1 }, { x: r.x2, y: r.y2 });
          const exits = s.navPoints.filter(p => p.type === 'EXIT').sort((p, q) => Math.abs(((p.sectorBearing - bearing + 540) % 360) - 180) - Math.abs(((q.sectorBearing - bearing + 540) % 360) - 180));
          for (const fix of exits.slice(0, 3)) add('EXIT', a, 5 - Math.abs(((fix.sectorBearing - bearing + 540) % 360) - 180) / 180, { fix });
        } else if (a.state === 'PARKED' && a.assignedRunway && this.groundMovementAvailable(a)) add('PUSHBACK', a, 2 + age);
        // Taxi to the holding point is allowed while the runway is occupied
        // or an arrival is on final; the runway clearance is checked later
        // at LINEUP/TAKEOFF.  Holding departures at the pushback release
        // point blocks the inbound taxi route and creates a deadlock.
        const arrivalTooCloseForNewTaxi = this.nearestArrival(r) <= 6;
        if (a.state === 'READY_TAXI' && this.groundMovementAvailable(a) && !arrivalTooCloseForNewTaxi) add('TAXI', a, 3 + age);
        // Long enough for line-up and runway release before a final reaches the field.
        if (a.state === 'HOLD_SHORT' && a.vel.mag() <= .08 && this.runwayAvailable(a) && this.nearestArrival(r) > 5) add('LINEUP', a, 4 + age);
        if (a.state === 'LINE_UP_WAIT' && a.departureExitFix && this.runwayAvailable(a) && this.nearestArrival(r) > 3) add('TAKEOFF', a, 7 + age);
      }
      if (a.state === 'WAITING_RUNWAY_CROSSING' && a.pendingCheckpoint && !s.runwayController.blockedBy(a.pendingCheckpoint.runwayId, a) && this.nearestArrival(s.direction(a.pendingCheckpoint.runwayId) ?? r) > 4) add('CROSS', a, 5 + age);
      if (a.altitude > 0 && !a.guidance && a.tcasAdvisory?.level !== 'RA' && s.airNavigation.canControl(a) && !a.altitudeOrderActive) {
        const conflicts = traffic.filter(b => b !== a && b.altitude > 0 && Separation.verticalGap(a, b) < 1000 && Separation.closestApproach(a, b, 600).distance < 2 * nm);
        if (conflicts.length) {
          for (const delta of [1000, -1000, 1500, -1500]) {
            const altitude = Math.round((a.altitude + delta) / 500) * 500;
            if (altitude < 1000 || altitude > 12000) continue;
            if (traffic.some(b => b !== a && b.altitude > 0 && Math.abs((b.assignedAltitude ?? b.altitude) - altitude) < 1000 && Separation.closestApproach(a, b, 600).distance < 2 * nm)) continue;
            add('ALTITUDE', a, 9, { altitude }); break;
          }
        }
      }
    }
    for (const a of this.stateSince.keys()) if (!traffic.includes(a)) { this.stateSince.delete(a); this.lastActionAt.delete(a); }
    return choices;
  }

  execute(choice) {
    const s = this.session; const a = choice.aircraft;
    switch (choice.type) {
      case 'WAIT': return true;
      case 'APPROACH': {
        const parking = s.departures.parkings.get(a.parkingId)?.reservedFor === a.callsign ? null : s.findFreeParking(a.model);
        if (!s.assignRunway(a, choice.runway.id)) return false;
        if (parking) s.assignParking(a, parking.id);
        return true;
      }
      case 'LAND': return s.authorizeLanding(a);
      case 'EXIT': return s.assignDepartureExit(a, choice.fix.id);
      case 'PUSHBACK': return s.authorizePushback(a);
      case 'TAXI': { if (a.operation === 'ARRIVAL' && s.departures.parkings.get(a.parkingId)?.reservedFor !== a.callsign) { const p = s.findFreeParking(a.model); if (!p || !s.assignParking(a, p.id)) return false; } return s.authorizeTaxi(a); }
      case 'CROSS': return s.authorizeCrossing(a);
      case 'LINEUP': return s.authorizeLineUp(a);
      case 'TAKEOFF': return s.authorizeTakeoff(a);
      case 'ALTITUDE': return s.airNavigation.setAltitude(a, choice.altitude);
      case 'HOLD': return s.airNavigation.direct(a, choice.fix.id, { hold: true });
      case 'GO_AROUND': return s.goAround(a);
      case 'EXPEDITE': return s.expediteRunwayExit(a);
      default: return false;
    }
  }

  toggle(enabled = !this.enabled) {
    this.enabled = Boolean(enabled);
    this.session.recordEvent(`Contrôle IA ${this.enabled ? 'activé' : 'désactivé'} — les clairances restent visibles dans le journal.`);
    return this.enabled;
  }

  beforeStep() {
    if (!this.enabled) return;
    if (typeof ATCPolicy !== 'undefined') {
      const step = this.session.simulation.stepCount;
      if (step - this.lastDecisionStep < this.decisionInterval) return;
      this.lastDecisionStep = step;
      const ranked = ATCPolicy.rank(this, this.candidates(), this.brain);
      const choice = ranked[0]; const accepted = this.execute(choice);
      if (accepted && choice.aircraft) this.lastActionAt.set(choice.aircraft, step);
      if (this.brain) this.brain.predict(choice.inputs); // graph follows the chosen action, not the last candidate
      this.lastDecision = { type: choice.type, callsign: choice.aircraft?.callsign ?? '—', score: choice.score, accepted, inputs: choice.inputs, step };
      if (choice.type !== 'WAIT') { this.decisions.push(this.lastDecision); if (this.decisions.length > 30) this.decisions.shift(); }
      return;
    }
    const step = this.session.simulation.stepCount;
    const traffic = this.session.simulation.entities.filter(a => a instanceof ModelAircraft);
    for (const a of traffic) {
      if (a.operation === 'HELICOPTER' || a instanceof FighterJet) continue;
      if (step - (this.lastActionAt.get(a) ?? -Infinity) < this.cooldownSteps) continue;
      let changed = false;
      if (a.operation === 'ARRIVAL') changed = this.handleArrival(a);
      else if (a.operation === 'DEPARTURE') changed = this.handleDeparture(a);
      if (changed) this.lastActionAt.set(a, step);
    }
  }

  runwayAvailable(a) {
    const runway = a.assignedRunway && this.session.direction(a.assignedRunway);
    return Boolean(runway && !this.session.runwayController.blockedBy(runway.id, a));
  }

  handleArrival(a) {
    const s = this.session;
    if (a.emergency && ['7500', '7600'].includes(a.emergency.code) && !s.interceptNotices.has(a.callsign)) return s.scramble(a);
    if (a.outsideSectorTarget) return false;
    if (['INBOUND', 'HOLDING', 'NAV_HEADING', 'NAV_DIRECT', 'NAV_HOLD_ENTRY', 'NAV_HOLD'].includes(a.state)) {
      const runway = s.direction(a.expectedRunway) ?? s.runway;
      if ((a.assignedRunway !== runway.id || !a.guidance || a.state === 'INBOUND') && !s.runwayController.blockedBy(runway.id, a)) return s.assignRunway(a, runway.id);
    }
    if (['APPROACH', 'FINAL'].includes(a.state) && !a.landingCleared && s.canAuthorizeLanding(a) && this.runwayAvailable(a)) return s.authorizeLanding(a);
    if (a.state === 'WAITING_TAXI') {
      const parking = s.findFreeParking(a.model);
      if (!parking || !s.assignParking(a, parking.id)) return false;
      return s.authorizeTaxi(a);
    }
    return false;
  }

  handleDeparture(a) {
    const s = this.session;
    if (!a.departureExitFix && ['PARKED', 'READY_TAXI', 'TAXIING', 'HOLD_SHORT', 'LINING_UP', 'LINE_UP_WAIT'].includes(a.state)) {
      const runway = s.direction(a.assignedRunway);
      const bearing = runway ? (Math.atan2(runway.x2 - runway.x1, runway.y1 - runway.y2) * 180 / Math.PI + 360) % 360 : 0;
      const exits = s.navPoints.filter(point => point.type === 'EXIT');
      const fix = exits.reduce((best, point) => !best || Math.abs(((point.sectorBearing - bearing + 540) % 360) - 180) <
        Math.abs(((best.sectorBearing - bearing + 540) % 360) - 180) ? point : best, null);
      if (fix) return s.assignDepartureExit(a, fix.id);
    }
    if (a.state === 'PARKED') return s.authorizePushback(a);
    if (a.state === 'READY_TAXI') return s.authorizeTaxi(a);
    if (a.state === 'WAITING_RUNWAY_CROSSING' && a.pendingCheckpoint && !s.runwayController.blockedBy(a.pendingCheckpoint.runwayId, a)) return s.authorizeCrossing(a);
    if (a.state === 'HOLD_SHORT' && this.runwayAvailable(a)) return s.authorizeLineUp(a);
    if (a.state === 'LINE_UP_WAIT' && this.runwayAvailable(a)) return s.authorizeTakeoff(a);
    return false;
  }
}

globalThis.AIAtcController = AIAtcController;
if (typeof module !== 'undefined' && module.exports) module.exports = AIAtcController;
