class GameSession {
  constructor(options = {}) {
    if (!options.runway) throw new Error('A runway is required');
    this.runway = options.runway;
    this.airport = options.airport ?? null;
    this.simulation = new Simulation({ speed: options.speed ?? 1 });
    this.weather = new WeatherSystem(this.simulation, { bounds: options.weatherBounds ?? null });
    this.simulation.addSystem(this.weather);
    this.emergencies = new EmergencySystem(this.simulation);
    this.simulation.addSystem(this.emergencies);
    for (const storm of options.storms ?? []) this.weather.addStorm(storm.x, storm.y, storm);
    this.simulation.setEnvironment({ obstacles: this.weather.storms });
    this.runwayController = new RunwayController([this.runway]);
    this.traffic = new TrafficManager(this.simulation, this.runwayController);
    this.departures = new DepartureController(this.simulation, this.runwayController);
    this.taxi = new TaxiController(this.runwayController);
    this.arrivals = [];
    this.eventLog = [];
    this.simulation.addSystem(this.traffic);
    this.simulation.addSystem(this.departures);
    this.simulation.addSystem(this.taxi);
    this.simulation.addSystem({ afterStep: () => this.assignArrivalParking() });
    for (const parking of options.parkings ?? []) this.departures.registerParking(parking);
  }

  spawnArrival(AirplaneClass, options = {}) {
    const runway = options.runway ?? this.runway;
    const dx = runway.x2 - runway.x1;
    const dy = runway.y2 - runway.y1;
    const length = Math.hypot(dx, dy);
    if (!(length > 0)) throw new Error('Runway must have a nonzero length');
    const unit = { x: dx / length, y: dy / length };
    const approachDistance = options.approachDistance ?? 300;
    const lateral = options.lateralOffset ?? 0;
    const position = { x: runway.x1 - unit.x * approachDistance - unit.y * lateral,
      y: runway.y1 - unit.y * approachDistance + unit.x * lateral };
    const aircraft = new AirplaneClass(position.x, position.y, {
      ...options, state: 'CRUISE', altitude: options.altitude ?? 1800,
      heading: Math.atan2(unit.y, unit.x) * 180 / Math.PI
    });
    aircraft.vel.set(unit.x * aircraft.maxSpeed, unit.y * aircraft.maxSpeed);
    const guidance = new ApproachGuidance(runway, this.runwayController, {
      approachDistance, interceptAltitude: options.interceptAltitude ?? aircraft.altitude,
      touchdownSpeed: options.touchdownSpeed
    });
    if (!guidance.clear(aircraft)) return null;
    aircraft.guidance = guidance;
    aircraft.arrivalParking = options.parkingId ?? this.findFreeParking()?.id ?? null;
    aircraft.arrivalTaxiRoute = options.taxiRoute ?? null;
    this.arrivals.push(this.traffic.add(aircraft));
    return aircraft;
  }

  createDeparture(AirplaneClass, options = {}) {
    const departure = this.departures.createDeparture(AirplaneClass, { ...options, runway: options.runway ?? this.runway });
    if (departure) {
      this.traffic.aircraft.add(departure);
      this.recordEvent(`Départ ${departure.callsign} créé sur ${departure.parkingId}`);
    }
    return departure;
  }

  createDepartureFromFreeParking(AirplaneClass, options = {}) {
    const parking = options.parking ?? this.findFreeParking();
    if (!parking) return null;
    const taxiY = parking.y < this.runway.y1 ? parking.y + 70 : parking.y - 70;
    const route = options.route ?? this.airportDepartureRoute(parking) ?? [
      { x: parking.x, y: parking.y },
      { x: parking.x, y: taxiY },
      { x: this.runway.x1, y: this.runway.y1, type: 'HOLD_SHORT' }
    ];
    return this.createDeparture(AirplaneClass, { ...options, parkingId: parking.id,
      runwayId: this.runway.id, route });
  }

  assignArrivalParking() {
    for (const aircraft of this.arrivals) {
      if (aircraft.state !== 'STOPPED' || aircraft.arrivalTaxiAssigned) continue;
      const parking = this.departures.parkings.get(aircraft.arrivalParking) ?? this.findFreeParking();
      const route = aircraft.arrivalTaxiRoute ?? this.defaultArrivalRoute(aircraft, parking);
      if (!parking || !route) continue;
      parking.occupied = true;
      aircraft.arrivalTaxiAssigned = this.taxi.assignParking(aircraft, route, parking.id);
    }
  }

  defaultArrivalRoute(aircraft, parking) {
    if (!parking) return null;
    if (this.airport?.groundGraph && typeof AirportGeometry !== 'undefined') {
      const route = AirportGeometry.route(this.airport, aircraft.pos, parking);
      if (route) return route;
    }
    const exit = { x: this.runway.x1 + (this.runway.x2 - this.runway.x1) * 0.7, y: this.runway.y1 };
    const taxiY = parking.y < this.runway.y1 ? parking.y + 70 : parking.y - 70;
    return [exit, { x: exit.x, y: taxiY }, { x: parking.x, y: taxiY }, { x: parking.x, y: parking.y }];
  }

  airportDepartureRoute(parking) {
    if (!this.airport?.groundGraph || typeof AirportGeometry === 'undefined') return null;
    const route = AirportGeometry.route(this.airport, parking, { x: this.runway.x1, y: this.runway.y1 });
    if (!route || route.length < 3) return null;
    const start = { x: this.runway.x1, y: this.runway.y1 }; const end = { x: this.runway.x2, y: this.runway.y2 };
    const clearance = this.runway.width / 2 + 6;
    // Stop before entering the paved runway, then continue to its line-up point.
    const entry = route.findIndex((p, i) => i > 0 && AirportGeometry.distanceToSegment(p, start, end) < clearance);
    if (entry > 0) {
      const a = route[entry - 1]; const b = route[entry];
      let low = 0; let high = 1;
      for (let i = 0; i < 20; i++) { const t = (low + high) / 2; const p = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) }; if (AirportGeometry.distanceToSegment(p, start, end) < clearance) high = t; else low = t; }
      const hold = { x: a.x + low * (b.x - a.x), y: a.y + low * (b.y - a.y), type: 'HOLD_SHORT' };
      return [...route.slice(0, entry), hold, ...route.slice(entry)];
    }
    route[route.length - 2].type = 'HOLD_SHORT'; return route;
  }

  findFreeParking() { return [...this.departures.parkings.values()].find(parking => !parking.occupied) ?? null; }
  authorizeTaxi(aircraft) { const result = this.departures.authorizeTaxi(aircraft); if (result) this.recordEvent(`${aircraft.callsign}: repoussage autorisé`); return result; }
  authorizeCrossing(aircraft) { const result = this.departures.authorizeCrossing(aircraft); if (result) this.recordEvent(`${aircraft.callsign}: traversée autorisée`); return result; }
  authorizeLineUp(aircraft) { const result = this.departures.authorizeLineUp(aircraft); if (result) this.recordEvent(`${aircraft.callsign}: line up and wait`); return result; }
  authorizeTakeoff(aircraft) { const result = this.departures.authorizeTakeoff(aircraft); if (result) this.recordEvent(`${aircraft.callsign}: cleared for takeoff`); return result; }
  goAround(aircraft, reason) { return aircraft.guidance?.goAround(aircraft, reason) ?? false; }
  declareEmergency(aircraft, code = '7700', reason = 'CONTROLLER') {
    const result = this.emergencies.declare(aircraft, code, reason);
    if (result) this.recordEvent(`${aircraft.callsign}: squawk ${code}`);
    return result;
  }
  resolveEmergency(aircraft) { const result = this.emergencies.resolve(aircraft); if (result) this.recordEvent(`${aircraft.callsign}: urgence résolue`); return result; }
  recordEvent(message) { this.eventLog.unshift({ message, step: this.simulation.stepCount }); this.eventLog = this.eventLog.slice(0, 12); }
  step(seconds = 1 / 60) { this.simulation.update((this.simulation.lastTime ?? 0) + seconds); }
}

if (typeof globalThis !== 'undefined') globalThis.GameSession = GameSession;
