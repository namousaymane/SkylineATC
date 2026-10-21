class TaxiController {
  constructor(runwayController, options = {}) {
    this.runwayController = runwayController;
    this.arrivalParkingDistance = options.arrivalParkingDistance ?? 8;
    this.stopSpeed = options.stopSpeed ?? 0.25;
    this.parked = new Set();
  }

  assignParking(aircraft, route, parkingId) {
    if (!aircraft || aircraft.state !== 'STOPPED') return false;
    if (!Array.isArray(route) || route.length < 2 || !route.every(validPoint)) return false;
    if (aircraft.guidance?.runway) {
      this.runwayController.release(aircraft.guidance.runway.id, aircraft);
    }
    aircraft.guidance = null;
    aircraft.state = 'TAXIING';
    aircraft.path = route.map(point => ({ x: point.x, y: point.y }));
    aircraft.target = null;
    aircraft.arrivalTarget = true;
    aircraft.parkingId = parkingId ?? null;
    aircraft.maxSpeed = aircraft.groundSpeed ?? Math.min(1.2, aircraft.maxSpeed || 1.2);
    aircraft.taxiRoute = aircraft.path;
    aircraft.taxiIndex = 0;
    return true;
  }

  beforeStep() {
    // Routing is explicit and assigned before the next integration step.
  }

  updateAircraft(aircraft) {
    if (!aircraft || aircraft.state !== 'TAXIING' || !aircraft.path?.length) return false;
    const finalPoint = aircraft.path[aircraft.path.length - 1];
    const distance = Math.hypot(aircraft.pos.x - finalPoint.x, aircraft.pos.y - finalPoint.y);
    if (distance <= this.arrivalParkingDistance && aircraft.vel.mag() <= this.stopSpeed) {
      aircraft.vel.mult(0);
      aircraft.path = null;
      aircraft.taxiRoute = null;
      aircraft.state = 'PARKED';
      aircraft.maxSpeed = 0;
      this.parked.add(aircraft);
      return true;
    }
    return false;
  }

  afterStep(context) {
    for (const aircraft of context.peers.map(peer => peer.source).filter(Boolean)) {
      this.updateAircraft(aircraft);
    }
    for (const aircraft of this.parked) {
      if (aircraft.state !== 'PARKED') this.parked.delete(aircraft);
    }
  }
}

function validPoint(point) {
  return point && Number.isFinite(point.x) && Number.isFinite(point.y);
}

if (typeof globalThis !== 'undefined') globalThis.TaxiController = TaxiController;
