import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { runtime } from './helpers/runtime.mjs';

test('H145 décolle et rejoint sa station par forces sans téléportation', () => {
  const api = runtime();
  for (const file of ['core/flightSteering.js', 'entities/aircraftModels.js', 'entities/modelAircraft.js', 'entities/helicopter.js']) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    vm.runInContext(source, api);
  }
  const helicopter = new api.Helicopter(0, 0, { callsign: 'MED01', heliPad: { x: 0, y: 0 } });
  const Vehicle = api.Vehicle;
  assert.ok(helicopter instanceof Vehicle);
  assert.equal(helicopter.takeOff(), true);
  assert.equal(helicopter.pos.x, 0);
  helicopter.target = { x: 70, y: -30 }; helicopter.arrivalTarget = false; helicopter.state = 'NAV_DIRECT';
  let moved = false;
  for (let frame = 0; frame < 180; frame += 1) {
    const before = helicopter.pos.copy(); helicopter.simulateStep();
    const distance = Math.hypot(helicopter.pos.x - before.x, helicopter.pos.y - before.y);
    assert.ok(distance <= helicopter.maxSpeed + 1e-9);
    assert.ok(helicopter.vel.mag() <= helicopter.maxSpeed + 1e-9);
    moved ||= distance > 0;
  }
  assert.equal(moved, true);
  assert.equal(helicopter.returnToPad(), true);
  assert.equal(helicopter.state, 'HELI_RETURN');
  assert.ok(helicopter.pos.x > 1);
});
