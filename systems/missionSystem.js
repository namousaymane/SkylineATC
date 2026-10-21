class MissionSystem {
  constructor(session, options = {}) {
    this.session = session;
    this.id = options.id ?? 'FREE_PLAY';
    this.label = options.label ?? 'Session libre';
    this.targets = { arrivals: options.arrivals ?? session.arrivals.length,
      departures: options.departures ?? session.departures.departures.length };
    this.completed = { arrivals: 0, departures: 0 };
    this.score = options.startingScore ?? 1000;
    this.points = {
      arrival: options.points?.arrival ?? 250,
      departure: options.points?.departure ?? 250,
      collision: options.points?.collision ?? 500
    };
    this.scoreBreakdown = { arrivals: 0, departures: 0, collisions: 0 };
    this.status = 'RUNNING';
    this.events = [];
    this.seen = new Set();
    this.collisions = new Set();
    this.continuous = options.continuous ?? false;
    this.startedAtStep = session.simulation.stepCount ?? 0;
    this.elapsedSteps = 0;
    this.timeLimitSteps = Number.isFinite(options.timeLimitSteps) && options.timeLimitSteps > 0
      ? Math.floor(options.timeLimitSteps) : 0;
  }

  beforeStep() {
    if (this.status !== 'RUNNING') return;
    this.elapsedSteps = Math.max(0, (this.session.simulation.stepCount ?? 0) - this.startedAtStep);
    if (this.timeLimitSteps > 0 && this.elapsedSteps >= this.timeLimitSteps) {
      this.status = 'FAILED';
      this.session.simulation.paused = true;
      this.events.push({ type: 'TIME_LIMIT', step: this.session.simulation.stepCount });
      return;
    }
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
            this.registerCollision(first, second);
          }
        }
      }
    }
  }

  registerCollision(first, second) {
    if (this.status !== 'RUNNING') return;
    const key = [first.callsign, second.callsign].sort().join('|');
    if (this.collisions.has(key)) return;
    this.collisions.add(key); this.score -= this.points.collision; this.scoreBreakdown.collisions += 1;
    this.events.push({ type: 'COLLISION', callsigns: key, step: this.session.simulation.stepCount });
    if (!this.continuous) { this.status = 'FAILED'; this.session.simulation.paused = true; }
  }

  afterStep() {
    if (this.status !== 'RUNNING') return;
    for (const aircraft of this.session.arrivals) {
      if (!aircraft.destroyed && aircraft.state === 'PARKED' && !this.seen.has(`arrival:${aircraft.callsign}`)) {
        this.seen.add(`arrival:${aircraft.callsign}`);
        this.completed.arrivals += 1;
        this.score += this.points.arrival;
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
        this.score += this.points.departure;
        this.scoreBreakdown.departures += 1;
        this.events.push({ type: 'DEPARTURE_COMPLETE', callsign: aircraft.callsign });
      }
    }
    if (!this.continuous && this.completed.arrivals >= this.targets.arrivals && this.completed.departures >= this.targets.departures) {
      this.status = 'COMPLETED';
      this.session.simulation.paused = true;
      this.events.push({ type: 'MISSION_COMPLETE', score: this.score });
    }
    if (this.status === 'RUNNING' && this.timeLimitSteps > 0 && (this.session.simulation.stepCount - this.startedAtStep + 1) >= this.timeLimitSteps) {
      this.elapsedSteps = this.timeLimitSteps;
      this.status = 'FAILED'; this.session.simulation.paused = true;
      this.events.push({ type: 'TIME_LIMIT', step: this.session.simulation.stepCount });
    }
  }

  snapshot() {
    const elapsedSteps = Math.max(this.elapsedSteps, (this.session.simulation.stepCount ?? 0) - this.startedAtStep);
    const remainingSteps = this.timeLimitSteps > 0 ? Math.max(0, this.timeLimitSteps - elapsedSteps) : null;
    return { id: this.id, label: this.label, status: this.status, score: this.score,
      points: { ...this.points }, elapsedSteps, timeLimitSteps: this.timeLimitSteps,
      timeRemainingSeconds: remainingSteps === null ? null : remainingSteps * (this.session.simulation.step ?? 1 / 60),
      completed: { ...this.completed }, targets: { ...this.targets }, scoreBreakdown: { ...this.scoreBreakdown }, events: this.events.slice(-8) };
  }
}

if (typeof globalThis !== 'undefined') globalThis.MissionSystem = MissionSystem;
if (typeof module !== 'undefined' && module.exports) module.exports = MissionSystem;
