class MissionSystem {
  constructor(session, options = {}) {
    this.session = session;
    this.id = options.id ?? 'FREE_PLAY';
    this.label = options.label ?? 'Session libre';
    this.targets = { arrivals: options.arrivals ?? session.arrivals.length,
      departures: options.departures ?? session.departures.departures.length };
    this.completed = { arrivals: 0, departures: 0 };
    this.score = options.startingScore ?? 1000;
    this.scoreBreakdown = { arrivals: 0, departures: 0, collisions: 0 };
    this.status = 'RUNNING';
    this.events = [];
    this.seen = new Set();
    this.collisions = new Set();
    this.continuous = options.continuous ?? false;
  }

  beforeStep() {
    if (this.status !== 'RUNNING') return;
    if (typeof this.session.resolveAirCollisions === 'function') return;
    const aircraft = this.session.simulation.entities.filter(entity => entity instanceof Airplane);
    for (let i = 0; i < aircraft.length; i += 1) {
      for (let j = i + 1; j < aircraft.length; j += 1) {
        const first = aircraft[i];
        const second = aircraft[j];
        const distance = Math.hypot(first.pos.x - second.pos.x, first.pos.y - second.pos.y);
        if (Math.abs((first.altitude ?? 0) - (second.altitude ?? 0)) < 500 && distance < ((first.r ?? 0) + (second.r ?? 0)) * 0.8) {
          const key = [first.callsign, second.callsign].sort().join('|');
          if (!this.collisions.has(key)) {
            this.collisions.add(key);
            this.score -= 500;
            this.scoreBreakdown.collisions += 1;
            this.events.push({ type: 'COLLISION', callsigns: key, step: this.session.simulation.stepCount });
          }
        }
      }
    }
  }

  registerCollision(first, second) {
    const key = [first.callsign, second.callsign].sort().join('|');
    if (this.collisions.has(key)) return;
    this.collisions.add(key); this.score -= 500; this.scoreBreakdown.collisions += 1;
    this.events.push({ type: 'COLLISION', callsigns: key, step: this.session.simulation.stepCount });
    if (!this.continuous) this.status = 'FAILED';
  }

  afterStep() {
    if (this.status !== 'RUNNING') return;
    for (const aircraft of this.session.arrivals) {
      if (aircraft.state === 'PARKED' && !this.seen.has(`arrival:${aircraft.callsign}`)) {
        this.seen.add(`arrival:${aircraft.callsign}`);
        this.completed.arrivals += 1;
        this.score += 250;
        this.scoreBreakdown.arrivals += 1;
        this.events.push({ type: 'ARRIVAL_COMPLETE', callsign: aircraft.callsign });
      }
    }
    for (const aircraft of this.session.departures.departures) {
      const departureFinished = aircraft.departureExitFix
        ? !aircraft.destroyed && this.session.traffic?.archived.some(entry => entry.aircraft === aircraft && (!entry.reason || entry.reason === 'AIRBORNE'))
        : aircraft.state === 'AIRBORNE';
      if (departureFinished && !this.seen.has(`departure:${aircraft.callsign}`)) {
        this.seen.add(`departure:${aircraft.callsign}`);
        this.completed.departures += 1;
        this.score += 250;
        this.scoreBreakdown.departures += 1;
        this.events.push({ type: 'DEPARTURE_COMPLETE', callsign: aircraft.callsign });
      }
    }
    if (!this.continuous && this.completed.arrivals >= this.targets.arrivals && this.completed.departures >= this.targets.departures) {
      this.status = 'COMPLETED';
      this.events.push({ type: 'MISSION_COMPLETE', score: this.score });
    }
  }

  snapshot() {
    return { id: this.id, label: this.label, status: this.status, score: this.score,
      completed: { ...this.completed }, targets: { ...this.targets }, scoreBreakdown: { ...this.scoreBreakdown }, events: this.events.slice(-8) };
  }
}

if (typeof globalThis !== 'undefined') globalThis.MissionSystem = MissionSystem;
if (typeof module !== 'undefined' && module.exports) module.exports = MissionSystem;
