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
  assert.equal(mission.mission.continuous, false); assert.equal(mission.session.generator.enabled, false);
  assert.equal(emergency.mission.continuous, false); assert.equal(emergency.session.generator.enabled, false);
});
