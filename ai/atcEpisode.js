/** One isolated, seeded airport session; every policy sees exactly the same demand. */
class ATCEpisode {
  constructor({ airport, brain = null, seed = 2026, maxSteps = 12000, weatherMode = 'AUTO', trafficLevel = 'NORMAL' } = {}) {
    this.seed = seed >>> 0; this.maxSteps = maxSteps; this.steps = 0; this.done = false; this.fitness = 0;
    this.brain = brain; this.seen = new Set(); this.activeConflicts = new Set(); this.raActive = new Set(); this.incursionActive = new Set();
    this.metrics = { arrivals: 0, departures: 0, collisions: 0, separationLosses: 0, ra: 0, incursions: 0, goArounds: 0, waitingSteps: 0, commands: 0, rejected: 0, weatherExposure: 0, requested: 0, completed: 0, throughput: 0, meanWaitSeconds: 0, safe: true, success: false };
    this.session = new TowerSession({ airport, runway: airport.runway ?? airport.runways[0], parkings: airport.parking, randomTraffic: false, seed: this.seed });
    this.controller = this.session.aiAtc;
    if (brain) { ATCPolicy.validate(brain); this.controller.brain = brain; }
    this.controller.enabled = true;
    const rng = new SeededRandom(this.seed); const s = this.session; const nm = (airport.metersToPixels ?? .2) * 1852;
    const runway = s.directions.find(r => r.lengthMeters >= AircraftModels.B738.minRunway) ?? s.runway;
    this.runway = runway; this.unitsPerNm = nm;
    const count = trafficLevel === 'CALM' ? 1 : trafficLevel === 'BUSY' ? 3 : 2;
    this.aircraft = [];
    for (let i = 0; i < count; i++) {
      const distance = (5 + i * 5 + rng.between(0, .4)) * nm;
      const lateral = rng.between(-.25, .25) * nm;
      const a = s.spawnInbound({ callsign: `ARR${i + 1}`, modelId: 'B738', runway, distance, lateral, altitude: 2000 + i * 1000, wanderEnabled: false });
      const axis = { x: (runway.x2 - runway.x1) / runway.length, y: (runway.y2 - runway.y1) / runway.length };
      a.vel.set(axis.x * a.maxSpeed, axis.y * a.maxSpeed); a.heading = Math.atan2(axis.y, axis.x) * 180 / Math.PI;
      this.aircraft.push(a);
    }
    // Leave a stand for arrivals; retain real stand capacity and taxi connectivity.
    const stands = [...s.departures.parkings.values()].filter(p => p.maxWingspan >= AircraftModels.B738.span);
    for (let i = 0; i < Math.min(count, Math.max(1, stands.length - 1)); i++) {
      const a = s.createDepartureFromFreeParking(ModelAircraft, { callsign: `DEP${i + 1}`, modelId: 'B738' });
      if (a) this.aircraft.push(a);
    }
    const stormy = weatherMode === 'STORM' || (weatherMode === 'AUTO' && rng.next() < .35);
    if (stormy) {
      const p = RunwayDirections.point(runway, -nm * 3.7, nm * 1.8);
      const weatherRng = new SeededRandom(this.seed ^ 0x51c12);
      s.weather.addStorm(p.x, p.y, { radius: nm * .45, intensity: .7, maxSpeed: .03, vx: 0, vy: .01, wanderRandom: () => weatherRng.between(-.025, .025) });
    }
    this.metrics.requested = this.aircraft.length; this.weather = stormy ? 'ORAGES' : 'DÉGAGÉ';
    s.simulation.lastTime = 0;
    this.signature = this.aircraft.map(a => `${a.callsign}:${a.pos.x.toFixed(6)},${a.pos.y.toFixed(6)},${a.altitude}`).join('|') + `:${this.weather}`;
  }
  sample() {
    const m = this.metrics; const s = this.session; const active = this.aircraft.filter(a => !a.destroyed);
    for (const a of this.aircraft) {
      const complete = a.operation === 'ARRIVAL' ? a.state === 'PARKED' : a.state === 'AIRBORNE' || s.traffic.archived.some(entry => entry.aircraft === a && entry.reason === 'AIRBORNE');
      if (complete && !this.seen.has(a)) { this.seen.add(a); m[a.operation === 'ARRIVAL' ? 'arrivals' : 'departures']++; }
      if (a.destroyed && !this.seen.has(`destroyed:${a.callsign}`)) { this.seen.add(`destroyed:${a.callsign}`); m.collisions++; }
      if (['PARKED', 'READY_TAXI', 'HOLD_SHORT', 'WAITING_RUNWAY_CROSSING', 'LINE_UP_WAIT', 'WAITING_TAXI', 'NAV_HOLD', 'NAV_HOLD_ENTRY'].includes(a.state) && !complete) m.waitingSteps++;
      if (a.state === 'GO_AROUND') {
        if (!this.seen.has(`ga-active:${a.callsign}`)) { m.goArounds++; this.seen.add(`ga-active:${a.callsign}`); }
      } else this.seen.delete(`ga-active:${a.callsign}`);
      const ra = a.tcasAdvisory?.level === 'RA';
      if (ra && !this.raActive.has(a)) m.ra++;
      if (ra) this.raActive.add(a); else this.raActive.delete(a);
      if (a.altitude > 0 && s.weather.storms.some(storm => GroundOperations.distance(a.pos, storm.pos) < storm.radius)) m.weatherExposure++;
      const incursion = a.altitude === 0 && !['PARKED', 'DESTROYED'].includes(a.state) && s.directions.some(r => {
        const p = GroundOperations.projection(a.pos, r);
        return p.t >= 0 && p.t <= 1 && GroundOperations.distance(a.pos, p.point) < r.width / 2 && !s.runwayController.owns(r.id, a);
      });
      if (incursion && !this.incursionActive.has(a)) m.incursions++;
      if (incursion) this.incursionActive.add(a); else this.incursionActive.delete(a);
    }
    const conflicts = new Set();
    for (let i = 0; i < active.length; i++) for (let j = i + 1; j < active.length; j++) {
      const a = active[i]; const b = active[j];
      if (a.altitude <= 0 || b.altitude <= 0 || Separation.exempt(a, b)) continue;
      if (Math.abs(a.altitude - b.altitude) < 1000 && GroundOperations.distance(a.pos, b.pos) < this.unitsPerNm * 3) {
        const key = [a.callsign, b.callsign].sort().join('|'); conflicts.add(key);
        if (!this.activeConflicts.has(key)) m.separationLosses++;
      }
    }
    this.activeConflicts = conflicts;
    const decision = this.controller.lastDecision;
    if (decision && decision.step !== this.lastDecisionStep) { this.lastDecisionStep = decision.step; if (decision.type !== 'WAIT') { m.commands++; if (!decision.accepted) m.rejected++; } }
    m.completed = m.arrivals + m.departures;
    m.safe = m.collisions === 0 && m.separationLosses === 0 && m.ra === 0 && m.incursions === 0;
    m.meanWaitSeconds = m.waitingSteps / 60 / Math.max(1, m.requested);
    m.throughput = m.completed / (this.maxSteps / 60 / 3600);
    const efficiency = m.completed * 1000 - (m.requested - m.completed) * 200 - m.waitingSteps * .002 - m.goArounds * 80 - m.rejected * 5 - m.weatherExposure * .01;
    // No amount of throughput can compensate for a safety incident.
    this.fitness = (m.safe ? 100000 : -1000000 - m.collisions * 100000 - m.separationLosses * 20000 - m.ra * 10000 - m.incursions * 20000) + Math.max(-50000, Math.min(50000, efficiency));
    m.success = m.safe && m.completed >= Math.ceil(m.requested * .8);
  }
  step() {
    if (this.done) return;
    this.session.step(); this.steps++; this.sample();
    if (this.steps >= this.maxSteps || this.metrics.collisions > 0) this.done = true;
  }
}
globalThis.ATCEpisode = ATCEpisode;
