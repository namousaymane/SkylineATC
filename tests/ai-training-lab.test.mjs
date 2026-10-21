import test from 'node:test';
import assert from 'node:assert/strict';
import { towerRuntime, until } from './helpers/towerRuntime.mjs';

const api = towerRuntime();

test('le cadrage du laboratoire reste ancré à la demande initiale malgré le déplacement des vols', () => {
  const e = new api.ATCEpisode({ airport: api.AirportCatalog.SKY1, trafficLevel: 'CALM', weatherMode: 'CLEAR' });
  const initial = JSON.stringify(e.initialPositions);
  for (let i = 0; i < 600; i++) e.step();
  assert.equal(JSON.stringify(e.initialPositions), initial);
  assert.notDeepEqual([e.aircraft[0].pos.x, e.aircraft[0].pos.y], [e.initialPositions[0].x, e.initialPositions[0].y]);
});

test('le laboratoire entraîne, réinitialise et importe des architectures multicouches', () => {
  const lab = new api.AITrainingLab({ airport: api.AirportCatalog.SKY1, hiddenLayers: [16, 8], populationSize: 6, maxSteps: 8, seed: 10, weatherMode: 'CLEAR' });
  assert.equal(lab.baseline.controller.brain, null);
  lab.start(); lab.tick(10); assert.equal(lab.generation, 2);
  assert.ok(lab.agents.every(agent => agent.brain.hiddenLayers.join(',') === '16,8'));
  const saved = lab.exportPayload(); lab.reset(); assert.equal(lab.population[0].hiddenLayers.join(','), '16,8');
  lab.configure({ hiddenLayers: [12, 8, 4], mutationStrength: .3 });
  assert.equal(lab.hasLearnedBrain, false); assert.equal(lab.generation, 1);
  assert.equal(lab.population[0].hiddenLayers.join(','), '12,8,4');
  lab.importBrain(saved); assert.equal(lab.hiddenLayers.join(','), '16,8');
  assert.equal(lab.running, false); lab.start(); lab.tick(10);
  assert.equal(lab.generation, 2); assert.ok(Number.isFinite(lab.report.bestFitness));
});

test('chaque contrôleur possède une session isolée avec demande identique, sans cerveau dans les avions', () => {
  const airport = api.AirportCatalog.SKY1;
  const lab = new api.AITrainingLab({ airport, populationSize: 8, seed: 17, maxSteps: 24 });
  assert.equal(lab.population.length, 8);
  assert.ok(lab.agents.every(item => item.episode.controller.brain === item.brain));
  assert.equal(new Set(lab.agents.map(item => item.episode.session)).size, 8);
  assert.ok(lab.agents.every(item => item.episode.signature === lab.baseline.signature));
  assert.ok(lab.agents.every(item => item.episode.aircraft.every(a => a instanceof api.Vehicle && !('aiBrain' in a))));
  const first = lab.agents[0].episode.aircraft[0]; const start = first.pos.copy();
  lab.start(); lab.tick(30);
  assert.notDeepEqual([first.pos.x, first.pos.y], [start.x, start.y]);
  assert.ok(first.telemetry.behaviors.length > 0);
  assert.equal(lab.generation, 2); assert.equal(lab.history.length, 1);
  assert.equal(lab.report.population, 8); assert.ok(Number.isFinite(lab.report.bestFitness));
  assert.ok(Number.isFinite(lab.report.baselineFitness));
  assert.equal(lab.report.baselineMetrics.requested, lab.report.metrics.requested);
  assert.ok(lab.agents.every(item => item.episode.signature === lab.baseline.signature));
});

test('vitesse, réglages et import/export du cerveau sont validés et utilisables', () => {
  const lab = new api.AITrainingLab({ airport: api.AirportCatalog.SKY1, populationSize: 8, seed: 9, maxSteps: 10 });
  assert.equal(lab.setSpeed(20), 20); assert.throws(() => lab.setSpeed(3), /speed/);
  assert.throws(() => lab.exportBest(), /génération/);
  lab.start(); lab.tick(10); lab.pause();
  const payload = lab.exportPayload();
  const imported = lab.importBrain(payload);
  assert.equal(imported.inputs, 26); assert.equal(imported.outputs, 1); assert.equal(lab.population.length, 8);
  assert.throws(() => lab.importBrain({ format: 'SkylineATC-Brain', version: 1, network: new api.NeuralNetwork().serialize() }), /pilotes/);
  assert.throws(() => lab.importBrain({ ...payload, schema: 'unknown' }), /ATC/);
  lab.configure({ populationSize: 10, mutationRate: .12, elitism: .2 });
  assert.equal(lab.population.length, 10); assert.equal(lab.generation, 1);
  assert.throws(() => lab.configure({ populationSize: 4 }), /between 6 and 64/);
});

test('la validation utilise trois graines inédites, ne reproduit pas les cerveaux et ne valide pas un contrôleur inactif', () => {
  const lab = new api.AITrainingLab({ airport: api.AirportCatalog.SKY1, populationSize: 6, maxSteps: 12, seed: 23 });
  lab.start(); lab.tick(12); const generation = lab.generation;
  const saved = JSON.stringify(lab.exportBest()); lab.startValidation();
  assert.equal(lab.running, false); assert.equal(lab.start(), false);
  lab.tick(36); assert.equal(lab.validating, false); assert.equal(lab.validation.status, 'COMPLETE');
  assert.equal(lab.validation.results.length, 3); assert.equal(new Set(lab.validation.results.map(r => r.seed)).size, 3);
  assert.ok(lab.validation.results.every(r => r.seed !== lab.seed));
  assert.equal(lab.validation.passed, false); assert.equal(lab.generation, generation); assert.equal(JSON.stringify(lab.exportBest()), saved);
});

test('les scores privilégient absolument la sécurité plutôt que le débit et comptent les événements sans doublon', () => {
  const safe = new api.ATCEpisode({ airport: api.AirportCatalog.SKY1, trafficLevel: 'CALM' }); safe.sample();
  const unsafe = new api.ATCEpisode({ airport: api.AirportCatalog.SKY1, trafficLevel: 'CALM' });
  unsafe.aircraft[0].destroyed = true; unsafe.sample(); unsafe.sample();
  assert.equal(unsafe.metrics.collisions, 1); assert.equal(unsafe.metrics.success, false);
  assert.ok(safe.fitness > unsafe.fitness);
  const first = safe.aircraft[0]; first.tcasAdvisory = { level: 'RA' }; safe.sample(); safe.sample();
  assert.equal(safe.metrics.ra, 1); assert.equal(safe.metrics.safe, false);
});

test('le réseau classe réellement les ordres : deux politiques peuvent choisir une clairance ou attendre', () => {
  const e = new api.ATCEpisode({ airport: api.AirportCatalog.SKY1, trafficLevel: 'CALM' });
  const choices = e.controller.candidates(); const warm = api.ATCPolicy.bootstrap([12]);
  assert.equal(api.ATCPolicy.rank(e.controller, choices, warm)[0].type, 'EXIT');
  const wait = api.ATCPolicy.bootstrap([12]); wait.weights[0][0].fill(0); wait.weights[0][0][0] = 3;
  assert.equal(api.ATCPolicy.rank(e.controller, choices, wait)[0].type, 'WAIT');
  e.controller.setBrain(wait); e.step(); assert.equal(e.controller.lastDecision.type, 'WAIT');
  assert.equal(e.aircraft[1].departureExitFix, undefined);
  for (const c of choices) { const values = api.ATCPolicy.inputsFor(e.controller, c); assert.equal(values.length, 26); assert.ok(values.every(v => Number.isFinite(v) && Math.abs(v) <= 1)); }
  assert.throws(() => e.controller.setBrain(new api.NeuralNetwork()), /26 entrées/);
});

test('le contrôleur neuronal prend les clairances normales et termine un cycle arrivée + départ sans incident', () => {
  const brain = api.ATCPolicy.bootstrap([12]);
  const e = new api.ATCEpisode({ airport: api.AirportCatalog.SKY1, trafficLevel: 'CALM', weatherMode: 'CLEAR', seed: 42, brain });
  while (!e.done) e.step();
  assert.equal(e.metrics.success, true, JSON.stringify(e.metrics)); assert.equal(e.metrics.completed, 2);
  assert.equal(e.metrics.ra, 0); assert.equal(e.metrics.collisions, 0); assert.equal(e.metrics.separationLosses, 0);
  assert.ok(e.controller.decisions.some(d => d.type === 'LAND')); assert.ok(e.controller.decisions.some(d => d.type === 'TAKEOFF'));
  const dep = e.aircraft.find(a => a.operation === 'DEPARTURE'); assert.ok(dep.departureExitFix);
});

test('le contrôleur IA prend les clairances d’arrivée et de départ, et s’arrête quand il est désactivé', () => {
  const airport = api.AirportCatalog.SKY1;
  const run = api.ScenarioFactory.create('CALM', { tower: true, airport, runway: airport.runway, parkings: airport.parking, randomTraffic: false, seed: 37 });
  const { session } = run;
  assert.ok(session.aiAtc instanceof api.AIAtcController);
  assert.equal(session.aiAtc.enabled, false);
  session.aiAtc.toggle(true);
  session.aiAtc.beforeStep();
  assert.equal(run.arrivals[0].assignedRunway, null, 'pas d’approche avant l’entrée dans le secteur');
  assert.equal(run.departures[0].departureExitFix?.type, 'EXIT');
  assert.equal(run.departures[0].departureExitFix?.id, 'EXIT-090');
  assert.equal(session.aiAtc.handleDeparture(run.departures[0]), true);
  assert.equal(run.departures[0].state, 'PUSHBACK');
  assert.ok(until(session, () => run.arrivals[0].assignedRunway === run.arrivals[0].expectedRunway, 10000));
  session.aiAtc.toggle(false);
  const state = run.departures[0].state;
  session.aiAtc.beforeStep();
  assert.equal(run.departures[0].state, state);
});

test('le contrôle IA respecte une piste occupée et ne donne pas de clairance d’atterrissage conflictuelle', () => {
  const airport = api.AirportCatalog.SKY1;
  const run = api.ScenarioFactory.create('CALM', { tower: true, airport, runway: airport.runway, parkings: airport.parking, randomTraffic: false, seed: 41 });
  const { session } = run; const arrival = run.arrivals[0]; const blocker = { callsign: 'BLOCKER' };
  arrival.state = 'FINAL'; arrival.assignedRunway = arrival.expectedRunway;
  session.runwayController.reserve(arrival.assignedRunway, blocker);
  session.aiAtc.toggle(true);
  assert.equal(session.aiAtc.handleArrival(arrival), false);
  assert.equal(Boolean(arrival.landingCleared), false);
});

test('l’IA peut mener seule un départ du parking au décollage avec sortie assignée', () => {
  const airport = api.AirportCatalog.SKY1;
  const session = new api.TowerSession({ airport, runway: airport.runway, parkings: airport.parking, randomTraffic: false, seed: 27 });
  const departure = session.createDepartureFromFreeParking(api.ModelAircraft, { callsign: 'AIDEP', modelId: 'B738' });
  session.aiAtc.toggle(true);
  assert.ok(until(session, () => departure.state === 'AIRBORNE', 12000), departure.state);
  assert.equal(departure.departureExitFix?.id, 'EXIT-090');
});

test('l’IA peut conclure une mission calme avec une arrivée et un départ', () => {
  const airport = api.AirportCatalog.SKY1;
  const run = api.ScenarioFactory.create('CALM', { tower: true, airport, runway: airport.runway,
    parkings: airport.parking, randomTraffic: false, gameMode: 'MISSIONS', seed: 42 });
  run.session.aiAtc.toggle(true);
  assert.ok(until(run.session, () => run.mission.status === 'COMPLETED', 45000),
    `${run.arrivals[0].state} / ${run.departures[0].state} / ${JSON.stringify(run.mission.snapshot().completed)}`);
  assert.equal(run.mission.completed.arrivals, 1);
  assert.equal(run.mission.completed.departures, 1);
});
