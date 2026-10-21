class ScenarioFactory {
  static DEFINITIONS = Object.freeze({
    CALM: Object.freeze({ arrivals: 1, departures: 1, lateralOffset: 0, label: 'Trafic calme' }),
    RUNWAY_CONFLICT: Object.freeze({ arrivals: 1, departures: 2, lateralOffset: 0, label: 'Conflit de piste' }),
    PEAK_HOUR: Object.freeze({ arrivals: 1, departures: 2, lateralOffset: 18, label: 'Heure de pointe' }),
    GO_AROUND: Object.freeze({ arrivals: 1, departures: 0, lateralOffset: 44, label: 'Approche instable' }),
    ENGINE_FAILURE: Object.freeze({ arrivals: 1, departures: 0, lateralOffset: 0, label: 'Panne moteur', emergency: 'ENGINE_FAILURE' }),
    RADIO_FAILURE: Object.freeze({ arrivals: 1, departures: 0, lateralOffset: 0, label: 'Panne radio', emergency: '7600' }),
    HIJACK: Object.freeze({ arrivals: 1, departures: 0, lateralOffset: 12, label: 'Interception · squawk 7500', emergency: '7500' })
  });
  static EMERGENCY_SCENARIOS = Object.freeze(['ENGINE_FAILURE', 'RADIO_FAILURE', 'HIJACK']);

  static resolveId(id, seed = Date.now()) {
    if (id !== 'RANDOM_EMERGENCY') return id;
    const index = Math.abs(Number(seed) || 0) % this.EMERGENCY_SCENARIOS.length;
    return this.EMERGENCY_SCENARIOS[index];
  }

  static create(id, options = {}) {
    const requestedId = id;
    const scenarioId = this.resolveId(id, options.seed);
    const definition = this.DEFINITIONS[scenarioId];
    if (!definition) throw new Error(`Unknown scenario: ${id}`);
    if (options.tower) return this.createTower(scenarioId, { ...options, requestedScenarioId: requestedId }, definition);
    const runway = options.runway ?? { id: '09', x1: 0, y1: 0, x2: 600, y2: 0, width: 46 };
    const parkings = options.parkings ?? [
      { id: 'P1', x: 100, y: 150 },
      { id: 'P2', x: 300, y: 150 },
      { id: 'P3', x: 500, y: 150 }
    ];
    const session = new GameSession({ runway, parkings, airport: options.airport, speed: options.speed ?? 1 });
    const AirplaneClass = options.AirplaneClass ?? Airliner;
    const DepartureClass = options.DepartureClass ?? RegionalJet;
    const created = { arrivals: [], departures: [] };
    for (let index = 0; index < definition.arrivals; index += 1) {
      const arrival = session.spawnArrival(AirplaneClass, {
        callsign: `ARR${String(index + 1).padStart(3, '0')}`,
        lateralOffset: definition.lateralOffset,
        altitude: options.arrivalAltitude ?? 1800
      });
      if (arrival) created.arrivals.push(arrival);
    }
    this.applyEmergency(created.arrivals[0], definition);
    const route = options.departureRoute ?? [
      { x: 100, y: 150 }, { x: 100, y: 50 }, { x: 0, y: 0, type: 'HOLD_SHORT' }
    ];
    for (let index = 0; index < definition.departures; index += 1) {
      const parking = parkings[index % parkings.length];
      const departure = session.createDeparture(DepartureClass, {
        callsign: `DEP${String(index + 1).padStart(3, '0')}`,
        parkingId: parking.id,
        runwayId: runway.id,
        route: session.airportDepartureRoute(parking) ?? route.map(point => ({ ...point, x: point.x + index * 80 }))
      });
      if (departure) created.departures.push(departure);
    }
    const mission = new MissionSystem(session, { id, label: definition.label,
      arrivals: created.arrivals.length, departures: created.departures.length });
    session.simulation.addSystem(mission);
    return { id, label: definition.label, session, mission, ...created,
      requested: definition.arrivals + definition.departures,
      created: created.arrivals.length + created.departures.length };
  }

  static createTower(id, options, definition) {
    const continuous = ['FREE', 'AIRPORT'].includes(options.gameMode ?? 'FREE');
    const session = new TowerSession({ ...options, randomTraffic: continuous && (options.randomTraffic ?? true), parkings: options.parkings ?? options.airport.parking });
    const arrivals = []; const departures = [];
    for (let i = 0; i < definition.arrivals; i++) {
      // Timed emergencies begin within approach range. A sector-border spawn
      // could spend the entire deadline merely reaching the airport.
      const a = options.gameMode === 'EMERGENCY'
        ? this.spawnEmergencyArrival(session) : session.generator.spawnArrival();
      if (a) arrivals.push(a);
    }
    for (let i = 0; i < definition.departures; i++) { const a = session.generator.spawnDeparture(); if (a) departures.push(a); }
    this.applyEmergency(arrivals[0], definition);
    if (id === 'GO_AROUND' && arrivals[0]) {
      session.assignRunway(arrivals[0], arrivals[0].expectedRunway);
      session.recordEvent('Exercice : approche assignée sans clairance d’atterrissage. Autorisez à temps ou observez la remise des gaz.');
    }
    const freeScore = continuous;
    const requestedLimit = Number(options.timeLimitSeconds ?? 180);
    const timeLimitSeconds = options.gameMode === 'EMERGENCY'
      ? (Number.isFinite(requestedLimit) ? Math.max(30, Math.min(1800, requestedLimit)) : 180) : 0;
    const mission = new MissionSystem(session, {
      id: options.requestedScenarioId ?? id,
      label: options.requestedScenarioId === 'RANDOM_EMERGENCY' ? `Urgence aléatoire · ${definition.label}` : definition.label,
      arrivals: arrivals.length,
      departures: departures.length,
      continuous,
      startingScore: freeScore ? 0 : 1000,
      points: freeScore ? { arrival: 100, departure: 100, collision: 500 } : { arrival: 250, departure: 250, collision: 500 },
      timeLimitSteps: timeLimitSeconds > 0 ? timeLimitSeconds / session.simulation.step : 0
    });
    session.mission = mission; session.simulation.addSystem(mission);
    return { id: options.requestedScenarioId ?? id, scenarioId: id, label: mission.label, session, mission, arrivals, departures, created: arrivals.length + departures.length, requested: definition.arrivals + definition.departures };
  }

  static spawnEmergencyArrival(session) {
    const random = session.generator.random;
    const modelId = session.generator.model();
    const runway = random.pick(session.directions.filter(direction => direction.lengthMeters >= AircraftModels[modelId].minRunway));
    if (!runway) return null;
    const units = (session.airport.metersToPixels ?? .2) * 1852;
    return session.spawnInbound({ modelId, callsign: session.generator.callsign(), runway,
      position: RunwayDirections.point(runway, -units * random.between(6, 8), units * random.between(-.3, .3)),
      inboundTrack: { x: (runway.x2 - runway.x1) / runway.length, y: (runway.y2 - runway.y1) / runway.length },
      altitude: 2000, wanderEnabled: false });
  }

  static applyEmergency(aircraft, definition) {
    if (!aircraft || !definition.emergency) return false;
    if (definition.emergency === 'ENGINE_FAILURE') return aircraft.failEngine('ENGINE_FAILURE');
    if (definition.emergency === '7600') return aircraft.declareEmergency('7600', 'RADIO_FAILURE');
    if (definition.emergency === '7500') return aircraft.declareEmergency('7500', 'HIJACK');
    return false;
  }
}

if (typeof globalThis !== 'undefined') globalThis.ScenarioFactory = ScenarioFactory;
