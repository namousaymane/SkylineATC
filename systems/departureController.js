class DepartureController {
  constructor(simulation, runwayController, options = {}) {
    this.simulation = simulation;
    this.runwayController = runwayController;
    this.departures = [];
    this.parkings = new Map();
    this.pushbackSteps = options.pushbackSteps ?? 20;
    this.waypointRadius = options.waypointRadius ?? 12;
    this.takeoffDistance = options.takeoffDistance ?? 35;
  }

  registerParking(parking) {
    if (parking?.id) this.parkings.set(parking.id, { ...parking, occupied: Boolean(parking.occupied) });
  }

  createDeparture(AirplaneClass, { callsign, parkingId, runwayId, route, runway, ...options } = {}) {
    const parking = this.parkings.get(parkingId);
    if (!parking || parking.occupied || !runway || runway.id !== runwayId ||
      !Array.isArray(route) || route.length < 2 || !route.every(validPoint)) return null;
    const aircraft = new AirplaneClass(parking.x, parking.y, {
      ...options, callsign: callsign ?? `DEP${String(this.departures.length + 1).padStart(3, '0')}`,
      state: 'PARKED', altitude: 0, maxSpeed: options.maxSpeed ?? 1.2, groundSpeed: options.groundSpeed ?? 1.1
    });
    aircraft.parkingId = parkingId;
    aircraft.departureRunway = runway;
    aircraft.departureRoute = route.map(point => ({ ...point }));
    aircraft.departureIndex = 1;
    aircraft.departureController = this;
    parking.occupied = true;
    this.departures.push(aircraft);
    this.simulation.add(aircraft);
    return aircraft;
  }

  authorizeTaxi(aircraft) {
    if (!this.departures.includes(aircraft) || aircraft.state !== 'PARKED') return false;
    aircraft.state = 'PUSHBACK';
    aircraft.pushbackRemaining = this.pushbackSteps;
    aircraft.path = null;
    aircraft.target = null;
    aircraft.vel.mult(0);
    return true;
  }

  authorizeCrossing(aircraft) {
    if (aircraft?.state !== 'WAITING_RUNWAY_CROSSING') return false;
    aircraft.departureIndex += 1;
    aircraft.state = 'TAXIING';
    this.setTaxiPath(aircraft);
    return true;
  }

  authorizeLineUp(aircraft) {
    if (aircraft?.state !== 'HOLD_SHORT') return false;
    if (!this.runwayController.reserve(aircraft.departureRunway.id, aircraft)) return false;
    aircraft.state = 'LINE_UP_WAIT';
    aircraft.departureIndex += 1;
    this.setTaxiPath(aircraft);
    return true;
  }

  authorizeTakeoff(aircraft) {
    if (aircraft?.state !== 'LINE_UP_WAIT' || !this.runwayController.owns(aircraft.departureRunway.id, aircraft)) return false;
    aircraft.state = 'CLEARED_TAKEOFF';
    return true;
  }

  beforeStep() {
    for (const aircraft of this.departures) {
      if (aircraft.state === 'PUSHBACK') {
        aircraft.pushbackRemaining -= 1;
        if (aircraft.pushbackRemaining <= 0) {
          aircraft.state = 'TAXIING';
          aircraft.departureIndex = 1;
          this.setTaxiPath(aircraft);
        }
      }
      if (aircraft.state === 'TAXIING' || aircraft.state === 'LINE_UP_WAIT') this.setTaxiPath(aircraft);
    }
  }

  afterStep() {
    for (const aircraft of this.departures) this.updateAircraft(aircraft);
  }

  setTaxiPath(aircraft) {
    const current = aircraft.departureRoute[Math.max(0, aircraft.departureIndex - 1)];
    const next = aircraft.departureRoute[aircraft.departureIndex];
    aircraft.path = next ? [current, next] : [current];
    aircraft.arrivalTarget = true;
    aircraft.maxSpeed = aircraft.groundSpeed;
  }

  updateAircraft(aircraft) {
    if (aircraft.state === 'PUSHBACK') return;
    const next = aircraft.departureRoute[aircraft.departureIndex];
    if (next && Math.hypot(aircraft.pos.x - next.x, aircraft.pos.y - next.y) <= this.waypointRadius &&
      aircraft.vel.mag() <= aircraft.maxSpeed + 0.2) {
      if (next.type === 'RUNWAY_CROSSING') {
        aircraft.state = 'WAITING_RUNWAY_CROSSING';
        aircraft.path = null;
        aircraft.vel.mult(0);
        return;
      }
      if (next.type === 'HOLD_SHORT') {
        aircraft.state = 'HOLD_SHORT';
        aircraft.path = null;
        aircraft.vel.mult(0);
        return;
      }
      aircraft.departureIndex += 1;
      if (aircraft.state === 'TAXIING' || aircraft.state === 'LINE_UP_WAIT') this.setTaxiPath(aircraft);
    }
    if (aircraft.state === 'CLEARED_TAKEOFF') {
      aircraft.state = 'TAKEOFF_ROLL';
      aircraft.departureIndex = aircraft.departureRoute.length - 1;
      aircraft.path = [aircraft.pos.copy(), { x: aircraft.departureRunway.x2, y: aircraft.departureRunway.y2 }];
      aircraft.arrivalTarget = false;
      aircraft.maxSpeed = Math.max(aircraft.maxSpeed, 2.4);
    }
    if (aircraft.state === 'TAKEOFF_ROLL' &&
      Math.hypot(aircraft.pos.x - aircraft.departureRunway.x2, aircraft.pos.y - aircraft.departureRunway.y2) < this.takeoffDistance) {
      aircraft.state = 'ROTATION';
      aircraft.altitude = 80;
      const dx = aircraft.departureRunway.x2 - aircraft.departureRunway.x1;
      const dy = aircraft.departureRunway.y2 - aircraft.departureRunway.y1;
      const length = Math.hypot(dx, dy);
      aircraft.path = [{ x: aircraft.pos.x, y: aircraft.pos.y },
        { x: aircraft.departureRunway.x2 + 220 * dx / length, y: aircraft.departureRunway.y2 + 220 * dy / length }];
    }
    if (aircraft.state === 'ROTATION') {
      aircraft.state = 'CLIMB_OUT';
      aircraft.assignedAltitude = 1000;
    }
    if (aircraft.state === 'CLIMB_OUT') {
      aircraft.altitude = Math.min(aircraft.assignedAltitude, aircraft.altitude + 25);
      if (aircraft.altitude >= aircraft.assignedAltitude) {
        aircraft.state = 'AIRBORNE';
        aircraft.path = null;
        aircraft.target = null;
        this.runwayController.release(aircraft.departureRunway.id, aircraft);
        const parking = this.parkings.get(aircraft.parkingId);
        if (parking) parking.occupied = false;
      }
    }
  }
}

function validPoint(point) {
  return point && Number.isFinite(point.x) && Number.isFinite(point.y);
}

if (typeof globalThis !== 'undefined') globalThis.DepartureController = DepartureController;
