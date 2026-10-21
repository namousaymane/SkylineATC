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

  static create(id, options = {}) {
    const definition = this.DEFINITIONS[id];
    if (!definition) throw new Error(`Unknown scenario: ${id}`);
    if (options.tower) return this.createTower(id, options, definition);
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
    for (let i = 0; i < definition.arrivals; i++) { const a = session.generator.spawnArrival(); if (a) arrivals.push(a); }
    for (let i = 0; i < definition.departures; i++) { const a = session.generator.spawnDeparture(); if (a) departures.push(a); }
    this.applyEmergency(arrivals[0], definition);
    if (id === 'GO_AROUND' && arrivals[0]) {
      session.assignRunway(arrivals[0], arrivals[0].expectedRunway);
      session.recordEvent('Exercice : approche assignée sans clairance d’atterrissage. Autorisez à temps ou observez la remise des gaz.');
    }
    const mission = new MissionSystem(session, { id, label: definition.label, arrivals: arrivals.length, departures: departures.length, continuous });
    session.mission = mission; session.simulation.addSystem(mission);
    return { id, session, mission, arrivals, departures, created: arrivals.length + departures.length, requested: definition.arrivals + definition.departures };
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
