let airport, scenario, session, selectedAirplane;
let controlsBound = false;
let trafficSignature = null;
let selectionSignature = '';
let view = null;
let mapGesture = null;
let gameHud = null;
let aiLabView = null;
let stormCloudTextures = [];
let debugDemoReturn = null;
const byId = id => document.getElementById(id);
const visibleAircraft = () => session.simulation.entities.filter(e => e instanceof ModelAircraft && !e.destroyed && view.visible(e.pos, 12));
// Strips cover the complete controlled sector, independently of the camera viewport.
const sectorAircraft = () => session.simulation.entities.filter(e => e instanceof ModelAircraft && !e.destroyed && view.inSector(e.pos, airport.center));

function preload() {
  if (typeof loadImage === 'function') {
    try {
      stormCloudTextures.push(loadImage('assets/smoke_04.png', () => {}, () => {}));
      stormCloudTextures.push(loadImage('assets/smoke_01.png', () => {}, () => {}));
    } catch (_) {}
  }
}

function setup() {
  const host = byId('canvas-container');
  const canvas = createCanvas(host.clientWidth || 1100, host.clientHeight || 620); canvas.parent(host);
  const discovery = document.createElement('option'); discovery.value = '.25'; discovery.textContent = '0.25× · découverte'; discovery.selected = true;
  byId('speed-select').prepend(discovery); byId('speed-select').value = '.25';
  resetTraining(); bindControls(); bindMapControls(canvas.elt);
  gameHud = new GameHud(); aiLabView = new AILabView(); SimulationControls.bind(); windowResized();
}

function resetTraining(replay = false) {
  if (debugDemoReturn) stopDebugDemo();
  const seedInput = byId('traffic-seed').value;
  const seed = replay ? session.generator.seed : seedInput !== '' ? Number(seedInput) >>> 0 : Date.now() >>> 0;
  airport = AirportCatalog[byId('airport-select').value] ?? AirportCatalog.SKY1;
  const weatherProfile = byId('weather-profile')?.value ?? 'CLEAR';
  const timeOfDay = byId('time-of-day')?.value ?? 'DAY';
  globalThis.skylineTimeOfDay = timeOfDay;
  globalThis.skylineWeatherProfile = weatherProfile;
  scenario = ScenarioFactory.create(byId('scenario-select').value, {
    tower: true, airport, runway: airport.runway, parkings: airport.parking,
    speed: Number(byId('speed-select').value), seed,
    gameMode: byId('game-mode').value,
    randomTraffic: byId('random-traffic').checked, intensity: byId('traffic-intensity').value,
    weatherProfile,
    timeOfDay,
    timeLimitSeconds: Number(byId('emergency-time-limit')?.value ?? 180)
  });
  session = scenario.session;
  aiLabView?.attachToSession();
  view = new MapCamera(width, height, (airport.metersToPixels ?? .2) * 1852); view.airport(); mapGesture = null;
  selectedAirplane = visibleAircraft()[0] ?? scenario.arrivals[0] ?? scenario.departures[0] ?? null;
  byId('nav-fix-select').replaceChildren(...session.navPoints.map(fix => { const option = document.createElement('option'); option.value = fix.id; option.textContent = `${fix.id} · ${fix.training ? 'exercice' : fix.type}`; return option; }));
  byId('play-exit-select').replaceChildren(...session.navPoints.filter(fix => fix.type === 'EXIT').map(fix => { const option = document.createElement('option'); option.value = fix.id; option.textContent = `${fix.id} · cap ${fix.sectorBearing}°`; return option; }));
  if (gameHud) { gameHud.resultShown = false; byId('mission-result').hidden = true; }
  updateFixDetails();
  trafficSignature = null; selectionSignature = '';
  byId('airport-label').textContent = `${airport.name} · ${airport.id}`;
  byId('pause-button').textContent = 'Pause';
  byId('seed-info').textContent = `Graine active : ${session.generator.seed} · rejouable avec les mêmes commandes.`;
  updateHud();
}

function refreshDemoControls() {
  byId('nav-fix-select').replaceChildren(...session.navPoints.map(fix => {
    const option = document.createElement('option'); option.value = fix.id; option.textContent = `${fix.id} · ${fix.type}`; return option;
  }));
  byId('play-exit-select').replaceChildren(...session.navPoints.filter(f => f.type === 'EXIT').map(fix => {
    const option = document.createElement('option'); option.value = fix.id; option.textContent = fix.id; return option;
  }));
  byId('airport-label').textContent = `${airport.name} · ${scenario.demo ? 'DÉMONSTRATION' : airport.id}`;
  trafficSignature = null; selectionSignature = ''; mapGesture = null;
  updateFixDetails(); updateHud();
}

function startDebugDemo(id) {
  // Build the replacement first so invalid input never alters the current game.
  const next = SteeringDemos.create(id);
  if (!debugDemoReturn) {
    debugDemoReturn = { airport, scenario, session, view, selectedAirplane, paused: session.simulation.paused,
      tutorial: gameHud.tutorial, resultShown: gameHud.resultShown, wasPaused: gameHud.wasPaused,
      fixId: byId('nav-fix-select').value, exitId: byId('play-exit-select').value };
    session.simulation.paused = true;
  }
  scenario = next; session = next.session; airport = next.airport;
  view = new MapCamera(width, height, (airport.metersToPixels ?? .2) * 1852);
  view.fit(next.demo.bounds); selectedAirplane = next.demo.focus;
  gameHud.tutorial = new Tutorial(); gameHud.resultShown = false; gameHud.wasPaused = true;
  gameHud.debug = true; document.body.classList.add('debug-mode');
  if (byId('debug-menu-toggle')) byId('debug-menu-toggle').hidden = false;
  byId('mission-result').hidden = true;
  refreshDemoControls();
}

function stopDebugDemo() {
  if (!debugDemoReturn) return;
  const saved = debugDemoReturn; debugDemoReturn = null;
  ({ airport, scenario, session, view, selectedAirplane } = saved);
  session.simulation.paused = saved.paused;
  // Rebase the clock after the isolated presentation, avoiding catch-up steps.
  session.simulation.lastTime = null; session.simulation.accumulator = 0;
  gameHud.tutorial = saved.tutorial; gameHud.resultShown = saved.resultShown; gameHud.wasPaused = saved.wasPaused;
  refreshDemoControls();
  byId('nav-fix-select').value = saved.fixId; byId('play-exit-select').value = saved.exitId;
  updateFixDetails();
}

function draw() {
  if (!session) return;
  gameHud?.update();
  aiLabView?.update();
  SimulationControls.sync();
  if (aiLabView?.isOpen) return;
  session.simulation.update(millis() / 1000);
  background(airport.surfaceTheme === 'desert' ? '#b09c70' : '#71804f');
  const camera = mapCamera();
  SurroundingsRenderer.render(drawingContext, view, airport);
  for (const entity of session.simulation.entities) if (entity instanceof ModelAircraft || entity instanceof EmergencyVehicle) entity.renderScale = Math.max(1, (entity.altitude > 0 ? 1 : .65) / camera.scale);
  push(); translate(camera.x, camera.y); scale(camera.scale);
  RadarRenderer.renderAirport(airport);
  if (globalThis.skylineTimeOfDay === 'NIGHT') {
    // The cached airport surface is painted first; the night veil must be
    // above it, then the lights are redrawn on top before mobile entities.
    push(); noStroke(); fill(5, 14, 25, 172);
    rect(-camera.x / camera.scale, -camera.y / camera.scale, width / camera.scale, height / camera.scale);
    pop();
    RadarRenderer.renderNightLights(airport, camera.scale);
  }
  renderSelection();
  const labeledAircraft = [];
  for (const entity of session.simulation.entities) {
    if (typeof entity.render === 'function') entity.render();
    else if (typeof entity.show === 'function') entity.show();
    if (!entity.destroyed && (entity instanceof ModelAircraft || entity instanceof FighterJet)) labeledAircraft.push(entity);
  }
  pop();
  AirspaceRenderer.render(drawingContext, view, session.navPoints, byId('nav-fix-select').value, airport.id);
  const canvasBounds = byId('canvas-container').getBoundingClientRect();
  const reserved = ['.play-top', '.play-card', '.play-keys', '.show-traffic .traffic-panel'].flatMap(selector => {
    const element = document.querySelector(selector);
    if (!element || element.getClientRects().length === 0) return [];
    const rect = element.getBoundingClientRect();
    return [{ x: rect.left - canvasBounds.left, y: rect.top - canvasBounds.top, width: rect.width, height: rect.height }];
  });
  for (const [entity, placement] of FlightLabelLayout.place(labeledAircraft, view, selectedAirplane, reserved)) renderLabel(entity, placement);
  if (gameHud?.debug) SteeringDebug.render(drawingContext, view, session, selectedAirplane, scenario.demo);
  if (mapGesture?.aircraft && mapGesture.moved) AirspaceRenderer.headingArrow(drawingContext, view, mapGesture.aircraft, mapGesture.last, !session.aiAtc?.enabled && session.airNavigation.canControl(mapGesture.aircraft));
  updateHud();
  SteeringDebug.updateDemo(scenario.demo);
}

function mapCamera() {
  if (view.follow && selectedAirplane && session.owns(selectedAirplane)) view.center = { x: selectedAirplane.pos.x, y: selectedAirplane.pos.y };
  return view.transform();
}
function windowResized() { const host = byId('canvas-container'); resizeCanvas(host.clientWidth, host.clientHeight); view?.resize(width, height); }
function selectAircraft(a, { focus = false } = {}) {
  selectedAirplane = a; selectionSignature = ''; trafficSignature = null;
  if (focus && a && session.owns(a)) {
    const dock = document.querySelector('.flight-dock')?.getBoundingClientRect();
    view.focus(a.pos, { rangeNm: a.altitude > 0 ? 4 : .7, insetLeft: dock ? dock.right + 16 : 0 });
  }
  gameHud?.record('select'); updateHud();
}

function hitAircraft(point) {
  let nearest = null; let distance = 13;
  for (const a of session.simulation.entities.filter(e => e instanceof ModelAircraft && !e.destroyed)) {
    const d = GroundOperations.distance(point, view.screen(a.pos)); if (d < distance) { nearest = a; distance = d; }
  }
  return nearest;
}
function updateFixDetails() {
  const fix = session.navPoints.find(f => f.id === byId('nav-fix-select').value);
  if (!fix) return;
  if (fix.runwayId && [...byId('runway-select').options].some(option => option.value === fix.runwayId)) byId('runway-select').value = fix.runwayId;
  const source = byId('fix-source'); source.hidden = !fix.source;
  if (fix.source) source.href = fix.source; else source.removeAttribute('href');
  byId('navigation-status').textContent = fix.type === 'FINAL' ? `${fix.id} : repère de jeu à ${fix.distanceNm} NM du seuil ${fix.runwayId}, pas une STAR publiée.` : fix.training ? `${fix.id} : point fictif d’entraînement.` : `${fix.id} · ${fix.lat.toFixed(5)}°, ${fix.lon.toFixed(5)}° · position publiée.`;
}
function bindMapControls(canvas) {
  const point = event => { const r = canvas.getBoundingClientRect(); return { x: (event.clientX - r.left) * width / r.width, y: (event.clientY - r.top) * height / r.height }; };
  canvas.addEventListener('wheel', event => { event.preventDefault(); view.zoom(Math.exp(-Math.max(-120, Math.min(120, event.deltaY)) * .003), point(event)); }, { passive: false });
  canvas.addEventListener('pointerdown', event => {
    if (mapGesture || (event.button !== 0 && event.button !== 1)) return;
    const p = point(event); const a = event.shiftKey || event.button === 1 ? null : hitAircraft(p);
    if (a) selectAircraft(a);
    const onFix = session.navPoints.some(f => GroundOperations.distance(view.screen(f), p) < 12);
    mapGesture = { id: event.pointerId, start: p, last: p, aircraft: a, moved: false, forcePan: event.button === 1 || (event.shiftKey && !onFix) };
    canvas.setPointerCapture(event.pointerId); view.follow = false; canvas.style.cursor = a ? 'crosshair' : 'grabbing';
  });
  canvas.addEventListener('pointermove', event => {
    const p = point(event);
    if (!mapGesture) { canvas.style.cursor = hitAircraft(p) ? 'crosshair' : 'grab'; return; }
    if (event.pointerId !== mapGesture.id) return;
    if (GroundOperations.distance(p, mapGesture.start) > 7) mapGesture.moved = true;
    if (!mapGesture.aircraft && mapGesture.moved) view.pan(p.x - mapGesture.last.x, p.y - mapGesture.last.y);
    mapGesture.last = p;
  });
  canvas.addEventListener('pointerup', event => {
    if (!mapGesture || mapGesture.id !== event.pointerId) return;
    const gesture = mapGesture; mapGesture = null; const p = point(event);
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    canvas.style.cursor = 'grab';
    if (!session.aiAtc?.enabled && gesture.aircraft && gesture.moved && p.x >= 0 && p.y >= 0 && p.x <= width && p.y <= height) {
      const heading = AirNavigation.heading(gesture.aircraft.pos, view.world(p));
      const ok = session.airNavigation.setHeading(gesture.aircraft, heading); gameHud?.record('heading', ok); byId('heading-input').value = Math.round(heading) % 360;
    } else if (!gesture.aircraft && !gesture.moved && !gesture.forcePan) {
      const fix = session.navPoints.find(f => GroundOperations.distance(view.screen(f), p) < 12);
      if (fix) { byId('nav-fix-select').value = fix.id; updateFixDetails(); if (event.shiftKey) gameHud?.dispatch('hold'); }
    }
    updateHud();
  });
  canvas.addEventListener('pointercancel', () => { mapGesture = null; canvas.style.cursor = 'grab'; });
  canvas.addEventListener('dblclick', event => {
    const p = point(event); const fix = session.navPoints.find(f => GroundOperations.distance(view.screen(f), p) < 12);
    if (fix) { byId('nav-fix-select').value = fix.id; updateFixDetails(); if (!session.aiAtc?.enabled) gameHud?.dispatch('direct'); }
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && mapGesture) { mapGesture = null; canvas.style.cursor = 'grab'; event.preventDefault(); } });
  const zoomIn = () => view.zoom(1.5); const zoomOut = () => view.zoom(1 / 1.5); const airportView = () => view.airport();
  byId('zoom-in').onclick = zoomIn; byId('zoom-out').onclick = zoomOut;
  byId('play-zoom-in').onclick = zoomIn; byId('play-zoom-out').onclick = zoomOut; byId('play-zoom-airport').onclick = airportView;
  byId('airspace-view').onclick = () => view.airspace(); byId('airport-view').onclick = airportView;
  byId('fit-fixes').onclick = () => view.fit([{ x: 550, y: 310 }, ...session.navPoints]);
  byId('follow-aircraft').onclick = () => {
    if (!selectedAirplane) return;
    const desired = Math.min(width, height) / (8 * view.unitsPerNm);
    view.scale = Math.max(view.scale, desired); view.follow = !view.follow;
  };
  const weatherBtn = byId('weather-mode-btn');
  if (weatherBtn) {
    globalThis.radarWeatherMode = 'CLOUDS';
    weatherBtn.onclick = () => {
      globalThis.radarWeatherMode = globalThis.radarWeatherMode === 'CLOUDS' ? 'DOPPLER' : 'CLOUDS';
      weatherBtn.textContent = globalThis.radarWeatherMode === 'CLOUDS' ? 'Météo : Nuages' : 'Météo : Doppler';
      weatherBtn.classList.toggle('active', globalThis.radarWeatherMode === 'DOPPLER');
    };
  }
}

function bindControls() {
  if (controlsBound) return; controlsBound = true;
  const sessionControls = byId('airport-select').closest('section');
  sessionControls.classList.add('session-controls', 'session-collapsed');
  const sessionToggle = document.createElement('button'); sessionToggle.className = 'session-toggle'; sessionToggle.textContent = 'SESSION · AÉROPORT / VITESSE ▾'; sessionToggle.setAttribute('aria-expanded', 'false');
  sessionControls.querySelector('.section-title').replaceChildren(sessionToggle);
  sessionToggle.onclick = () => { const collapsed = sessionControls.classList.toggle('session-collapsed'); sessionToggle.setAttribute('aria-expanded', String(!collapsed)); };
  byId('pause-button').onclick = () => { const paused = session.simulation.togglePause(); byId('pause-button').textContent = paused ? 'Reprendre' : 'Pause'; };
  byId('speed-select').onchange = e => { if (!gameHud?.menu) session.simulation.speed = Number(e.target.value); };
  // Lobby fields are a draft; creating the session happens only on Play / Replay.
  byId('reset-button').onclick = () => resetTraining();
  byId('replay-button').onclick = () => gameHud ? gameHud.launchGame(true) : resetTraining(true);
  const commands = { 'pushback-button': 'authorizePushback', 'taxi-button': 'authorizeTaxi', 'cross-button': 'authorizeCrossing', 'lineup-button': 'authorizeLineUp', 'takeoff-button': 'authorizeTakeoff', 'landing-button': 'authorizeLanding', 'goaround-button': 'goAround', 'emergency-button': 'declareEmergency' };
  for (const [id, method] of Object.entries(commands)) byId(id).onclick = () => { session[method](selectedAirplane); updateHud(); };
  byId('cancel-takeoff-button').onclick = () => { session.cancelTakeoff(selectedAirplane); updateHud(); };
  byId('expedite-exit-button').onclick = () => { session.expediteRunwayExit(selectedAirplane); updateHud(); };
  byId('return-to-stand-button').onclick = () => { session.returnToStandAfterAbort(selectedAirplane); updateHud(); };
  byId('retry-takeoff-button').onclick = () => { session.retryTakeoffAfterAbort(selectedAirplane, byId('runway-select').value); updateHud(); };
  byId('intercept-button').onclick = () => { session.scramble(selectedAirplane); updateHud(); };
  byId('assign-runway-button').onclick = () => { session.assignRunway(selectedAirplane, byId('runway-select').value); updateHud(); };
  byId('play-assign-exit').onclick = () => { session.assignDepartureExit(selectedAirplane, byId('play-exit-select').value); updateHud(); };
  byId('assign-parking-button').onclick = () => { session.assignParking(selectedAirplane, byId('parking-select').value); updateHud(); };
  byId('heading-button').onclick = () => { session.airNavigation.setHeading(selectedAirplane, Number(byId('heading-input').value)); updateHud(); };
  byId('altitude-button').onclick = () => { session.airNavigation.setAltitude(selectedAirplane, Number(byId('altitude-input').value)); updateHud(); };
  byId('direct-button').onclick = () => { session.airNavigation.direct(selectedAirplane, byId('nav-fix-select').value); updateHud(); };
  byId('hold-button').onclick = () => { session.airNavigation.direct(selectedAirplane, byId('nav-fix-select').value, { hold: true, inbound: Number(byId('hold-course').value), turn: byId('hold-turn').value }); updateHud(); };
  byId('nav-fix-select').onchange = updateFixDetails;
  byId('new-departure-button').onclick = () => {
    const a = session.createDepartureFromFreeParking(ModelAircraft, { modelId: byId('model-select').value, callsign: session.generator.callsign() });
    if (a) selectAircraft(a); updateHud();
  };
  byId('new-arrival-button').onclick = () => { const a = session.generator.spawnArrival(); if (a) selectAircraft(a); updateHud(); };
  byId('new-helicopter-button').onclick = () => { const a = session.spawnHelicopter(); if (a) selectAircraft(a); updateHud(); };
  byId('random-traffic').onchange = e => { if (!gameHud?.menu) session.generator.enabled = e.target.checked; };
  byId('traffic-intensity').onchange = e => { if (!gameHud?.menu) session.generator.intensity = e.target.value; };
  byId('traffic-list').onclick = event => {
    const row = event.target.closest('[data-callsign]');
    if (row) { const a = session.simulation.entities.find(a => a.callsign === row.dataset.callsign); if (a) selectAircraft(a, { focus: true }); }
  };
  byId('traffic-list').onkeydown = event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const row = event.target.closest('[data-callsign]');
    if (row) { event.preventDefault(); row.click(); }
  };
  document.querySelectorAll('[data-tab]').forEach(button => button.onclick = () => {
    document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b === button));
    document.querySelectorAll('[data-page]').forEach(section => { section.hidden = section.dataset.page !== button.dataset.tab; });
  });
}

function renderSelection() {
  const a = selectedAirplane; if (!a || !session.owns(a)) return;
  const c = drawingContext; c.save();
  c.strokeStyle = '#ffe38a'; c.lineWidth = 1 / view.scale; c.beginPath(); c.arc(a.pos.x, a.pos.y, (a.r + 5) * (a.renderScale ?? 1), 0, Math.PI * 2); c.stroke();
  if (a.airNavigation?.holding) {
    c.strokeStyle = '#a9e7ce'; c.lineWidth = 1.5 / view.scale; c.setLineDash([6 / view.scale, 4 / view.scale]);
    c.beginPath(); a.airNavigation.holding.points.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.stroke(); c.setLineDash([]);
  }
  if (byId('route-visible').checked && !gameHud && typeof SteeringDebug === 'undefined') {
    const points = a.state === 'VECTORING' && a.approachRoute ? [a.pos, ...a.approachRoute.slice(a.approachRouteIndex)] : a.groundRoute ? [{ x: a.pos.x, y: a.pos.y }, ...a.groundRoute.slice(a.routeIndex)] : a.path ?? (a.target ? [a.pos, a.target] : []);
    if (points.length > 1) { c.setLineDash([3 / view.scale, 3 / view.scale]); c.strokeStyle = '#ffe28e'; c.lineWidth = 1 / view.scale; c.beginPath(); points.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.stroke(); c.setLineDash([]); }
    for (const p of points.filter(p => p.type)) { c.fillStyle = p.type === 'HOLD_SHORT' ? '#ef6f53' : '#efcc68'; c.beginPath(); c.arc(p.x, p.y, 2.5, 0, Math.PI * 2); c.fill(); }
    if (a.telemetry?.force) {
      const f = a.telemetry.force; c.strokeStyle = '#55e4bf'; c.beginPath(); c.moveTo(a.pos.x, a.pos.y); c.lineTo(a.pos.x + f.x * 180, a.pos.y + f.y * 180); c.stroke();
    }
    const r = session.direction(a.assignedRunway);
    if (r) {
      c.save(); c.translate(r.x1, r.y1); c.rotate(Math.atan2(r.y2 - r.y1, r.x2 - r.x1));
      c.strokeStyle = 'rgba(255,220,120,.7)'; c.lineWidth = 1; c.setLineDash([4, 5]);
      c.strokeRect(-3, -r.width / 2 - 3, r.length + 6, r.width + 6); c.restore();
    }
  }
  c.restore();
}

function renderLabel(a, placement) {
  const c = drawingContext; c.save();
  const { x, y, width, height, compact } = placement;
  const selected = a === selectedAirplane; const accent = a.emergency ? '#ff8076' : a instanceof FighterJet ? '#8fe6dc' : a.altitude > 0 ? '#9ed9cf' : '#f2bd63';
  c.fillStyle = selected ? 'rgba(20,38,31,.96)' : 'rgba(10,22,19,.91)'; c.fillRect(x, y, width, height);
  c.strokeStyle = selected ? '#f4d889' : `${accent}99`; c.lineWidth = selected ? 1.5 : 1; c.strokeRect(x, y, width, height);
  c.fillStyle = accent; c.fillRect(x, y, 3, height);
  c.fillStyle = a.emergency ? '#ffaaa0' : '#f3f1df'; c.font = 'bold 13px monospace'; c.fillText(`${a.callsign} · ${a.modelId ?? 'F-16'}`, x + 10, y + 18, width - 18);
  c.fillStyle = '#c5d8cb'; c.font = '11px monospace';
  if (compact) { c.fillText(`${Math.round(a.altitude)} ft`, x + 10, y + 33, width - 18); c.restore(); return; }
  const order = a.airNavigation;
  const navigation = a.altitude > 0
    ? order ? order.mode === 'HEADING' ? `HDG ${String(Math.round(order.heading)).padStart(3, '0')}°` : `${order.fix.id} ${order.mode}` : a.assignedRunway ? `RWY ${a.assignedRunway}` : a.state
    : a.state === 'TAKEOFF_ROLL' || a.state === 'ABORTING_TAKEOFF' ? a.state.replaceAll('_', ' ') : a.assignedRunway ? `${a.state.replaceAll('_', ' ')} · RWY ${a.assignedRunway}` : a.state.replaceAll('_', ' ');
  const vertical = a.altitude > 0 ? `${Math.round(a.altitude).toLocaleString('fr-FR')} ft` : 'SOL';
  c.fillText(`${vertical} · ${navigation}`, x + 10, y + 39, width - 18);
  if (a.tcasAdvisory) { c.fillStyle = a.tcasAdvisory.level === 'RA' ? '#ff8278' : '#f5c46a'; c.font = 'bold 10px monospace'; c.fillText(`TCAS ${a.tcasAdvisory.level} · ${a.tcasAdvisory.callsign}`, x + 10, y + 54, width - 18); }
  c.restore();
}

function updateHud() {
  if (!session) return;
  if (typeof SteeringDebug !== 'undefined') SteeringDebug.syncSession(session);
  if (selectedAirplane && !session.owns(selectedAirplane)) {
    selectedAirplane = visibleAircraft()[0] ?? null;
    selectionSignature = ''; trafficSignature = null;
  }
  const a = selectedAirplane; const mission = scenario.mission.snapshot();
  byId('sim-state').textContent = session.simulation.paused ? 'PAUSE' : 'RUNNING'; byId('step-count').textContent = session.simulation.stepCount;
  byId('mission-status').textContent = scenario.mission.continuous ? 'SESSION LIBRE' : mission.status === 'COMPLETED' ? 'TERMINÉE' : 'MISSION'; byId('mission-score').textContent = mission.score;
  const breakdown = mission.scoreBreakdown;
  byId('mission-score-detail').textContent = `+${breakdown.arrivals * mission.points.arrival + breakdown.departures * mission.points.departure} vols terminés · −${breakdown.collisions * mission.points.collision} crash`;
  byId('mission-timer').textContent = mission.timeRemainingSeconds === null
    ? 'Pas de limite de temps'
    : `Temps restant · ${Math.ceil(mission.timeRemainingSeconds)} s`;
  byId('mission-objectives').textContent = `Arrivées ${mission.completed.arrivals}/${mission.targets.arrivals} · Sorties ${mission.completed.departures}/${mission.targets.departures}`;
  const total = mission.targets.arrivals + mission.targets.departures;
  byId('mission-progress').style.width = `${total ? (mission.completed.arrivals + mission.completed.departures) / total * 100 : 0}%`;
  byId('clearance-status').textContent = session.lastMessage;
  byId('follow-aircraft').classList.toggle('active', view.follow);
  const live = Boolean(a && session.owns(a)); const state = a?.state;
  byId('intercept-button').hidden = !live || !(a?.altitude > 0) || !a.emergency || session.emergencies.assignments.has(a);
  byId('intercept-button').disabled = !live || !(a?.altitude > 0) || !a.emergency || session.emergencies.assignments.has(a) || Boolean(session.aiAtc?.enabled);
  if (a) {
    document.querySelector('.ground-section').hidden = a.altitude > 0 || a.operation === 'HELICOPTER' || !document.querySelector('[data-tab="operations"]').classList.contains('active');
    byId('parking-select').closest('label').hidden = a.operation !== 'ARRIVAL';
    byId('assign-parking-button').hidden = a.operation !== 'ARRIVAL';
    byId('landing-button').hidden = a.operation !== 'ARRIVAL';
    byId('goaround-button').hidden = a.operation !== 'ARRIVAL';
    byId('emergency-button').hidden = a.operation === 'HELICOPTER';
    byId('aircraft-state').textContent = `${a.callsign} · ${a.modelId}`;
    byId('flight-badge').textContent = a.emergency ? a.squawk : state;
    const altitudeText = a.altitude > 0 ? `ALT ${Math.round(a.altitude)} ft${a.assignedAltitude !== a.altitude ? ` / ${a.assignedAltitude} ft` : ''}` : 'SOL';
    byId('aircraft-data').textContent = `${a.model.name}\n${altitudeText} · CAP ${Math.round((a.heading + 90 + 360) % 360)}° · SQK ${a.squawk}${a.tcasAdvisory ? `\nTCAS ${a.tcasAdvisory.level} · ${a.tcasAdvisory.callsign}` : ''}`;
    byId('ground-state').textContent = `${a.callsign} · ${state}`;
    const occupied = a.assignedRunway && session.runwayController.blockedBy(a.assignedRunway, a);
    byId('ground-data').textContent = `Piste ${a.assignedRunway ?? 'à assigner'} · Stand ${a.parkingId ?? '—'}${occupied ? ' · occupée : ' + occupied : ''}${a.trafficHold ? ' · attend ' + a.trafficConflict : ''}`;
    const neural = a.telemetry?.neural;
    byId('steering-data').textContent = `${a.callsign} · ${a.model.name}\nÉtat : ${state}\nPiste : ${a.assignedRunway ?? '—'}\nClairance atterrissage : ${a.landingCleared ? 'oui' : 'non'}\nVitesse : ${a.vel.mag().toFixed(3)} u/pas\nForce : ${a.telemetry?.force?.x.toFixed(4) ?? '0'}, ${a.telemetry?.force?.y.toFixed(4) ?? '0'}\nmaxForce : ${a.maxForce}\nBehaviors : ${(a.telemetry?.behaviors ?? []).join(', ') || 'au repos'}${neural ? `\nIA poids NAV/FREIN/TCAS/MÉTÉO : ${neural.weights.map(value => value.toFixed(2)).join(' / ')}` : ''}\nRoute : ${a.routeIndex}/${a.groundRoute?.length ?? 0}\nILS : ${a.ilsStatus ? 'écart ' + a.ilsStatus.lateral.toFixed(2) : '—'}\nGraine : ${session.generator.seed}`;
    const key = `${a.callsign}|${a.assignedRunway}|${a.modelId}|${a.parkingId ?? ''}|${a.departureExitFix?.id ?? ''}`;
    if (key !== selectionSignature) {
      byId('runway-select').replaceChildren(...session.directions.map(r => {
        const option = document.createElement('option'); option.value = r.id; option.textContent = `${r.id} · ${Math.round(r.lengthMeters)} m`; option.disabled = r.lengthMeters < a.model.minRunway; return option;
      }));
      byId('runway-select').value = a.assignedRunway ?? a.expectedRunway ?? session.runway.id;
      const departureFixSelect = byId('play-exit-select');
      if (a.departureExitFix) departureFixSelect.value = a.departureExitFix.id;
      byId('parking-select').replaceChildren(...[...session.departures.parkings.values()].map(p => {
        const option = document.createElement('option'); option.value = p.id; option.textContent = `${p.id} · ${Math.round(p.maxWingspan)} m`;
        option.disabled = Boolean(p.occupied || (p.reservedFor && p.reservedFor !== a.callsign) || p.maxWingspan < a.model.span); return option;
      }));
      if (a.parkingId) byId('parking-select').value = a.parkingId;
      selectionSignature = key;
    }
  }
  const enable = (id, condition, title) => { byId(id).disabled = !live || !condition || Boolean(session.aiAtc?.enabled); byId(id).title = session.aiAtc?.enabled ? 'Contrôle IA actif — désactivez IA ATC pour reprendre les clairances.' : title ?? ''; };
  enable('assign-runway-button', a?.operation === 'DEPARTURE' && a.altitude === 0 ? ['PARKED', 'READY_TAXI', 'HOLD_SHORT'].includes(state) : ['INBOUND', 'HOLDING', 'VECTORING', 'GO_AROUND', 'NAV_HEADING', 'NAV_DIRECT', 'NAV_HOLD_ENTRY', 'NAV_HOLD', 'AIRBORNE'].includes(state));
  const airborneControl = live && session.airNavigation.canControl(a);
  for (const id of ['heading-button', 'direct-button', 'hold-button']) enable(id, airborneControl);
  enable('altitude-button', airborneControl && !a?.guidance);
  enable('assign-parking-button', a?.operation === 'ARRIVAL' && ['INBOUND', 'HOLDING', 'VECTORING', 'APPROACH', 'FINAL', 'WAITING_TAXI'].includes(state));
  enable('pushback-button', a?.operation === 'DEPARTURE' && state === 'PARKED' && a.assignedRunway);
  enable('taxi-button', ['READY_TAXI', 'WAITING_TAXI'].includes(state), 'Le repoussage ou le dégagement doit être terminé.');
  enable('cross-button', state === 'WAITING_RUNWAY_CROSSING');
  enable('lineup-button', state === 'HOLD_SHORT' && a.vel.mag() < .08);
  const canAssignExit = live && a?.operation === 'DEPARTURE' && ['PARKED', 'READY_TAXI', 'TAXIING', 'HOLD_SHORT', 'LINING_UP', 'LINE_UP_WAIT'].includes(state) && !session.aiAtc?.enabled;
  byId('play-departure-exit').hidden = !(a?.operation === 'DEPARTURE' && ['PARKED', 'READY_TAXI', 'TAXIING', 'HOLD_SHORT', 'LINING_UP', 'LINE_UP_WAIT'].includes(state));
  byId('play-exit-select').disabled = !canAssignExit;
  byId('play-assign-exit').disabled = !canAssignExit;
  byId('play-assign-exit').textContent = a?.departureExitFix ? `SORTIE ${a.departureExitFix.id} ASSIGNÉE · Q` : 'ASSIGNER · Q';
  enable('takeoff-button', state === 'LINE_UP_WAIT' && a.vel.mag() < .09 && Boolean(a.departureExitFix), a?.departureExitFix ? '' : 'Assignez d’abord une sortie du secteur.');
  enable('landing-button', session.canAuthorizeLanding(a) && !a?.landingCleared);
  enable('goaround-button', ['VECTORING', 'APPROACH', 'FINAL'].includes(state)); enable('emergency-button', true);
  enable('cancel-takeoff-button', state === 'TAKEOFF_ROLL');
  enable('return-to-stand-button', state === 'TAKEOFF_ABORTED' && a.vel.mag() < .08);
  enable('retry-takeoff-button', state === 'TAKEOFF_ABORTED' && a.vel.mag() < .08);
  enable('expedite-exit-button', ['ROLL_OUT', 'TAKEOFF_ABORTED'].includes(state) && a.vel.mag() <= Math.max(.95, a.model.taxi * 2.2));
  byId('return-to-stand-button').hidden = state !== 'TAKEOFF_ABORTED';
  byId('retry-takeoff-button').hidden = state !== 'TAKEOFF_ABORTED';
  const active = sectorAircraft();
  byId('traffic-count').textContent = active.length;
  byId('traffic-count').title = `${active.length} vol(s) dans le secteur sur ${session.simulation.entities.filter(e => e instanceof ModelAircraft).length} actifs`;
  const signature = active.map(e => `${e.callsign}|${e.state}|${e.assignedRunway}|${e.emergency?.code ?? ''}|${e.altitude > 0 ? Math.round(e.altitude / 100) : 0}|${e.altitude > 0 ? Math.round(e.heading / 10) : 0}|${e.tcasAdvisory?.level ?? ''}|${e === a}`).join(';');
  if (signature !== trafficSignature) {
    const list = byId('traffic-list'); const scrollTop = list.scrollTop;
    FlightStrips.render(list, active, a);
    list.scrollTop = scrollTop; trafficSignature = signature;
  }
  const log = session.eventLog.slice(0, 3).map(e => `STEP ${e.step} · ${e.message}`).join('   /   ');
  if (byId('event-log').textContent !== log) byId('event-log').textContent = log;
}
