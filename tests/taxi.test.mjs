import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime } from './helpers/runtime.mjs';

test('un avion arrêté quitte la piste, roule par forces et atteint le parking', () => {
  const { Airplane, RunwayController, TaxiController } = runtime();
  const runway = { id: '09', x1: 0, y1: 0, x2: 600, y2: 0, width: 46 };
  const runways = new RunwayController([runway]);
  const taxi = new TaxiController(runways);
  const aircraft = new Airplane(420, 0, { state: 'STOPPED', maxSpeed: 1.2, groundSpeed: 1.1 });
  aircraft.guidance = { runway };
  assert.equal(runways.reserve('09', aircraft), true);
  const route = [{ x: 420, y: 0 }, { x: 420, y: -130 }, { x: 300, y: -130 }, { x: 300, y: -210 }];
  assert.equal(taxi.assignParking(aircraft, route, 'P1'), true);
  assert.equal(runways.owns('09', aircraft), false);
  for (let frame = 0; frame < 3000 && aircraft.state !== 'PARKED'; frame++) {
    const before = aircraft.pos.copy();
    aircraft.simulateStep();
    taxi.updateAircraft(aircraft);
    assert.ok(Number.isFinite(aircraft.pos.x) && Number.isFinite(aircraft.pos.y));
    assert.ok(Math.hypot(aircraft.pos.x - before.x, aircraft.pos.y - before.y) < 1.5);
  }
  assert.equal(aircraft.state, 'PARKED');
  assert.equal(aircraft.parkingId, 'P1');
  assert.ok(Math.hypot(aircraft.pos.x - 300, aircraft.pos.y + 210) <= 8);
});

test('le taxi refuse une route invalide et un avion encore en roulage', () => {
  const { Airplane, RunwayController, TaxiController } = runtime();
  const taxi = new TaxiController(new RunwayController([]));
  const aircraft = new Airplane(0, 0, { state: 'ROLL_OUT' });
  assert.equal(taxi.assignParking(aircraft, [{ x: 0, y: 0 }], 'P1'), false);
  aircraft.state = 'STOPPED';
  assert.equal(taxi.assignParking(aircraft, [{ x: 0, y: 0 }, { x: NaN, y: 2 }], 'P1'), false);
});
