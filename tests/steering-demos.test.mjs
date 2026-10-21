import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { towerRuntime, until } from './helpers/towerRuntime.mjs';
const api = towerRuntime();
vm.runInContext(readFileSync(new URL('../core/steeringDemos.js', import.meta.url), 'utf8'), api);

test('les démos sont isolées, en pause, sans trafic aléatoire ni IA ATC', () => {
  const first = api.SteeringDemos.create('TCAS'); const second = api.SteeringDemos.create('TCAS');
  assert.notEqual(first.session, second.session);
  assert.equal(first.session.simulation.paused, true);
  assert.equal(first.session.generator.enabled, false);
  assert.equal(Boolean(first.session.aiAtc?.enabled), false);
  assert.equal(first.mission.continuous, true);
  assert.deepEqual(Array.from(first.demo.aircraft, a => [a.pos.x, a.pos.y, a.altitude]), Array.from(second.demo.aircraft, a => [a.pos.x, a.pos.y, a.altitude]));
  assert.throws(() => api.SteeringDemos.create('UNKNOWN'), /Unknown steering demo/);
});

test('changer de démo puis revenir conserve la session, le trafic et la caméra de la partie', () => {
  const isolated = towerRuntime();
  for (const file of ['core/steeringDemos.js', 'ui/tutorial.js', 'sketch.js']) vm.runInContext(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), isolated);
  const airport = isolated.AirportCatalog.SKY1;
  isolated.original = isolated.ScenarioFactory.create('CALM', { tower: true, airport, runway: airport.runway, parkings: airport.parking, randomTraffic: false });
  isolated.width = 1100; isolated.height = 620;
  isolated.document = { getElementById: () => ({ value: '', hidden: false }), body: { classList: { add() {} } } };
  vm.runInContext(`airport = AirportCatalog.SKY1; scenario = original; session = original.session;
    view = new MapCamera(1100, 620); selectedAirplane = original.arrivals[0];
    gameHud = { tutorial: new Tutorial(), resultShown: false, wasPaused: false };
    refreshDemoControls = () => {}; updateFixDetails = () => {};
    globalThis.savedCamera = view; globalThis.savedSelection = selectedAirplane;`, isolated);
  const before = Array.from(isolated.original.session.simulation.entities, e => [e.callsign, e.pos.x, e.pos.y]);
  isolated.startDebugDemo('TCAS'); isolated.startDebugDemo('STORM');
  assert.equal(isolated.original.session.simulation.paused, true);
  vm.runInContext('session.simulation.paused = false; for (let i = 0; i < 100; i++) session.step();', isolated);
  assert.deepEqual(Array.from(isolated.original.session.simulation.entities, e => [e.callsign, e.pos.x, e.pos.y]), before);
  isolated.stopDebugDemo();
  assert.equal(vm.runInContext('session === original.session && scenario === original', isolated), true);
  assert.equal(vm.runInContext('view === savedCamera && selectedAirplane === savedSelection', isolated), true);
  assert.equal(isolated.original.session.simulation.paused, false);
  assert.equal(isolated.original.session.simulation.lastTime, null);
});

for (const definition of api.SteeringDemos.catalog) {
  test(`démo ${definition.id} : le résultat annoncé est produit par la simulation`, () => {
    const scenario = api.SteeringDemos.create(definition.id); const { session, demo } = scenario;
    session.simulation.paused = false;
    assert.ok(until(session, () => demo.complete, definition.id === 'INTERCEPT' ? 20000 : 10000), `${definition.id}: ${demo.status}; ${demo.aircraft.map(a => `${a.state} @ ${a.pos.x.toFixed(0)},${a.pos.y.toFixed(0)}`).join('; ')}`);
    if (['TCAS', 'ALTITUDE'].includes(definition.id)) {
      assert.ok(demo.observed.has('RA')); assert.ok(demo.observed.has('separation'));
      assert.equal(demo.aircraft.some(a => a.destroyed), false);
    }
    if (definition.id === 'COLLISION') {
      assert.ok(demo.aircraft.every(a => a.destroyed)); assert.ok(demo.observed.has('RA'));
      assert.equal(scenario.mission.scoreBreakdown.collisions, 1);
    }
    if (definition.id === 'STORM') { assert.ok(demo.observed.has('obstacleAvoidance')); assert.ok(demo.minStormDistance >= 80, `${demo.minStormDistance}`); }
    if (definition.id === 'ARRIVAL') { assert.ok(demo.aircraft[0].vel.mag() < .001); assert.ok(demo.observed.has('arrival')); }
    if (definition.id === 'TAXI') { assert.ok(demo.observed.has('pathFollowing')); assert.ok(demo.observed.has('leaderFollowing')); }
    for (const a of demo.aircraft) if (a.telemetry) assert.ok(Math.hypot(a.telemetry.force.x, a.telemetry.force.y) <= a.maxForce + 1e-8);
  });
}
