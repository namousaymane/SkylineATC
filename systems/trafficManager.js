class TrafficManager {
  constructor(simulation, runwayController, options = {}) {
    this.simulation = simulation;
    this.runwayController = runwayController;
    this.aircraft = new Set();
    this.archived = [];
    this.taxiConflictRadius = options.taxiConflictRadius ?? 30;
  }

  add(aircraft) {
    if (!aircraft) return null;
    this.aircraft.add(aircraft);
    this.simulation.add(aircraft);
    return aircraft;
  }

  remove(aircraft, reason = 'COMPLETED') {
    if (!this.aircraft.delete(aircraft)) return false;
    this.simulation.remove(aircraft);
    this.archived.push({ aircraft, reason, step: this.simulation.stepCount });
    return true;
  }

  canUseRunway(runwayId, aircraft = null) {
    const resource = this.runwayController.resources.get(runwayId);
    return Boolean(resource && (!resource.owner || resource.owner === aircraft));
  }

  beforeStep(context) {
    const active = [...this.aircraft].filter(aircraft => !['PARKED', 'AIRBORNE'].includes(aircraft.state));
    for (const aircraft of active) aircraft.trafficHold = false;
    for (let index = 0; index < active.length; index += 1) {
      for (let otherIndex = index + 1; otherIndex < active.length; otherIndex += 1) {
        const first = active[index];
        const second = active[otherIndex];
        if (!this.isGround(first) || !this.isGround(second)) continue;
        if (this.conflict(first, second)) {
          const priority = this.priority(first, second);
          priority.waiting.trafficHold = true;
          priority.waiting.trafficConflict = priority.blocker.callsign ?? 'TRAFFIC';
        }
      }
    }
    context.traffic = this;
  }

  afterStep() {
    for (const aircraft of [...this.aircraft]) {
      if (aircraft.state === 'PARKED' && aircraft.departureController) continue;
      if (aircraft.state === 'AIRBORNE' || aircraft.state === 'PARKED') {
        if (aircraft.state === 'PARKED' || aircraft.archiveOnAirborne) this.remove(aircraft, aircraft.state);
      }
    }
  }

  isGround(aircraft) {
    return ['PARKED', 'PUSHBACK', 'TAXIING', 'WAITING_RUNWAY_CROSSING', 'HOLD_SHORT', 'LINE_UP_WAIT', 'CLEARED_TAKEOFF', 'TAKEOFF_ROLL'].includes(aircraft.state);
  }

  conflict(first, second) {
    const firstTarget = first.path?.[first.path.length - 1];
    const secondTarget = second.path?.[second.path.length - 1];
    if (firstTarget && secondTarget && Math.hypot(firstTarget.x - secondTarget.x, firstTarget.y - secondTarget.y) < this.taxiConflictRadius) return true;
    return Math.hypot(first.pos.x - second.pos.x, first.pos.y - second.pos.y) < this.taxiConflictRadius;
  }

  priority(first, second) {
    const firstRank = first.state === 'TAKEOFF_ROLL' ? 3 : first.state === 'LINE_UP_WAIT' ? 2 : 1;
    const secondRank = second.state === 'TAKEOFF_ROLL' ? 3 : second.state === 'LINE_UP_WAIT' ? 2 : 1;
    if (firstRank >= secondRank) return { blocker: first, waiting: second };
    return { blocker: second, waiting: first };
  }
}

if (typeof globalThis !== 'undefined') globalThis.TrafficManager = TrafficManager;
