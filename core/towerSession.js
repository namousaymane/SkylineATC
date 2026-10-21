/** Playable tower/ground session. Legacy GameSession remains the small teaching fixture. */
class TowerSession extends GameSession {
  constructor(options) {
    super(options);
    this.directions = RunwayDirections.fromAirport(options.airport);
    this.runway = this.directions.find(r => r.physicalId === options.runway.id) ?? this.directions[0];
    this.landingClearanceRangeNm = 3;
    this.runwayController = new RunwayController(this.directions);
    this.simulation = new Simulation({ speed: options.speed ?? 1 });
    this.departures = { departures: [], parkings: new Map(options.parkings.map(p => {
      // Conservative game capacity from stand spacing where no published size exists.
      const neighbors = options.parkings.map(q => GroundOperations.distance(p, q) / (options.airport.metersToPixels ?? .2)).filter(d => d > 10);
      const inferredSpan = Math.max(36, Math.min(85, Math.min(...neighbors, 100) * .9));
      return [p.id, { ...p, maxWingspan: p.maxWingspan ?? inferredSpan, capacitySource: p.maxWingspan ? 'configured' : 'game-spacing', occupied: false, reservedFor: null }];
    })) };
    this.arrivals = []; this.eventLog = []; this.flightHistory = new Set(); this.lastMessage = 'Sélectionnez un vol pour lui donner une clairance.';
    this.ground = new GroundOperations(this); this.traffic = { aircraft: new Set(), archived: [] };
    this.emergencyDispatches = new Map();
    this.interceptNotices = new Set();
    this.emergencyVehicles = [];
    if (this.airport.rescueStation && typeof EmergencyVehicle !== 'undefined') {
      for (const [kind, offset] of [['FIRE', -5], ['MEDICAL', 5]]) {
        const station = { x: this.airport.rescueStation.x, y: this.airport.rescueStation.y + offset };
        const vehicle = new EmergencyVehicle(station.x, station.y, { kind, callsign: kind === 'FIRE' ? 'FIRE-1' : 'MED-1', station });
        this.emergencyVehicles.push(vehicle); this.simulation.add(vehicle);
      }
    }
    this.airNavigation = new AirNavigation(this);
    this.navPoints = this.airNavigation.fixes;
    for (const r of this.directions) this.navPoints.push(new TowerApproach(r, this.runwayController, { unitsPerNm: (this.airport.metersToPixels ?? .2) * 1852 }).navigationFix());
    this.weather = new WeatherSystem(this.simulation); this.emergencies = new EmergencySystem(this.simulation);
    this.emergencies.exitFixes = this.navPoints.filter(f => f.type === 'EXIT');
    this.emergencies.onDeparture = (civil, fighter, exit) => this.recordEvent(`${fighter.callsign} : ${civil.callsign} en finale, escorte terminée, montée puis sortie ${exit.id ?? ''}.`);
    this.simulation.setEnvironment({ obstacles: this.weather.storms });
    this.generator = new RandomTraffic(this, { seed: options.seed, enabled: options.randomTraffic ?? true, intensity: options.intensity });
    this.simulation.addSystem(this.weather); this.simulation.addSystem(this.emergencies);
    this.simulation.addSystem(this.generator); this.simulation.addSystem({ beforeStep: () => this.beforeOperations(), afterStep: () => this.afterOperations() });
    this.simulation.addSystem(this.airNavigation);
    this.simulation.addSystem(this.ground);
    this.simulation.addSystem({ afterStep: context => this.resolveAirCollisions(context) });
    this.aiAtc = typeof AIAtcController !== 'undefined' ? new AIAtcController(this) : null;
    if (this.aiAtc) this.simulation.addSystem(this.aiAtc);
  }

  result(ok, message) { this.lastMessage = message; if (ok) this.recordEvent(message); return ok; }
  recordEvent(message) { this.lastMessage = message; super.recordEvent(message); }
  resolveAirCollisions(context = {}) {
    const aircraft = this.simulation.entities.filter(entity => entity instanceof Airplane && !entity.destroyed);
    const previous = new Map((context.peers ?? []).map(peer => [peer.source, peer]));
    for (let i = 0; i < aircraft.length; i += 1) for (let j = i + 1; j < aircraft.length; j += 1) {
      const first = aircraft[i]; const second = aircraft[j];
      if (first.destroyed || second.destroyed) continue;
      // A parked/ready aircraft is held by the ground controller rather than
      // being an airborne collision candidate. Two aircraft actually taxiing
      // on the surface still use the collision model (and therefore expose a
      // useful safety failure in scenarios/tests).
      const staticGround = aircraft => aircraft.altitude <= 0 && aircraft.holdPosition && !aircraft.groundRoute;
      if (staticGround(first) || staticGround(second)) continue;
      const beforeA = previous.get(first) ?? first; const beforeB = previous.get(second) ?? second;
      const rx = beforeA.pos.x - beforeB.pos.x; const ry = beforeA.pos.y - beforeB.pos.y;
      const dx = first.pos.x - second.pos.x - rx; const dy = first.pos.y - second.pos.y - ry;
      const radius = Math.max(2, (first.r + second.r) * .8);
      // Intersect horizontal swept circles with the vertical contact interval.
      // CPA alone misses contacts when altitude and horizontal minima differ.
      let low = 0; let high = 1;
      const speedSq = dx * dx + dy * dy; const dot = rx * dx + ry * dy;
      const c = rx * rx + ry * ry - radius * radius;
      if (speedSq < 1e-12) { if (c > 0) continue; }
      else {
        const discriminant = dot * dot - speedSq * c;
        if (discriminant < 0) continue;
        const root = Math.sqrt(discriminant);
        low = Math.max(low, (-dot - root) / speedSq); high = Math.min(high, (-dot + root) / speedSq);
      }
      const z = (beforeA.altitude ?? 0) - (beforeB.altitude ?? 0);
      const dz = first.altitude - second.altitude - z;
      if (Math.abs(dz) < 1e-12) { if (Math.abs(z) > 50) continue; }
      else {
        const t1 = (-50 - z) / dz; const t2 = (50 - z) / dz;
        low = Math.max(low, Math.min(t1, t2)); high = Math.min(high, Math.max(t1, t2));
      }
      if (low > high) continue;
      for (const a of [first, second]) {
        if (a.guidance?.controller) a.guidance.controller.release(a.guidance.runway.id, a);
        if (a.assignedRunway) this.runwayController.release(a.assignedRunway, a);
        a.destroyed = true; a.explosionTimer = 90; a.explosionOrigin = a.pos.copy();
        a.state = 'DESTROYED'; a.path = null; a.target = null; a.guidance = null; a.airNavigation = null;
        a.outsideSectorTarget = null; a.groundRoute = null; a.routeComplete = null;
        a.holdPosition = true; a.tcasAdvisory = null;
        for (const parking of this.departures.parkings.values()) if (parking.reservedFor === a.callsign) { parking.reservedFor = null; parking.occupied = false; }
      }
      this.mission?.registerCollision(first, second);
      this.recordEvent(`COLLISION : ${first.callsign} / ${second.callsign}, appareils détruits.`);
    }
    for (const a of this.simulation.entities.filter(entity => entity.destroyed && entity.explosionTimer <= 0)) {
      this.simulation.remove(a); this.traffic.aircraft.delete(a);
    }
  }
  direction(id) { return this.directions.find(r => r.id === id) ?? null; }
  addAircraft(a) { this.simulation.add(a); this.traffic.aircraft.add(a); this.flightHistory.add(a.callsign); return a; }
  owns(a) { return Boolean(a && !a.destroyed && this.simulation.entities.includes(a)); }
  createStormAhead(a) {
    if (!this.owns(a) || a.altitude <= 0 || this.weather.storms.length >= 5) return this.result(false, 'Sélectionnez un avion en vol ; maximum 5 cellules météo.');
    const u = a.vel.mag() > .01 ? a.vel.copy().setMag(1) : createVector(1, 0);
    // Rayon réaliste d'une cellule Cb (Cumulonimbus) : ~3 à 5 NM (environ 140-160 unités)
    const nmScale = (this.airport.metersToPixels ?? .2) * 1852;
    const cellRadius = Math.round(Math.max(120, nmScale * 3.5));
    this.weather.addStorm(a.pos.x + u.x * Math.max(220, cellRadius * 1.5), a.pos.y + u.y * Math.max(220, cellRadius * 1.5), { radius: cellRadius, intensity: .95 });
    return this.result(true, 'Cellule météo orageuse ajoutée (échelle réelle ~3-4 NM) : brume, éclairs et turbulences actifs.');
  }

  spawnHelicopter(options = {}) {
    const pad = this.airport.helicopterPad;
    if (!pad || typeof Helicopter === 'undefined') return null;
    if (this.simulation.entities.some(entity => entity.operation === 'HELICOPTER' && entity.state !== 'PARKED')) return null;
    const helicopter = new Helicopter(pad.x, pad.y, { ...options, heliPad: pad, callsign: options.callsign ?? this.generator.callsign() });
    this.addAircraft(helicopter);
    this.recordEvent(`${helicopter.callsign} H145 : stationné sur l’aire hélicoptère H1.`);
    return helicopter;
  }

  launchHelicopter(aircraft) {
    if (!this.owns(aircraft) || !aircraft.takeOff?.()) return this.result(false, 'Hélicoptère indisponible ou déjà en vol.');
    return this.result(true, `${aircraft.callsign} : décollage vertical autorisé depuis H1.`);
  }

  returnHelicopter(aircraft) {
    if (!this.owns(aircraft) || !aircraft.returnToPad?.()) return this.result(false, 'L’hélicoptère ne peut pas rejoindre sa station maintenant.');
    return this.result(true, `${aircraft.callsign} : retour vers l’aire H1.`);
  }

  scramble(aircraft) {
    if (!this.owns(aircraft) || !aircraft.emergency || this.emergencies.assignments.has(aircraft)) return this.result(false, 'Aucune interception disponible pour ce vol.');
    let fighter = this.simulation.entities.find(entity => entity instanceof FighterJet && !entity.interceptTarget);
    if (!fighter) {
      if (typeof FighterJet === 'undefined') return this.result(false, 'Chasseur indisponible.');
      const center = this.airport.center ?? { x: 550, y: 310 };
      const dx = aircraft.pos.x - center.x; const dy = aircraft.pos.y - center.y; const distance = Math.hypot(dx, dy) || 1;
      const sectorRadius = typeof MapCamera !== 'undefined' ? MapCamera.SECTOR_RADIUS_NM : 80;
      const radius = (this.airport.metersToPixels ?? .2) * 1852 * (sectorRadius - 12);
      const x = center.x + dx / distance * radius; const y = center.y + dy / distance * radius;
      fighter = new FighterJet(x, y, { callsign: 'MIL01', altitude: aircraft.altitude, heading: AirNavigation.heading({ x, y }, aircraft.pos), state: 'AIRBORNE' });
      fighter.vel.set((aircraft.pos.x - x) / radius * 1.4, (aircraft.pos.y - y) / radius * 1.4);
      this.simulation.add(fighter);
    }
    if (!this.emergencies.intercept(aircraft, fighter)) return this.result(false, 'Interception impossible ; chasseur déjà engagé.');
    this.interceptNotices.add(aircraft.callsign);
    return this.result(true, `${fighter.callsign} : interception autorisée par le contrôleur, arrivée depuis la limite du secteur.`);
  }

  emergencyRoute(from, to) {
    return AirportGeometry.route(this.airport, from, to) ?? [{ x: from.x, y: from.y }, { x: to.x, y: to.y }];
  }

  dispatchRescue(aircraft) {
    const key = aircraft.callsign;
    if (this.emergencyDispatches.has(key) || !aircraft.emergency || aircraft.emergency.code !== '7700') return;
    if (!['ENGINE_FAILURE', 'FIRE', 'MEDICAL'].includes(aircraft.emergency.reason)) return;
    if (!['FINAL', 'TOUCHDOWN', 'ROLL_OUT'].includes(aircraft.state)) return;
    const runway = this.direction(aircraft.assignedRunway ?? aircraft.expectedRunway);
    if (!runway) return;
    const scene = RunwayDirections.point(runway, runway.length * .35);
    const dispatched = [];
    for (const vehicle of this.emergencyVehicles) {
      const start = { x: vehicle.pos.x, y: vehicle.pos.y };
      const route = this.emergencyRoute(start, scene);
      if (vehicle.dispatch(route, { callsign: key, x: scene.x, y: scene.y })) dispatched.push(vehicle.callsign);
    }
    if (dispatched.length) {
      this.emergencyDispatches.set(key, { aircraft, scene });
      this.recordEvent(`Secours aéroportuaires engagés pour ${key} : ${dispatched.join(' / ')}.`);
    }
  }

  findFreeParking(model = AircraftModels.B738) {
    return [...this.departures.parkings.values()].find(p => {
      if (p.occupied || p.reservedFor) return false;
      if (p.maxWingspan && p.maxWingspan < model.span) return false;
      return !this.simulation.entities.some(a => a instanceof ModelAircraft && a.operation !== 'HELICOPTER' && a.altitude === 0 && GroundOperations.distance(a.pos, p) < Math.max(25, (a.model.length + model.length) * .4));
    }) ?? null;
  }

  spawnInbound(options = {}) {
    const r = options.runway ?? this.runway;
    const position = options.position && Number.isFinite(options.position.x) && Number.isFinite(options.position.y) ? options.position : RunwayDirections.point(r, -(options.distance ?? 200), options.lateral ?? 60);
    // Explicit initialization is the only place where a new aircraft position is set.
    const a = new ModelAircraft(position.x, position.y, { ...options, operation: 'ARRIVAL', state: 'INBOUND', altitude: options.altitude ?? 2000 });
    a.expectedRunway = r.id; a.assignedRunway = null;
    const center = this.airport.center ?? { x: 550, y: 310 };
    const dx = position.x - center.x; const dy = position.y - center.y; const distance = Math.hypot(dx, dy);
    const requestedTrack = options.inboundTrack;
    const requestedLength = requestedTrack && Math.hypot(requestedTrack.x, requestedTrack.y);
    a.inboundTrack = requestedLength > 1e-6
      ? { x: requestedTrack.x / requestedLength, y: requestedTrack.y / requestedLength }
      : distance > 0 ? { x: -dx / distance, y: -dy / distance } : { x: (r.x2 - r.x1) / r.length, y: (r.y2 - r.y1) / r.length };
    a.wanderEnabled = options.wanderEnabled ?? true;
    a.wanderStrength = options.wanderStrength ?? .12;
    // Reuse the session seed so generated traffic and its subtle drift replay consistently.
    a.wanderRandom = () => this.generator.random.between(-.035, .035);
    const unitsPerNm = (this.airport.metersToPixels ?? .2) * 1852;
    const entryRadius = ((typeof MapCamera !== 'undefined' ? MapCamera.SECTOR_RADIUS_NM : 80) - 10) * unitsPerNm;
    if (distance > entryRadius) {
      a.outsideSectorTarget = { x: center.x + dx / distance * entryRadius, y: center.y + dy / distance * entryRadius };
    }
    a.pathLookAhead = 15; a.pathPredictionFrames = 6; a.arrivalTarget = false;
    this.arrivals.push(a); this.addAircraft(a);
    if (this.mission) this.mission.targets.arrivals++;
    return a;
  }

  assignParking(a, id) {
    const parking = this.departures.parkings.get(id);
    if (!this.owns(a) || a.operation !== 'ARRIVAL' || !['INBOUND', 'HOLDING', 'VECTORING', 'APPROACH', 'FINAL', 'WAITING_TAXI'].includes(a.state)) return this.result(false, 'Le stand se choisit avant le taxi vers le terminal.');
    if (!parking || parking.occupied || (parking.reservedFor && parking.reservedFor !== a.callsign) || parking.maxWingspan < a.model.span) return this.result(false, 'Stand occupé ou trop petit pour ce modèle.');
    if (a.state === 'WAITING_TAXI') {
      const route = AirportGeometry.route(this.airport, a.pos, parking);
      if (!route) return this.result(false, 'Stand non connecté à la position actuelle.');
      a.taxiInRoute = this.ground.checkpoints(route);
    }
    const old = this.departures.parkings.get(a.parkingId);
    if (old?.reservedFor === a.callsign && !old.occupied) old.reservedFor = null;
    parking.reservedFor = a.callsign; a.parkingId = id;
    return this.result(true, `${a.callsign} : stand ${id} réservé.`);
  }

  spawnArrival(_Class, options = {}) { return this.spawnInbound(options); }

  assignRunway(a, id) {
    const r = this.direction(id);
    if (!this.owns(a) || !r) return this.result(false, 'Choisissez un avion et une direction de piste.');
    if (r.lengthMeters < a.model.minRunway) return this.result(false, `Piste ${id} trop courte pour ${a.modelId}.`);
    if (a.operation === 'DEPARTURE') {
      if (!['PARKED', 'READY_TAXI', 'HOLD_SHORT'].includes(a.state)) return this.result(false, 'Le changement de piste attend un arrêt au parking ou au point d’attente.');
      const route = this.ground.departureRoute(a.pos, r);
      if (!route) return this.result(false, `Aucun itinéraire sol connecté vers ${id}.`);
      if (a.state === 'HOLD_SHORT' && a.vel.mag() > .08) return this.result(false, 'Arrêtez complètement l’avion avant de changer la piste au point d’attente.');
      a.assignedRunway = r.id; a.departureRunway = r; a.departureRoute = route;
      if (a.state === 'HOLD_SHORT') { a.pendingCheckpoint = null; a.state = 'TAXIING'; this.startDepartureTaxi(a); }
    } else {
      if (!['INBOUND', 'HOLDING', 'VECTORING', 'GO_AROUND', 'NAV_HEADING', 'NAV_DIRECT', 'NAV_HOLD_ENTRY', 'NAV_HOLD', 'AIRBORNE'].includes(a.state)) return this.result(false, 'Approche déjà engagée : ordonnez une remise des gaz avant de changer de piste.');
      a.guidance?.controller.release(a.guidance.runway.id, a);
      const guidance = new TowerApproach(r, this.runwayController, { unitsPerNm: (this.airport.metersToPixels ?? .2) * 1852 });
      if (!guidance.clear(a)) return false;
      a.airNavigation = null;
      a.assignedRunway = id; a.holdPosition = false;
    }
    return this.result(true, `${a.callsign} : piste ${id} assignée.`);
  }

  createDepartureFromFreeParking(_Class = ModelAircraft, options = {}) {
    const model = AircraftModels[options.modelId ?? 'B738'];
    const parking = options.parking ?? this.findFreeParking(model);
    if (!parking || parking.occupied || parking.reservedFor) { this.result(false, `Aucun stand libre compatible avec ${model.id}.`); return null; }
    const a = new ModelAircraft(parking.x, parking.y, { ...options, modelId: model.id, operation: 'DEPARTURE', state: 'PARKED', altitude: 0 });
    a.parkingId = parking.id; a.departureController = this; a.holdPosition = true;
    a.parkingHeading = parking.points?.length > 1 ? Math.atan2(parking.points.at(-1).y - parking.points[0].y, parking.points.at(-1).x - parking.points[0].x) * 180 / Math.PI : -90;
    a.heading = a.parkingHeading;
    parking.occupied = true; parking.reservedFor = a.callsign;
    this.departures.departures.push(a); this.addAircraft(a);
    if (this.mission) this.mission.targets.departures++;
    // Initial expectation is editable; no taxi or runway clearance is implied.
    const candidate = this.directions.find(r => r.lengthMeters >= model.minRunway && this.ground.departureRoute(parking, r));
    if (candidate) { a.assignedRunway = candidate.id; a.departureRunway = candidate; a.departureRoute = this.ground.departureRoute(parking, candidate); }
    this.recordEvent(`${a.callsign} ${model.id} au stand ${parking.id} — repoussage demandé.`);
    return a;
  }

  authorizePushback(a) {
    if (!this.owns(a) || a.operation !== 'DEPARTURE' || a.state !== 'PARKED' || !a.assignedRunway) return this.result(false, 'Le départ doit être au parking avec une piste assignée.');
    const parking = this.departures.parkings.get(a.parkingId);
    let target = parking.points?.[0];
    if (!target || GroundOperations.distance(a.pos, target) < 2) target = a.departureRoute?.[1];
    if (!target) return this.result(false, 'Point de repoussage introuvable.');
    // The parking line is stored from the taxiway end to the stand end. The
    // aircraft starts at the stand end, so this is the real release point.
    // Keep the complete segment: truncating it released the aircraft inside
    // the stand and made the next taxi clearance look like a teleport.
    if (GroundOperations.distance(a.pos, target) < .001) return this.result(false, 'Le point de repoussage est confondu avec le stand.');
    a.headingLocked = true; a.state = 'PUSHBACK';
    this.ground.start(a, [{ x: a.pos.x, y: a.pos.y }, target], 'PUSHBACK', () => {
      // Do not move or rotate the aircraft here. Its final position is the
      // result of Vehicle integration; the next taxi clearance recomputes a
      // route from that exact point and turns the nose progressively.
      a.headingLocked = false; a.state = 'READY_TAXI'; parking.occupied = false; parking.reservedFor = null;
      this.recordEvent(`${a.callsign} : repoussage terminé, prêt au taxi vers ${a.assignedRunway}.`);
    });
    return this.result(true, `${a.callsign} : repoussage approuvé, rappelez prêt au taxi.`);
  }

  startDepartureTaxi(a) {
    const route = this.ground.departureRoute(a.pos, a.departureRunway);
    if (!route) return this.result(false, 'Aucune route de taxi disponible.');
    a.departureRoute = route; a.state = 'TAXIING'; a.headingLocked = false;
    this.ground.start(a, route, 'TAXI', () => this.finishLineUp(a));
    return true;
  }

  authorizeTaxi(a) {
    if (!this.owns(a)) return this.result(false, 'Sélectionnez un avion au sol.');
    if (a.operation === 'ARRIVAL') return this.taxiToParking(a);
    if (a.state !== 'READY_TAXI') return this.result(false, 'Attendez la fin du repoussage et le statut READY_TAXI.');
    if (!a.assignedRunway) return this.result(false, 'Assignez une piste de départ.');
    if (!this.startDepartureTaxi(a)) return false;
    return this.result(true, `${a.callsign} : roulez vers ${a.assignedRunway}, maintenez avant piste.`);
  }

  authorizeCrossing(a) {
    if (!this.owns(a) || a.state !== 'WAITING_RUNWAY_CROSSING' || !a.pendingCheckpoint) return this.result(false, 'Aucune traversée en attente.');
    const id = a.pendingCheckpoint.runwayId;
    if (!this.runwayController.reserve(id, a)) return this.result(false, `Traversée refusée : piste ${id} occupée.`);
    a.crossingRunway = id; a.crossingEntered = false;
    this.ground.resumeCheckpoint(a); a.state = a.groundPhase === 'TAXI_IN' ? 'TAXI_IN' : 'TAXIING';
    return this.result(true, `${a.callsign} : traversez ${id}.`);
  }

  authorizeLineUp(a) {
    if (!this.owns(a) || a.state !== 'HOLD_SHORT' || a.vel.mag() > .08) return this.result(false, 'L’avion doit être arrêté au point d’attente.');
    const id = a.assignedRunway;
    if (!this.runwayController.reserve(id, a)) return this.result(false, `Alignement refusé : piste ${id} occupée (${this.runwayController.blockedBy(id, a)}).`);
    // Do not resume the parking-to-threshold route here: its final graph node is
    // the runway threshold, which causes an unrealistic overshoot and U-turn.
    // Build the line-up route directly from the aircraft's current hold-short
    // position onto the usable runway segment.
    a.pendingCheckpoint = null; a.holdPosition = false;
    this.finishLineUp(a);
    return this.result(true, `${a.callsign} : alignez-vous piste ${id} et attendez.`);
  }

  finishLineUp(a) {
    const r = a.departureRunway; const p = GroundOperations.projection(a.pos, r);
    const along = Math.max(0, Math.min(r.length - 30, p.t * r.length));
    // Join the usable runway ahead of the threshold in one continuous turn.
    // Targeting the threshold itself makes the aircraft overshoot it and reverse
    // before reaching the runway axis, which is not a realistic line-up.
    // Keep the line-up point close to the holding line: just beyond the runway
    // edge, with only a short roll forward to settle on the centreline.
    const runwayEntry = Math.min(r.length - 20, along + Math.max(12, r.width * .35));
    const forwardPosition = Math.min(r.length - 10, runwayEntry + Math.max(22, r.width * 1.25));
    const entry = RunwayDirections.point(r, runwayEntry);
    const forwardTarget = RunwayDirections.point(r, forwardPosition);
    a.state = 'LINING_UP';
    this.ground.start(a, [{ x: a.pos.x, y: a.pos.y }, entry, forwardTarget], 'LINE_UP', () => {
      const lateral = GroundOperations.projection(a.pos, r).point;
      const heading = Math.atan2(r.y2 - r.y1, r.x2 - r.x1) * 180 / Math.PI;
      const difference = Math.abs(((a.heading - heading + 540) % 360) - 180);
      if (GroundOperations.distance(a.pos, lateral) < 1.5 && difference < 12 && a.vel.mag() < .09) {
        a.state = 'LINE_UP_WAIT'; this.recordEvent(`${a.callsign} : aligné ${r.id}, prêt au départ.`);
      } else { a.state = 'HOLD_POSITION'; this.result(false, `${a.callsign} : alignement incomplet.`); }
    });
  }

  authorizeTakeoff(a) {
    if (!this.owns(a) || a.state !== 'LINE_UP_WAIT' || a.vel.mag() > .09 || !this.runwayController.owns(a.assignedRunway, a)) return this.result(false, 'Décollage refusé : avion non aligné et arrêté, ou piste non réservée.');
    if (!a.departureExitFix || a.departureExitFix.type !== 'EXIT') return this.result(false, 'Avant le décollage, assignez un point de sortie du secteur (EXIT-…).');
    const r = a.departureRunway; const lateral = GroundOperations.projection(a.pos, r);
    const desiredHeading = Math.atan2(r.y2 - r.y1, r.x2 - r.x1) * 180 / Math.PI;
    if (GroundOperations.distance(a.pos, lateral.point) > 1.5 || Math.abs(((a.heading - desiredHeading + 540) % 360) - 180) > 12) return this.result(false, 'Décollage refusé : vérifiez l’axe de piste.');
    a.state = 'TAKEOFF_ROLL'; a.holdPosition = false; a.maxSpeed = a.model.rotation + .4;
    a.path = [{ x: a.pos.x, y: a.pos.y }, RunwayDirections.point(r, r.length + 120)]; a.pathArriveAtEnd = false; a.target = null;
    a.takeoffStart = GroundOperations.projection(a.pos, r).t * r.length;
    return this.result(true, `${a.callsign} : piste ${r.id}, autorisé au décollage.`);
  }

  assignDepartureExit(a, fixId) {
    const fix = this.navPoints.find(point => point.id === fixId && point.type === 'EXIT');
    if (!this.owns(a) || a.operation !== 'DEPARTURE' || a.altitude > 0 || !['PARKED', 'READY_TAXI', 'TAXIING', 'HOLD_SHORT', 'LINING_UP', 'LINE_UP_WAIT'].includes(a.state))
      return this.result(false, 'Le point de sortie se choisit pour un départ avant le décollage.');
    if (!fix) return this.result(false, 'Choisissez un point EXIT situé sur la limite du secteur.');
    a.departureExitFix = fix;
    return this.result(true, `${a.callsign} : départ prévu via ${fix.id}, transfert au-delà du secteur.`);
  }

  authorizeLanding(a) {
    if (!this.owns(a) || !a.assignedRunway || !this.canAuthorizeLanding(a)) return this.result(false, 'Clairance refusée : attendez que l’avion soit établi en approche finale, à moins de 3 NM du seuil.');
    if (!this.runwayController.reserve(a.assignedRunway, a)) return this.result(false, `Atterrissage refusé : piste ${a.assignedRunway} occupée.`);
    a.landingCleared = true;
    return this.result(true, `${a.callsign} : piste ${a.assignedRunway}, autorisé à atterrir.`);
  }

  canAuthorizeLanding(a) {
    if (!this.owns(a) || !['APPROACH', 'FINAL'].includes(a.state) || !a.guidance?.geometry) return false;
    const along = a.guidance.geometry(a.pos).along;
    const limit = a.guidance.unitsPerNm * this.landingClearanceRangeNm;
    return along <= -55 && along >= -limit;
  }

  cancelTakeoff(a) {
    if (!this.owns(a) || a.state !== 'TAKEOFF_ROLL' || !this.runwayController.owns(a.assignedRunway, a)) return this.result(false, 'Aucun décollage en cours à interrompre.');
    a.state = 'ABORTING_TAKEOFF'; a.holdPosition = true; a.maxForce = a.model.brake;
    a.path = null; a.target = null; a.groundRoute = null;
    return this.result(true, `${a.callsign} : décollage interrompu, freinage engagé. Maintenez la piste jusqu’à l’arrêt puis dégagez.`);
  }

  expediteRunwayExit(a) {
    if (!this.owns(a) || !['ROLL_OUT', 'TAKEOFF_ABORTED'].includes(a.state) || !this.ground.onRunway(a, a.assignedRunway, 6)) return this.result(false, 'Aucun avion arrêté sur piste à faire dégager.');
    if (a.vel.mag() > Math.max(.95, a.model.taxi * 2.2)) return this.result(false, 'Dégagement prioritaire refusé : réduisez d’abord la vitesse sur la piste.');
    if (!this.beginVacating(a, { expedited: true })) return this.result(false, 'Aucune sortie de piste reliée à un parking libre.');
    return this.result(true, `${a.callsign} : dégagez la piste par la sortie taxiway disponible la plus proche.`);
  }

  returnToStandAfterAbort(a) {
    if (!this.owns(a) || a.state !== 'TAKEOFF_ABORTED' || a.vel.mag() > .08 || !this.ground.onRunway(a, a.assignedRunway, 6)) return this.result(false, 'Le retour au parking exige un avion arrêté après rejet, encore sur la piste.');
    if (!this.beginVacating(a, { expedited: true, onVacated: () => {
      a.postAbortReturn = true;
      this.taxiToParking(a);
    } })) return this.result(false, 'Aucune sortie de piste reliée à un parking libre.');
    return this.result(true, `${a.callsign} : dégagez la piste, puis poursuivez vers le parking ${a.parkingId}.`);
  }

  retryTakeoffAfterAbort(a, runwayId) {
    const runway = this.direction(runwayId);
    if (!this.owns(a) || a.state !== 'TAKEOFF_ABORTED' || a.vel.mag() > .08 || !this.ground.onRunway(a, a.assignedRunway, 6)) return this.result(false, 'La nouvelle tentative exige un avion arrêté après rejet, encore sur la piste.');
    if (!runway || runway.lengthMeters < a.model.minRunway) return this.result(false, `Piste ${runwayId} indisponible ou trop courte pour ${a.modelId}.`);
    if (this.runwayController.blockedBy(runway.id, a)) return this.result(false, `Nouvelle tentative refusée : piste ${runway.id} occupée.`);
    if (!this.ground.departureRoute(a.pos, runway)) return this.result(false, `Aucun itinéraire sol vers ${runway.id}.`);
    const oldRunway = a.assignedRunway;
    if (!this.beginVacating(a, { expedited: true, onVacated: () => {
      const temporaryParking = this.departures.parkings.get(a.parkingId);
      if (temporaryParking?.reservedFor === a.callsign && !temporaryParking.occupied) temporaryParking.reservedFor = null;
      a.parkingId = null; a.assignedRunway = runway.id; a.departureRunway = runway;
      const started = this.startDepartureTaxi(a);
      if (started) this.recordEvent(`${a.callsign} : piste ${oldRunway} dégagée, roulez vers ${runway.id} pour une nouvelle tentative.`);
      else this.result(false, `Piste ${oldRunway} dégagée, mais route vers ${runway.id} indisponible.`);
    } })) return this.result(false, 'Aucune sortie de piste reliée à un parking libre.');
    return this.result(true, `${a.callsign} : dégagez la piste ${oldRunway}, puis roulez vers ${runway.id}.`);
  }

  goAround(a, reason = 'CONTROLLER') {
    const ok = Boolean(a?.guidance?.goAround(a, reason));
    return this.result(ok, ok ? `${a.callsign} : remise des gaz.` : 'Aucune approche active.');
  }

  beginVacating(a, { expedited = false, onVacated = null } = {}) {
    const assigned = this.departures.parkings.get(a.parkingId);
    const candidates = expedited
      ? [...this.departures.parkings.values()].filter(p => !p.occupied && (!p.reservedFor || p.reservedFor === a.callsign) && p.maxWingspan >= a.model.span && !this.simulation.entities.some(b => b !== a && b instanceof ModelAircraft && b.altitude === 0 && GroundOperations.distance(b.pos, p) < Math.max(25, (b.model.length + a.model.length) * .4))).sort((p, q) => GroundOperations.distance(a.pos, p) - GroundOperations.distance(a.pos, q))
      : [assigned?.reservedFor === a.callsign ? assigned : this.findFreeParking(a.model)].filter(Boolean);
    let parking = null; let route = null; let annotated = null; let exitIndex = -1;
    for (const candidate of candidates) {
      const candidateRoute = AirportGeometry.route(this.airport, a.pos, candidate);
      if (!candidateRoute) continue;
      const checkpoints = this.ground.checkpoints(candidateRoute);
      const index = checkpoints.findIndex((p, i) => i > 0 && !this.ground.onRunway({ pos: p, r: a.r }, a.assignedRunway, 4));
      if (index < 1) continue;
      parking = candidate; route = candidateRoute; annotated = checkpoints; exitIndex = index; break;
    }
    if (!parking) { a.state = 'STOPPED'; a.holdPosition = true; return false; }
    if (assigned?.reservedFor === a.callsign && assigned.id !== parking.id && !assigned.occupied) assigned.reservedFor = null;
    parking.reservedFor = a.callsign; a.parkingId = parking.id;
    a.taxiInRoute = annotated.slice(exitIndex);
    a.guidance = null; a.state = 'VACATING';
    this.ground.start(a, annotated.slice(0, exitIndex + 1), 'VACATING', () => {
      if (!this.ground.onRunway(a, a.assignedRunway, 3)) {
        this.runwayController.release(a.assignedRunway, a); a.state = 'WAITING_TAXI';
        this.recordEvent(`${a.callsign} : piste ${a.assignedRunway} dégagée, demande taxi vers ${a.parkingId}.`);
        onVacated?.();
      } else { a.state = 'STOPPED'; }
    });
    return true;
  }

  taxiToParking(a) {
    if (a.state !== 'WAITING_TAXI' || !a.taxiInRoute) return this.result(false, 'Attendez que l’avion ait dégagé la piste.');
    a.state = 'TAXI_IN';
    this.ground.start(a, [{ x: a.pos.x, y: a.pos.y }, ...a.taxiInRoute.slice(1)], 'TAXI_IN', () => {
      a.state = 'PARKED'; a.maxSpeed = 0; a.arrivalTaxiAssigned = true;
      const parking = this.departures.parkings.get(a.parkingId); parking.occupied = true; parking.reservedFor = a.callsign;
      this.recordEvent(`${a.callsign} : arrivé au stand ${a.parkingId}.`);
    });
    return this.result(true, `${a.callsign} : roulez vers le stand ${a.parkingId}.`);
  }

  beforeOperations() {
    const aircraft = this.simulation.entities.filter(a => a instanceof ModelAircraft && !a.destroyed);
    for (const a of aircraft) {
      a.trafficHold = false;
      a.taxiLeader = null;
      if (a.operation === 'HELICOPTER') continue;
      if (a.outsideSectorTarget) {
        const target = a.outsideSectorTarget;
        if (GroundOperations.distance(a.pos, target) <= Math.max(12, a.model.length * .35)) {
          a.outsideSectorTarget = null;
          if (a.guidance && a.assignedRunway) a.guidance.clear(a);
        } else {
          a.state = 'INBOUND'; a.path = null; a.target = target; a.arrivalTarget = false; a.maxSpeed = a.model.cruise;
          continue;
        }
      }
      if (a.state === 'CLIMB_OUT') {
        a.path = null; a.target = RunwayDirections.point(a.departureRunway, a.departureRunway.length + 2000); a.arrivalTarget = false;
      }
      if (a.state === 'AIRBORNE' && a.departureExitFix) {
        const center = this.airport.center ?? { x: 550, y: 310 }; const dx = a.departureExitFix.x - center.x; const dy = a.departureExitFix.y - center.y;
        const length = Math.hypot(dx, dy) || 1;
        if (!a.departureExitReached && GroundOperations.distance(a.pos, a.departureExitFix) < Math.max(30, a.model.cruise * 10)) {
          a.departureExitReached = true; this.recordEvent(`${a.callsign} : point ${a.departureExitFix.id} passé, sortie du secteur.`);
        }
        a.path = null;
        const sectorRadiusNm = typeof MapCamera !== 'undefined' ? MapCamera.SECTOR_RADIUS_NM : 80;
        a.target = a.departureExitReached
          ? { x: center.x + dx / length * (sectorRadiusNm + 12) * (this.airport.metersToPixels ?? .2) * 1852,
              y: center.y + dy / length * (sectorRadiusNm + 12) * (this.airport.metersToPixels ?? .2) * 1852 }
          : a.departureExitFix;
        a.arrivalTarget = false;
      } else if (a.state === 'INBOUND') {
        a.maxSpeed = a.model.cruise; a.path = null;
        a.target = { x: a.pos.x + a.inboundTrack.x * 500, y: a.pos.y + a.inboundTrack.y * 500 };
        a.arrivalTarget = false;
      } else if (a.state === 'HOLDING') {
        a.holdingAngle = (a.holdingAngle ?? 0) + .006;
        const t = a.holdingAngle; a.target = { x: a.holdingCenter.x + Math.cos(t) * 80, y: a.holdingCenter.y + Math.sin(t) * 50 };
        a.path = null; a.arrivalTarget = false; a.maxSpeed = a.model.cruise;
      }
      if (a.state === 'GO_AROUND' && ++a.goAroundAge > 500) {
        a.guidance = null; a.assignedRunway = null; a.state = 'INBOUND';
        const r = a.expectedRunway && this.direction(a.expectedRunway);
        if (r) a.inboundTrack = { x: (r.x2 - r.x1) / r.length, y: (r.y2 - r.y1) / r.length };
        a.path = null; a.target = { x: a.pos.x + a.inboundTrack.x * 500, y: a.pos.y + a.inboundTrack.y * 500 };
        a.arrivalTarget = false; a.maxSpeed = a.model.cruise;
        this.recordEvent(`${a.callsign} : remise des gaz terminée, poursuivez la montée et demandez de nouvelles instructions.`);
      }
      if (a.state === 'GO_AROUND' && !a.goAroundAnnounced) {
        a.goAroundAnnounced = true;
        this.recordEvent(`${a.callsign} : remise des gaz (${a.goAroundReason ?? 'contrôleur'}), montée dans l’axe de piste.`);
      }
      if (a.state === 'TOUCHDOWN') {
        a.state = 'ROLL_OUT'; a.rolloutRunway = a.guidance.runway;
        a.guidance = null; a.rolloutTarget = RunwayDirections.point(a.rolloutRunway, a.rolloutRunway.length * .68);
        a.target = a.rolloutTarget; a.path = null; a.arrivalTarget = true; a.rayonZoneDeFreinage = 40;
        a.maxSpeed = .9; a.maxForce = a.model.brake;
      }
    }
    // Ground conflicts are resolved by braking, never a lateral escape from pavement.
    const moving = aircraft.filter(a => a.altitude === 0 && a.groundRoute && !a.holdPosition && ['TAXIING', 'TAXI_IN'].includes(a.state));
    const checkpointStates = ['TAXIING', 'TAXI_IN', 'WAITING_RUNWAY_CROSSING', 'HOLD_SHORT'];
    const upcomingCheckpoint = a => {
      const route = a.groundRoute;
      if (!route) return null;
      for (let i = Math.max(1, a.routeIndex ?? 1); i < route.length; i++) {
        if (['HOLD_SHORT', 'RUNWAY_CROSSING'].includes(route[i].type)) return { point: route[i], index: i };
      }
      return null;
    };
    const remainingTo = (a, index) => {
      let distance = 0; let previous = a.pos;
      for (let i = Math.max(1, a.routeIndex ?? 1); i <= index; i++) {
        distance += GroundOperations.distance(previous, a.groundRoute[i]); previous = a.groundRoute[i];
      }
      return distance;
    };
    // Aircraft with the same next runway checkpoint form one queue even when its leader is stopped.
    for (const a of moving) {
      const checkpoint = upcomingCheckpoint(a); if (!checkpoint) continue;
      const ownRemaining = remainingTo(a, checkpoint.index);
      let nearestLeader = null; let nearestRemaining = Infinity;
      for (const b of aircraft) {
        if (a === b || b.altitude !== 0 || !checkpointStates.includes(b.state)) continue;
        const otherCheckpoint = upcomingCheckpoint(b); if (!otherCheckpoint) continue;
        if (checkpoint.point.type !== otherCheckpoint.point.type || checkpoint.point.runwayId !== otherCheckpoint.point.runwayId ||
          GroundOperations.distance(checkpoint.point, otherCheckpoint.point) > 5) continue;
        const otherRemaining = remainingTo(b, otherCheckpoint.index);
        if (otherRemaining + 2 < ownRemaining && otherRemaining < nearestRemaining) {
          nearestLeader = b; nearestRemaining = otherRemaining;
        }
      }
      if (nearestLeader) {
        a.taxiLeader = nearestLeader;
        a.taxiFollowingDistance = Math.max(18, (a.model.length + nearestLeader.model.length) * .25);
      }
    }
    for (const a of moving.filter(a => a.vel.magSq() > .001)) {
      const speed = a.vel.mag(); const u = a.vel.copy().setMag(1); let nearest = 65;
      for (const b of aircraft) {
        if (a === b || b.altitude > 0 || !['TAXIING', 'TAXI_IN'].includes(b.state) || b.vel.magSq() < .001 || a.taxiLeader) continue;
        const dx = b.pos.x - a.pos.x; const dy = b.pos.y - a.pos.y; const along = dx * u.x + dy * u.y;
        const lateral = Math.abs(dx * u.y - dy * u.x);
        const aligned = (a.vel.x * b.vel.x + a.vel.y * b.vel.y) / (speed * b.vel.mag()) > .94;
        if (aligned && along > 0 && along < nearest && lateral < 3) { nearest = along; a.taxiLeader = b; a.taxiFollowingDistance = Math.max(12, (a.model.length + b.model.length) * .15); }
      }
    }
    for (const a of moving) for (const b of aircraft) {
      if (a === b || b.altitude > 0 || b.state === 'PARKED') continue;
      const delta = b.pos.copy().sub(a.pos); const distance = delta.mag();
      const queuedLeader = a.taxiLeader === b;
      const ahead = queuedLeader || (a.vel.magSq() > .001 && delta.x * a.vel.x + delta.y * a.vel.y > 0);
      const safeGap = Math.max(12, (a.model.length + b.model.length) * .20);
      const pushbackObstacle = b.state === 'PUSHBACK' && b.groundRoute && !b.holdPosition;
      if (ahead && distance < safeGap + (pushbackObstacle ? 8 : 0) && (queuedLeader || pushbackObstacle || b.holdPosition || aircraft.indexOf(a) > aircraft.indexOf(b))) { a.trafficHold = true; a.trafficConflict = b.callsign; }
    }
  }

  afterOperations() {
    for (const [aircraft, fighter] of this.emergencies.assignments) if (!this.interceptNotices.has(aircraft.callsign)) {
      this.interceptNotices.add(aircraft.callsign);
      this.recordEvent(`${fighter.callsign} : interception militaire engagée sur ${aircraft.callsign} (squawk ${aircraft.squawk}).`);
    }
    for (const a of this.simulation.entities.filter(a => a instanceof ModelAircraft && !a.destroyed)) {
      this.dispatchRescue(a);
      if (a.state === 'ROLL_OUT' && GroundOperations.distance(a.pos, a.rolloutTarget) < 1.2 && a.vel.mag() < .1) this.beginVacating(a);
      if (a.state === 'STOPPED' && this.simulation.stepCount % 120 === 0) this.beginVacating(a);
      if (a.state === 'TAKEOFF_ROLL') {
        const r = a.departureRunway; const along = GroundOperations.projection(a.pos, r).t * r.length;
        if (a.vel.mag() >= a.model.rotation && along - a.takeoffStart > (r.length - a.takeoffStart) * a.model.takeoffRun) { a.state = 'CLIMB_OUT'; a.altitude = 20; a.assignedAltitude = 2500; }
      }
      if (a.state === 'ABORTING_TAKEOFF' && a.vel.mag() < .08) {
        a.state = 'TAKEOFF_ABORTED'; a.holdPosition = true;
        this.recordEvent(`${a.callsign} : arrêt complet après interruption. Piste toujours occupée, demandez un dégagement.`);
      }
      if (a.state === 'CLIMB_OUT') {
        a.altitude = Math.min(2500, a.altitude + 12);
        if (a.altitude > 150) this.runwayController.release(a.assignedRunway, a);
        if (a.altitude >= 2500) { a.state = 'AIRBORNE'; this.recordEvent(`${a.callsign} : départ terminé, transfert départ.`); }
      }
      if (a.state === 'PARKED' && this.emergencyDispatches.has(a.callsign)) {
        const rescue = this.emergencyDispatches.get(a.callsign);
        for (const vehicle of this.emergencyVehicles) if (vehicle.state === 'ON_SCENE') {
          const route = this.emergencyRoute(vehicle.pos, vehicle.station);
          vehicle.returnToStation(route);
        }
        if (this.emergencyVehicles.every(vehicle => vehicle.state === 'STATIONED')) this.emergencyDispatches.delete(a.callsign);
      }
      const sectorRadius = (this.airport.metersToPixels ?? .2) * 1852 * (typeof MapCamera !== 'undefined' ? MapCamera.SECTOR_RADIUS_NM : 80);
      if (a.operation === 'DEPARTURE' && a.departureExitReached && a.state === 'AIRBORNE' && Math.hypot(a.pos.x - 550, a.pos.y - 310) > sectorRadius) {
        this.simulation.remove(a); this.traffic.aircraft.delete(a); this.traffic.archived.push({ aircraft: a, reason: 'AIRBORNE' });
        this.recordEvent(`${a.callsign} : sortie du secteur, transfert terminé.`);
      }
    }
  }

  assignArrivalParking() {} // Tower arrivals vacate before receiving a separate taxi clearance.
  snapshot() { return { message: this.lastMessage, seed: this.generator.seed, randomTraffic: this.generator.enabled }; }
}
globalThis.TowerSession = TowerSession;
