/** Simulation-time scheduler: no wall-clock timers; pause/xN/replay remain deterministic. */
class RandomTraffic {
  constructor(session, options = {}) {
    this.session = session; this.random = new SeededRandom(options.seed ?? Date.now());
    this.seed = this.random.seed; this.enabled = options.enabled ?? true; this.intensity = options.intensity ?? 'NORMAL';
    this.nextStep = 60 * 20; this.created = 0; this.maxActive = 10;
  }
  model() {
    const available = ['B738', 'B738', 'B738', 'B788', 'B788', 'A388'].filter(id => [...this.session.departures.parkings.values()].some(p => p.maxWingspan >= AircraftModels[id].span));
    return this.random.pick(available.length ? available : ['B738']);
  }
  callsign() {
    const prefixes = ['RAM', 'AFR', 'BAW', 'IBE', 'DAL', 'UAE', 'EZY'];
    let id;
    do { id = `${this.random.pick(prefixes)}${Math.floor(this.random.between(100, 999))}`; } while (this.session.flightHistory.has(id));
    this.session.flightHistory.add(id); return id;
  }
  spawnArrival() {
    const modelId = this.model(); const model = AircraftModels[modelId];
    const directions = this.session.directions.filter(r => r.lengthMeters >= model.minRunway);
    if (!directions.length) return null;
    const runway = this.random.pick(directions);
    const units = (this.session.airport.metersToPixels ?? .2) * 1852;
    const center = this.session.airport.center ?? { x: 550, y: 310 };
    const sectorRadiusNm = typeof MapCamera !== 'undefined' ? MapCamera.SECTOR_RADIUS_NM : 80;
    const radiusNm = this.random.between(Math.max(60, sectorRadiusNm - 9), sectorRadiusNm - 2);
    const entryBearing = this.random.between(0, 360);
    const entryAngle = (entryBearing - 90) * Math.PI / 180;
    const position = { x: center.x + Math.cos(entryAngle) * radiusNm * units,
      y: center.y + Math.sin(entryAngle) * radiusNm * units };
    // Entrants generally head inward, but not directly toward the airport or runway.
    // The seeded angular spread gives each entry a different, repeatable arrival track.
    const course = (entryBearing + 180 + this.random.between(-58, 58)) * Math.PI / 180;
    const inboundTrack = { x: Math.sin(course), y: -Math.cos(course) };
    return this.session.spawnInbound({ modelId, callsign: this.callsign(), runway,
      position, inboundTrack, altitude: Math.round(this.random.between(1600, 2500) / 100) * 100 });
  }
  spawnDeparture() {
    return this.session.createDepartureFromFreeParking(ModelAircraft, { callsign: this.callsign(), modelId: this.model() });
  }
  beforeStep() {
    if (!this.enabled || this.session.simulation.stepCount < this.nextStep) return;
    const active = this.session.simulation.entities.filter(a => a instanceof ModelAircraft && a.state !== 'PARKED').length;
    if (active < this.maxActive) {
      const aircraft = this.random.next() < .65 ? this.spawnArrival() : this.spawnDeparture();
      if (aircraft) { this.created++; this.session.recordEvent(`${aircraft.callsign} ${aircraft.modelId} : nouveau ${aircraft.operation === 'ARRIVAL' ? 'vol entrant' : 'départ'}`); }
    }
    const interval = this.intensity === 'LOW' ? [55, 80] : this.intensity === 'HIGH' ? [18, 30] : [30, 50];
    this.nextStep = this.session.simulation.stepCount + Math.round(this.random.between(...interval) * 60);
  }
}
globalThis.RandomTraffic = RandomTraffic;
