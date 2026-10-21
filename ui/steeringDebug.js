/** Screen-space inspection of the actual steering inputs and integrated force. */
class SteeringDebug {
  static mount() {
    const panel = document.createElement('aside'); panel.id = 'steering-debug';
    panel.className = 'steering-debug'; panel.setAttribute('aria-label', 'Inspecteur des steering behaviors');
    panel.innerHTML = `<header><strong>STEERING LAB</strong><button type="button" id="debug-close" aria-label="Fermer le debug">×</button></header><p>Inspecteur du vol sélectionné · D</p><div class="debug-layers">${[['routes', 'Parcours et objectifs'], ['forces', 'Forces et vitesse'], ['projection', 'Projection prédictive'], ['tcas', 'Détection TCAS / CPA'], ['weather', 'Hitbox météo / anticipation']].map(([id, label]) => `<label><input type="checkbox" id="debug-${id}" checked> ${label}</label>`).join('')}</div><div id="debug-readout"></div><p class="debug-legend">Jaune : route · Vert : vitesse · Cyan : force · Rouge : TCAS · Violet : obstacles</p>`;
    document.body.append(panel);
    const demos = document.createElement('section'); demos.className = 'debug-demos';
    demos.innerHTML = `<label for="debug-demo-select">Démonstrations pour l’évaluation</label><select id="debug-demo-select">${SteeringDemos.catalog.map(d => `<option value="${d.id}">${d.label}</option>`).join('')}</select><p id="debug-demo-description"></p><div class="debug-demo-actions"><button id="debug-demo-load" type="button">Charger / Rejouer</button><button id="debug-demo-toggle" type="button" disabled>Démarrer</button><button id="debug-demo-return" type="button" disabled>Retour à la partie</button></div><label class="debug-demo-speed">Vitesse démo<select id="debug-demo-speed"><option value="0.25">0,25×</option><option value="0.5">0,5×</option><option value="1" selected>1×</option><option value="2">2×</option><option value="4">4×</option></select></label><p id="debug-demo-status" role="status" aria-live="polite">La partie en cours est conservée. Charger prépare une démo isolée en pause.</p>`;
    panel.querySelector('.debug-layers').before(demos);
    const environment = document.createElement('section'); environment.className = 'debug-environment';
    environment.innerHTML = `<header><strong>ENVIRONNEMENT</strong><span>réglages de démonstration</span></header><div class="debug-spawn-grid"><label>Éclairage<select id="debug-time-of-day"><option value="DAY" selected>Jour</option><option value="NIGHT">Nuit · balisage actif</option></select></label><label>Météo<select id="debug-weather-profile"><option value="CLEAR" selected>Ciel clair</option><option value="STORM">Orageux · cellules aléatoires</option></select></label></div><p id="debug-weather-status" role="status" aria-live="polite">Aucun orage actif.</p>`;
    panel.querySelector('.debug-layers').before(environment);
    const setWeather = profile => {
      session.weather.profile = profile; globalThis.skylineWeatherProfile = profile;
      for (const storm of [...session.weather.storms]) session.weather.removeStorm(storm);
      if (profile !== 'STORM') { byId('debug-weather-status').textContent = 'Ciel clair · visibilité normale.'; return; }
      const random = session.generator?.random;
      const next = () => random?.next ? random.next() : Math.random();
      const center = airport.center ?? { x: 550, y: 310 };
      const units = (airport.metersToPixels ?? .2) * 1852;
      const sector = (typeof MapCamera !== 'undefined' ? MapCamera.SECTOR_RADIUS_NM : 80) * units;
      const count = 2 + Math.floor(next() * 4);
      for (let i = 0; i < count; i += 1) {
        const angle = next() * Math.PI * 2;
        const distance = (16 + next() * 46) * units;
        session.weather.addStorm(center.x + Math.cos(angle) * distance, center.y + Math.sin(angle) * distance, {
          radius: 55 + next() * 35, intensity: .85 + next() * .15,
          bounds: { x: center.x - sector, y: center.y - sector, width: sector * 2, height: sector * 2 }
        });
      }
      byId('debug-weather-status').textContent = `Orages actifs · ${count} cellules dans le secteur.`;
    };
    byId('debug-time-of-day').onchange = event => { globalThis.skylineTimeOfDay = event.target.value; };
    byId('debug-weather-profile').onchange = event => { setWeather(event.target.value); };
    const spawn = document.createElement('section'); spawn.className = 'debug-spawn';
    spawn.innerHTML = `<header><strong>OUTILS DE TEST</strong><span>création contrôlée</span></header><div class="debug-spawn-grid"><label>Modèle<select id="debug-spawn-model"><option value="B738">B737-800</option><option value="B788">B787-8</option><option value="A388">A380-800</option></select></label><label>Altitude<select id="debug-spawn-altitude"><option value="1500">1 500 ft</option><option value="3000" selected>3 000 ft</option><option value="5000">5 000 ft</option><option value="8000">8 000 ft</option></select></label><label>Entrée<select id="debug-spawn-entry"><option value="BORDER" selected>Bord du secteur</option><option value="FINAL">Finale proche · 8 NM</option></select></label></div><div class="debug-spawn-actions"><button id="debug-spawn-arrival" type="button">＋ Arrivée en vol</button><button id="debug-spawn-departure" type="button">＋ Départ au stand</button><button id="debug-spawn-helicopter" type="button">＋ H145 · station</button><button id="debug-spawn-emergency" type="button">⚠ 7700 sur sélection</button></div><label class="debug-traffic-toggle"><input id="debug-random-traffic-toggle" type="checkbox"> Trafic automatique pendant le test</label><p id="debug-spawn-status" role="status" aria-live="polite">Les créations sont sélectionnées automatiquement pour enchaîner les commandes.</p>`;
    panel.querySelector('.debug-layers').after(spawn);
    const spawnModel = () => byId('debug-spawn-model').value;
    const spawnAltitude = () => Number(byId('debug-spawn-altitude').value);
    const status = message => { byId('debug-spawn-status').textContent = message; };
    const addArrival = () => {
      const r = session.directions.find(direction => direction.lengthMeters >= AircraftModels[spawnModel()].minRunway) ?? session.runway;
      const units = (airport.metersToPixels ?? .2) * 1852; const center = airport.center ?? { x: 550, y: 310 };
      const entry = byId('debug-spawn-entry').value === 'FINAL' ? RunwayDirections.point(r, -8 * units, 0) : (() => { const angle = (session.generator.random?.between?.(0, 360) ?? Math.random() * 360) * Math.PI / 180; const radius = (MapCamera.SECTOR_RADIUS_NM - 4) * units; return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius }; })();
      const dx = center.x - entry.x; const dy = center.y - entry.y; const length = Math.hypot(dx, dy) || 1;
      const a = session.spawnInbound({ modelId: spawnModel(), callsign: session.generator.callsign(), position: entry, inboundTrack: { x: dx / length, y: dy / length }, altitude: spawnAltitude(), wanderEnabled: false });
      if (a) { selectAircraft(a); status(`${a.callsign} créé en ${byId('debug-spawn-entry').value === 'FINAL' ? 'finale proche' : 'bord de secteur'}.`); updateHud(); }
    };
    const addDeparture = () => { const a = session.createDepartureFromFreeParking(ModelAircraft, { modelId: spawnModel(), callsign: session.generator.callsign() }); if (a) { selectAircraft(a); status(`${a.callsign} créé au stand ${a.parkingId}.`); updateHud(); } else status('Aucun stand compatible disponible.'); };
    byId('debug-spawn-arrival').onclick = addArrival; byId('debug-spawn-departure').onclick = addDeparture;
    byId('debug-spawn-helicopter').onclick = () => { const a = session.spawnHelicopter({ callsign: `DBG-H${Math.floor(Math.random() * 90 + 10)}` }); if (a) { selectAircraft(a); status(`${a.callsign} créé sur la station H1.`); updateHud(); } else status('Station H1 indisponible ou hélicoptère déjà actif.'); };
    byId('debug-spawn-emergency').onclick = () => { if (selectedAirplane && session.declareEmergency(selectedAirplane, '7700', 'DEBUG')) { status(`${selectedAirplane.callsign} passe en urgence 7700.`); updateHud(); } else status('Sélectionnez un avion compatible.'); };
    byId('debug-random-traffic-toggle').onchange = event => { session.generator.enabled = event.target.checked; status(`Trafic automatique ${event.target.checked ? 'activé' : 'désactivé'}.`); };
    const observed = document.createElement('p'); observed.id = 'debug-demo-observed';
    byId('debug-demo-status').after(observed);
    const describe = () => { byId('debug-demo-description').textContent = SteeringDemos.catalog.find(d => d.id === byId('debug-demo-select').value).observe; };
    byId('debug-demo-select').onchange = describe; describe();
    byId('debug-demo-load').onclick = () => { startDebugDemo(byId('debug-demo-select').value); session.simulation.speed = Number(byId('debug-demo-speed').value); SteeringDebug.updateDemo(scenario.demo); };
    byId('debug-demo-toggle').onclick = () => { session.simulation.togglePause(); SteeringDebug.updateDemo(scenario.demo); };
    byId('debug-demo-return').onclick = () => { stopDebugDemo(); SteeringDebug.updateDemo(null); };
    byId('debug-demo-speed').onchange = () => { if (scenario.demo) session.simulation.speed = Number(byId('debug-demo-speed').value); };
    panel.querySelector('#debug-readout').append(byId('steering-data'));
    byId('debug-close').onclick = () => gameHud.dispatch('debugMenu');
  }

  static updateDemo(demo) {
    if (!byId('debug-demo-toggle')) return;
    byId('debug-demo-toggle').disabled = !demo; byId('debug-demo-return').disabled = !demo;
    byId('debug-demo-toggle').textContent = demo && !demo.session.simulation.paused ? 'Pause' : 'Démarrer';
    const status = demo ? `${demo.label} · ${demo.status}` : 'La partie en cours est conservée. Charger prépare une démo isolée en pause.';
    if (byId('debug-demo-status').textContent !== status) byId('debug-demo-status').textContent = status;
    const evidence = demo ? `Behaviors observés : ${[...demo.observed].join(' · ') || 'en attente du démarrage'}` : '';
    if (byId('debug-demo-observed').textContent !== evidence) byId('debug-demo-observed').textContent = evidence;
    if (demo?.complete && !demo.framedResult) {
      demo.framedResult = true; view.fit([...demo.bounds, ...[...demo.trails.values()].flat(), ...demo.aircraft.map(a => a.pos)]);
    }
  }

  static syncSession(current) {
    const traffic = byId('debug-random-traffic-toggle'); if (!traffic) return;
    traffic.checked = Boolean(current.generator.enabled);
    byId('debug-time-of-day').value = globalThis.skylineTimeOfDay ?? 'DAY';
    const count = current.weather.storms.length;
    byId('debug-weather-profile').value = count ? 'STORM' : 'CLEAR';
    const message = count ? `Orages actifs · ${count} cellule${count > 1 ? 's' : ''} dans le secteur.` : 'Ciel clair · aucun orage actif.';
    if (byId('debug-weather-status').textContent !== message) byId('debug-weather-status').textContent = message;
  }

  static render(c, camera, session, aircraft, demo = null) {
    if (demo && byId('debug-routes')?.checked) {
      c.save(); c.lineWidth = 2; c.setLineDash([4, 3]); let index = 0;
      for (const trail of demo.trails.values()) {
        c.strokeStyle = ['#f4d889', '#83dfe3', '#dda8fb'][index++ % 3]; c.beginPath();
        trail.forEach((point, i) => { const p = camera.screen(point); if (i) c.lineTo(p.x, p.y); else c.moveTo(p.x, p.y); }); c.stroke();
      }
      c.restore();
    }
    if (!aircraft || aircraft.destroyed) return;
    const enabled = id => byId(`debug-${id}`)?.checked;
    const screen = p => camera.screen(p);
    const stroke = (points, color, dash = []) => {
      if (points.length < 2 || points.some(p => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y))) return;
      c.strokeStyle = color; c.setLineDash(dash); c.beginPath();
      points.map(screen).forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.stroke(); c.setLineDash([]);
    };
    const ring = (position, radius, color) => { const p = screen(position); c.strokeStyle = color; c.beginPath(); c.arc(p.x, p.y, radius * camera.scale, 0, Math.PI * 2); c.stroke(); };
    const arrow = (vector, color, label, scale) => {
      if (!vector || Math.hypot(vector.x, vector.y) < .00001) return;
      const p = screen(aircraft.pos); const length = Math.min(120, Math.hypot(vector.x, vector.y) * scale);
      const angle = Math.atan2(vector.y, vector.x); const x = p.x + Math.cos(angle) * length; const y = p.y + Math.sin(angle) * length;
      c.strokeStyle = color; c.fillStyle = color; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(x, y);
      c.lineTo(x - Math.cos(angle - .45) * 7, y - Math.sin(angle - .45) * 7); c.moveTo(x, y); c.lineTo(x - Math.cos(angle + .45) * 7, y - Math.sin(angle + .45) * 7); c.stroke();
      c.fillText(label, x + 5, y - 5);
    };
    c.save(); c.lineWidth = 1.5; c.font = '12px monospace';
    const a = aircraft;
    const route = a.groundRoute ? [a.pos, ...a.groundRoute.slice(a.routeIndex)]
      : a.state === 'VECTORING' && a.approachRoute ? [a.pos, ...a.approachRoute.slice(a.approachRouteIndex)]
        : a.path ?? (a.target ? [a.pos, a.target] : []);
    if (enabled('routes')) {
      stroke(route, '#f4d889', [5, 4]);
      if (a.airNavigation?.holding) stroke(a.airNavigation.holding.points, '#f4d889', [5, 4]);
      for (const p of route.slice(1)) ring(p, 4 / camera.scale, '#f4d889');
    }
    if (enabled('forces')) {
      arrow(a.vel, '#90e3a7', 'v', 60);
      for (const f of a.telemetry?.components ?? []) arrow(f, f.name === 'separation' ? '#ff7474' : f.name === 'obstacleAvoidance' ? '#c7a3ff' : '#70c1db', f.name, 1000);
      arrow(a.telemetry?.force, '#ffffff', 'Σ F', 1400);
    }
    if (enabled('projection') && route.length >= 2) {
      const future = a.pathTelemetry?.future ?? a.pos.copy().add(a.vel.copy().mult(a.pathPredictionFrames ?? 15));
      const normal = a.pathTelemetry?.normal ?? PathFollowing.project(future, route[0], route[1]).point;
      stroke([a.pos, future, normal], '#72daef', [3, 3]); ring(normal, 4 / camera.scale, '#72daef');
      if (a.pathTelemetry?.target) stroke([normal, a.pathTelemetry.target], '#90e3a7');
    }
    if (enabled('projection') && a.wanderEnabled && a.state === 'INBOUND') {
      const centre = a.pos.copy().add(a.vel.copy().setMag(a.distanceCercle));
      ring(centre, a.wanderRadius, '#b8db92'); stroke([a.pos, centre], '#b8db92', [3, 4]);
    }
    if (enabled('tcas') && a.altitude > 0) {
      ring(a.pos, Math.max(150, a.tcasUnitsPerNm * .75), '#ff747477');
      for (const b of session.simulation.entities) {
        if (!(b instanceof Airplane) || b === a || b.destroyed || b.altitude <= 0 || Separation.exempt(a, b)) continue;
        const advisory = Separation.advisoryFor(a, [b]); if (!advisory) continue;
        const cpa = Separation.closestApproach(a, b, 120);
        stroke([a.pos, b.pos], advisory.level === 'RA' ? '#ff7474' : '#f5c46a', [3, 5]);
        stroke([a.pos, a.pos.copy().add(a.vel.copy().mult(cpa.time))], '#ff7474');
      }
    }
    if (enabled('weather')) {
      const distance = Math.max(90, a.vel.mag() / FlightSteering.turnRate(a) * 2);
      const ahead = a.vel.copy(); if (ahead.magSq() > 0) ahead.setMag(distance);
      const end = a.pos.copy().add(ahead); stroke([a.pos, end], '#c7a3ff', [4, 4]);
      for (const storm of session.weather.storms) ring(storm.pos, storm.hitboxRadius, '#c7a3ff');
    }
    c.restore();
  }
}
globalThis.SteeringDebug = SteeringDebug;
