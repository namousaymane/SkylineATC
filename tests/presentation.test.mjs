import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { runtime } from './helpers/runtime.mjs';
import { towerRuntime } from './helpers/towerRuntime.mjs';

test('balisage des quatre plateformes : coordonnées finies, seuils et feux taxi distincts', () => {
  const api = towerRuntime();
  vm.runInContext(readFileSync(new URL('../ui/airportLighting.js', import.meta.url), 'utf8'), api);
  for (const id of ['CMN', 'RAK', 'NCE', 'JFK']) {
    const airport = api.AirportCatalog[id]; const lights = api.AirportLighting.build(airport);
    assert.ok(lights.length > 100, id);
    assert.ok(lights.every(light => Number.isFinite(light.x) && Number.isFinite(light.y)), id);
    for (const kind of ['runway-edge', 'threshold', 'runway-end', 'taxi-center', 'taxi-edge']) {
      assert.ok(lights.some(light => light.kind === kind), `${id}: ${kind}`);
    }
    const keys = lights.map(light => `${light.kind}:${Math.round(light.x * 2)}:${Math.round(light.y * 2)}`);
    assert.equal(new Set(keys).size, lights.length, `${id}: aucun doublon`);
    assert.equal(api.AirportLighting.build(airport), lights, `${id}: géométrie mise en cache`);
  }
});

test('avions du menu : héritage Vehicle et déplacement par forces bornées', () => {
  const api = runtime();
  vm.runInContext(readFileSync(new URL('../entities/menuAircraft.js', import.meta.url), 'utf8'), api);
  const plane = new api.MenuAircraft(0, 0, { x: 500, y: 70 }, { speed: .8 });
  assert.ok(plane instanceof api.Vehicle);
  for (let i = 0; i < 120; i++) {
    const before = plane.pos.copy(); plane.simulateStep();
    assert.ok(plane.vel.mag() <= plane.maxSpeed + 1e-8);
    assert.ok(Math.hypot(plane.pos.x - before.x, plane.pos.y - before.y) <= plane.maxSpeed + 1e-8);
  }
  assert.ok(plane.pos.x > 50);
});

test('chrono : expiration au dernier pas, pause effective et aucun rattrapage après game over', () => {
  const api = runtime(); const scenario = api.ScenarioFactory.create('CALM');
  const mission = new api.MissionSystem(scenario.session, { timeLimitSteps: 3 });
  const sim = new api.Simulation(); scenario.session.simulation = sim;
  let ticks = 0; sim.add({ simulateStep() { ticks++; } }); sim.addSystem(mission);
  sim.update(0); sim.update(.25);
  assert.equal(mission.status, 'FAILED'); assert.equal(sim.paused, true);
  assert.equal(ticks, 3); assert.equal(sim.stepCount, 3);
  assert.equal(mission.snapshot().timeRemainingSeconds, 0);
  sim.update(.5); assert.equal(ticks, 3); assert.equal(sim.accumulator, 0);
  assert.equal(mission.snapshot().events.at(-1).type, 'TIME_LIMIT');
});
