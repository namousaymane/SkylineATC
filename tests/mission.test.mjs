import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime } from './helpers/runtime.mjs';
import { towerRuntime } from './helpers/towerRuntime.mjs';

test('un scénario crée une mission avec objectifs et score', () => {
  const context = runtime();
  const scenario = context.ScenarioFactory.create('CALM');
  const snapshot = scenario.mission.snapshot();
  assert.equal(snapshot.status, 'RUNNING');
  assert.equal(snapshot.score, 1000);
  assert.equal(snapshot.targets.arrivals, 1);
  assert.equal(snapshot.targets.departures, 1);
  assert.deepEqual({ ...snapshot.scoreBreakdown }, { arrivals: 0, departures: 0, collisions: 0 });
});

test('une mission comptabilise une arrivée garée', () => {
  const context = runtime();
  const scenario = context.ScenarioFactory.create('CALM');
  const arrival = scenario.arrivals[0];
  arrival.state = 'PARKED';
  scenario.mission.afterStep();
  assert.equal(scenario.mission.completed.arrivals, 1);
  assert.equal(scenario.mission.score, 1250);
  assert.equal(scenario.mission.events[0].type, 'ARRIVAL_COMPLETE');
});

test('l’entraînement libre démarre à zéro et crédite les vols à +100', () => {
  const context = runtime(); const scenario = context.ScenarioFactory.create('CALM');
  const mission = new context.MissionSystem(scenario.session, {
    startingScore: 0, continuous: true, arrivals: 1, departures: 0,
    points: { arrival: 100, departure: 100, collision: 500 }
  });
  assert.equal(mission.score, 0);
  scenario.arrivals[0].state = 'PARKED'; mission.afterStep();
  assert.equal(mission.score, 100);
  assert.equal(mission.snapshot().points.arrival, 100);
  assert.equal(mission.snapshot().points.departure, 100);
  assert.equal(mission.snapshot().points.collision, 500);
});

test('une urgence aléatoire est reproductible et le temps limite termine la mission', () => {
  const context = runtime();
  assert.equal(context.ScenarioFactory.resolveId('RANDOM_EMERGENCY', 0), 'ENGINE_FAILURE');
  assert.equal(context.ScenarioFactory.resolveId('RANDOM_EMERGENCY', 2), 'HIJACK');
  const randomEmergency = context.ScenarioFactory.create('RANDOM_EMERGENCY');
  assert.equal(randomEmergency.id, 'RANDOM_EMERGENCY');
  assert.ok(randomEmergency.arrivals[0].emergency);
  const mission = new context.MissionSystem(randomEmergency.session, { timeLimitSteps: 1 });
  mission.beforeStep();
  randomEmergency.session.simulation.stepCount = 1;
  mission.beforeStep();
  assert.equal(mission.status, 'FAILED');
  assert.equal(mission.snapshot().events.at(-1).type, 'TIME_LIMIT');
});

test('un départ avec sortie EXIT n’est crédité qu’après avoir quitté le secteur', () => {
  const context = runtime(); const scenario = context.ScenarioFactory.create('CALM');
  const departure = scenario.departures[0]; departure.state = 'AIRBORNE'; departure.departureExitFix = { id: 'EXIT-N' };
  scenario.mission.afterStep(); assert.equal(scenario.mission.completed.departures, 0);
  scenario.session.traffic = { archived: [{ aircraft: departure }] };
  scenario.mission.afterStep(); assert.equal(scenario.mission.completed.departures, 1);
  assert.equal(scenario.mission.scoreBreakdown.departures, 1);
});

test('les modes libres gardent le trafic continu, les missions et urgences sont finies', () => {
  const api = towerRuntime(); const airport = api.AirportCatalog.SKY1;
  const options = { tower: true, airport, runway: airport.runway, parkings: airport.parking, randomTraffic: true, seed: 31 };
  const free = api.ScenarioFactory.create('CALM', { ...options, gameMode: 'FREE' });
  const mission = api.ScenarioFactory.create('PEAK_HOUR', { ...options, gameMode: 'MISSIONS' });
  const emergency = api.ScenarioFactory.create('ENGINE_FAILURE', { ...options, gameMode: 'EMERGENCY' });
  assert.equal(free.mission.continuous, true); assert.equal(free.session.generator.enabled, true);
  assert.equal(free.mission.score, 0); assert.equal(free.mission.points.arrival, 100);
  assert.equal(free.mission.points.departure, 100); assert.equal(free.mission.points.collision, 500);
  assert.equal(mission.mission.continuous, false); assert.equal(mission.session.generator.enabled, false);
  assert.equal(emergency.mission.continuous, false); assert.equal(emergency.session.generator.enabled, false);
  assert.equal(mission.mission.timeLimitSteps, 0); assert.equal(emergency.mission.snapshot().timeRemainingSeconds, 180);
  const units = (airport.metersToPixels ?? .2) * 1852;
  const arrival = emergency.arrivals[0];
  const runway = emergency.session.direction(arrival.expectedRunway);
  assert.ok(Math.hypot(arrival.pos.x - runway.x1, arrival.pos.y - runway.y1) < 9 * units,
    'l’urgence chronométrée commence à portée d’approche');
});

test('score libre : une récompense par vol, une pénalité par collision, puis la partie continue', () => {
  const api = runtime(); const scenario = api.ScenarioFactory.create('CALM');
  const mission = new api.MissionSystem(scenario.session, { startingScore: 0, continuous: true,
    points: { arrival: 100, departure: 100, collision: 500 } });
  const arrival = scenario.arrivals[0]; const departure = scenario.departures[0];
  departure.departureExitFix = { id: 'EXIT-090' }; departure.state = 'AIRBORNE';
  mission.afterStep(); assert.equal(mission.score, 0);
  scenario.session.traffic = { archived: [{ aircraft: departure, reason: 'AIRBORNE' }] };
  arrival.state = 'PARKED'; mission.afterStep(); mission.afterStep();
  assert.equal(mission.score, 200);
  mission.registerCollision(arrival, departure); mission.registerCollision(departure, arrival);
  assert.equal(mission.score, -300); assert.equal(mission.scoreBreakdown.collisions, 1);
  assert.equal(mission.status, 'RUNNING');
});
