/** Isolated, seeded demonstrations using the same aircraft, systems and physics as play. */
class SteeringDemos {
  static catalog = Object.freeze([
    { id: 'TCAS', label: 'TCAS · rencontre frontale', observe: 'Deux vols à 3000 ft : RA, répulsion latérale prioritaire et croisement sans collision.' },
    { id: 'ALTITUDE', label: 'TCAS · croisement de paliers', observe: 'Montée de 2000 à 3500 ft vers le niveau d’un trafic opposé : anticipation TCAS et suspension de la montée pendant la RA.' },
    { id: 'COLLISION', label: 'Collision · conflit trop tardif', observe: 'Deux vols trop proches pour éviter le contact : TCAS actif, collision physique, explosion puis destruction. Cette situation est volontairement irrécupérable.' },
    { id: 'STORM', label: 'Obstacle Avoidance · orage', observe: 'Un avion vise un point derrière un orage immobile. Le couloir d’anticipation et la hitbox circulaire déclenchent le contournement.' },
    { id: 'SEEK', label: 'Seek · rejoindre un objectif', observe: 'La force Seek vise le point jaune. Le virage reste borné et le mouvement provient de Vehicle.update().' },
    { id: 'WANDER', label: 'Wander · entrant sans clairance', observe: 'L’entrant suit un axe général avec une dérive organique. Observer la force Wander et son cercle projeté.' },
    { id: 'TAXI', label: 'Path Following + Leader Following · file taxi', observe: 'Projection sur les taxiways, virages, freinage au hold short et file derrière le leader sans superposition.' },
    { id: 'ARRIVAL', label: 'Arrival · freinage au stand', observe: 'Le suivi du segment appelle Arrival en fin de parcours : ralentissement progressif, arrêt au stand et vitesse finale nulle.' },
    { id: 'HOLDING', label: 'Path Following · circuit d’attente', observe: 'Entrée au point puis boucle d’attente : projection prédictive, suivi des segments et virages continus.' },
    { id: 'INTERCEPT', label: 'Seek / Pursuit / escorte · interception', observe: 'Mise en situation rapprochée : le chasseur rejoint le civil, reste sur son côté sans TCAS entre partenaires, puis monte et part vers une sortie à la finale. L’approche et sa clairance sont automatisées pour cette démo.' }
  ]);

  static create(id) {
    const definition = this.catalog.find(d => d.id === id);
    if (!definition) throw new Error(`Unknown steering demo: ${id}`);
    const airport = AirportCatalog.SKY1;
    const session = new TowerSession({ airport, runway: airport.runway, parkings: airport.parking, randomTraffic: false, seed: 424242, speed: 1 });
    const mission = new MissionSystem(session, { id: `DEMO_${id}`, label: definition.label, continuous: true, arrivals: 0, departures: 0 });
    session.mission = mission; session.simulation.addSystem(mission);
    const demo = { ...definition, session, mission, airport, aircraft: [], trails: new Map(), observed: new Set(), ticks: 0, status: 'Prêt · lancez la simulation', complete: false, bounds: [] };
    const flight = (callsign, x, y, altitude = 3000, heading = 90) => {
      // Explicit scenario initialization; positions are never reassigned during a demo.
      const a = new ModelAircraft(x, y, { callsign, modelId: 'B738', altitude, state: 'NAV_HEADING' });
      a.wanderEnabled = false; const direction = AirNavigation.vector(heading);
      a.vel.set(direction.x * a.model.cruise, direction.y * a.model.cruise);
      session.addAircraft(a); session.airNavigation.setHeading(a, heading); demo.aircraft.push(a); return a;
    };
    let a; let b; let storm; let fighter;
    if (['TCAS', 'ALTITUDE', 'COLLISION'].includes(id)) {
      const halfDistance = id === 'COLLISION' ? 28 : 200;
      a = flight('DEMO01', 550 - halfDistance, -400, id === 'ALTITUDE' ? 2000 : 3000);
      b = flight('DEMO02', 550 + halfDistance, -400, 3000, 270);
      if (id === 'ALTITUDE') session.airNavigation.setAltitude(a, 3500);
      demo.bounds = [{ x: 150, y: -650 }, { x: 950, y: -100 }];
    } else if (id === 'STORM') {
      // Start far enough outside the enlarged hitbox to allow a bounded,
      // fixed-wing turn. A spawn six units from the cell cannot be recovered.
      a = flight('METEO01', -400, -400);
      // Offset the large cell from the centerline while keeping its edge in
      // the predictive corridor, so the demo shows a genuine safe bypass.
      storm = session.weather.addStorm(500, 300, { radius: 80, maxSpeed: 0, maxForce: 0, vx: 0, vy: 0, phase: 0 });
      // Give the demonstration aircraft an explicit destination beyond the
      // cell. This keeps the enlarged storm demo observable: it must first
      // avoid the hitbox, then resume its route and leave the sector.
      a.state = 'VECTORING'; a.airNavigation = null; a.target = { x: 2200, y: -400 };
      demo.bounds = [{ x: -500, y: -850 }, { x: 1500, y: 1200 }];
    } else if (id === 'SEEK') {
      a = flight('SEEK01', 300, -400, 3000, 180);
      a.airNavigation = null; a.state = 'VECTORING'; a.target = { x: 1100, y: -400 };
      demo.bounds = [a.pos.copy(), a.target, { x: 550, y: 0 }];
    } else if (id === 'WANDER') {
      a = session.spawnInbound({ callsign: 'WANDER01', modelId: 'B738', position: { x: 200, y: -400 }, altitude: 3000, inboundTrack: { x: 1, y: 0 }, wanderStrength: .45 });
      a.vel.set(a.model.cruise, 0); demo.aircraft.push(a);
      demo.bounds = [{ x: 0, y: -750 }, { x: 1200, y: -50 }];
    } else if (id === 'TAXI') {
      for (const [index, x] of [380, 430].entries()) {
        const plane = new ModelAircraft(x, 260, { callsign: index ? 'FOLLOW01' : 'LEAD01', modelId: 'B738', altitude: 0, state: 'TAXIING', operation: 'DEPARTURE' });
        session.addAircraft(plane); demo.aircraft.push(plane); plane.vel.set(-plane.model.taxi, 0);
        session.ground.start(plane, [{ x, y: 260 }, { x: 180, y: 260 }, { x: 180, y: 335, type: 'HOLD_SHORT', runwayId: '09/27' }], 'TAXI');
      }
      [a, b] = demo.aircraft;
      demo.bounds = [{ x: 100, y: 100 }, { x: 620, y: 500 }];
    } else if (id === 'ARRIVAL') {
      a = new ModelAircraft(380, 260, { callsign: 'ARRIVE01', modelId: 'B738', altitude: 0, state: 'TAXI_IN' });
      a.parkingId = 'P1'; a.vel.set(0, -a.model.taxi); session.addAircraft(a); demo.aircraft.push(a);
      const stand = session.departures.parkings.get('P1'); stand.reservedFor = a.callsign;
      session.ground.start(a, [{ x: 380, y: 260 }, { x: 380, y: 185 }], 'TAXI_IN', () => { a.state = 'HOLD_POSITION'; stand.occupied = true; });
      demo.bounds = [{ x: 180, y: 80 }, { x: 680, y: 450 }];
    } else if (id === 'HOLDING') {
      const fix = session.navPoints.find(f => f.id === 'TRN-N');
      a = flight('HOLD01', fix.x - 180, fix.y, 3000);
      session.airNavigation.direct(a, fix.id, { hold: true, inbound: 90, turn: 'RIGHT', radiusNm: .5, legNm: 1 });
      demo.bounds = a.airNavigation.holding.points;
    } else if (id === 'INTERCEPT') {
      a = flight('CIVIL01', -1400, 350, 2000);
      a.declareEmergency('7600', 'RADIO_FAILURE');
      fighter = new FighterJet(-1800, 410, { callsign: 'MILDEMO', altitude: 2000, state: 'AIRBORNE' });
      fighter.vel.set(2, 0); session.simulation.add(fighter);
      session.emergencies.intercept(a, fighter);
      demo.bounds = [{ x: -2000, y: -350 }, { x: 1100, y: 1100 }];
    }
    demo.focus = a; demo.minStormDistance = Infinity;
    session.simulation.addSystem({ afterStep: () => {
      demo.ticks++;
      for (const plane of [...demo.aircraft, ...(fighter ? [fighter] : [])]) {
        if (!demo.trails.has(plane)) demo.trails.set(plane, [plane.pos.copy()]);
        if (demo.ticks % 6 === 0 && !plane.destroyed) {
          const trail = demo.trails.get(plane); trail.push(plane.pos.copy()); if (trail.length > 500) trail.shift();
        }
        for (const name of plane.telemetry?.behaviors ?? []) demo.observed.add(name);
        if (plane.tcasAdvisory?.level === 'RA') demo.observed.add('RA');
      }
      const hit = demo.aircraft.some(plane => plane.destroyed);
      if (id === 'COLLISION') demo.complete ||= hit;
      else if (id === 'TCAS' || id === 'ALTITUDE') demo.complete ||= demo.ticks > 450 && demo.observed.has('RA') && !hit;
      else if (id === 'STORM') {
        demo.minStormDistance = Math.min(demo.minStormDistance, GroundOperations.distance(a.pos, storm.pos));
        demo.failed ||= demo.minStormDistance < storm.hitboxRadius + a.r;
        demo.complete ||= !demo.failed && a.pos.x > storm.pos.x + storm.radius + 80 && demo.observed.has('obstacleAvoidance');
      } else if (id === 'SEEK') demo.complete ||= GroundOperations.distance(a.pos, a.target) < 60 && demo.observed.has('navigation');
      else if (id === 'WANDER') demo.complete ||= demo.ticks > 180 && demo.observed.has('wander');
      else if (id === 'TAXI') demo.complete ||= a.state === 'HOLD_SHORT' && GroundOperations.distance(a.pos, b.pos) > 12 && demo.observed.has('leaderFollowing');
      else if (id === 'ARRIVAL') {
        if (a.state === 'HOLD_POSITION' && a.vel.mag() < .001) a.state = 'PARKED';
        demo.complete ||= a.state === 'PARKED' && a.vel.mag() < .001;
      }
      else if (id === 'HOLDING') demo.complete ||= (a.airNavigation?.holding?.laps ?? 0) >= 1;
      else if (id === 'INTERCEPT') {
        if (fighter.mission === 'ESCORT' && !a.guidance && a.state !== 'FINAL') session.assignRunway(a, '09');
        if (session.canAuthorizeLanding(a) && !a.landingCleared) session.authorizeLanding(a);
        demo.complete ||= fighter.mission === 'EXIT' && demo.observed.has('leaderFollowing');
      }
      demo.status = demo.failed ? 'Évitement insuffisant : entrée dans la zone orageuse'
        : hit && id !== 'COLLISION' ? 'Contact constaté · relancez la démo'
        : demo.complete ? 'Démonstration observée ✓ · vous pouvez relancer'
          : `En cours · ${[...demo.observed].join(', ') || 'initialisation'}`;
      if (demo.complete && !demo.autoPaused) { demo.autoPaused = true; session.simulation.paused = true; }
    } });
    session.simulation.paused = true;
    session.recordEvent(`DÉMO : ${definition.label}. ${definition.observe}`);
    return { id: `DEMO_${id}`, demo, session, mission, arrivals: demo.aircraft, departures: [], airport };
  }
}
globalThis.SteeringDemos = SteeringDemos;
