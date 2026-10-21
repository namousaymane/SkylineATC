import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime, vector } from './helpers/runtime.mjs';

function setup() {
  const api = runtime();
  const simulation = new api.Simulation();
  const runwayController = new api.RunwayController([{ id: '09', x1: 0, y1: 0, x2: 600, y2: 0 }]);
  const traffic = new api.TrafficManager(simulation, runwayController);
  return { ...api, simulation, traffic };
}

test('le trafic prend une photo commune et bloque le taxi sur un conflit', () => {
  const { Airplane, simulation, traffic } = setup();
  const first = traffic.add(new Airplane(0, 0, { callsign: 'A', state: 'TAXIING', altitude: 0 }));
  const second = traffic.add(new Airplane(100, 0, { callsign: 'B', state: 'TAXIING', altitude: 0 }));
  first.path = [{ x: 0, y: 0 }, { x: 50, y: 0 }];
  second.path = [{ x: 100, y: 0 }, { x: 50, y: 0 }];
  const peers = simulation.entities.map(source => ({ source, pos: source.pos.copy(), vel: source.vel.copy(), altitude: source.altitude, callsign: source.callsign }));
  traffic.beforeStep({ peers });
  assert.equal(first.trafficHold, false);
  assert.equal(second.trafficHold, true);
  assert.equal(second.trafficConflict, 'A');
});

test('le départ engagé garde la priorité sur un taxi ordinaire', () => {
  const { Airplane, simulation, traffic } = setup();
  const taxi = traffic.add(new Airplane(0, 0, { callsign: 'TAXI', state: 'TAXIING', altitude: 0 }));
  const lineUp = traffic.add(new Airplane(50, 0, { callsign: 'LINE', state: 'LINE_UP_WAIT', altitude: 0 }));
  taxi.path = [{ x: 0, y: 0 }, { x: 25, y: 0 }];
  lineUp.path = [{ x: 50, y: 0 }, { x: 25, y: 0 }];
  traffic.beforeStep({ peers: simulation.entities.map(source => ({ source, pos: source.pos.copy(), altitude: 0, callsign: source.callsign })) });
  assert.equal(taxi.trafficHold, true);
  assert.equal(lineUp.trafficHold, false);
});

test('les avions terminés sont archivés et retirés de la simulation', () => {
  const { Airplane, simulation, traffic } = setup();
  const parked = traffic.add(new Airplane(0, 0, { callsign: 'PARK', state: 'PARKED' }));
  const airborne = traffic.add(new Airplane(50, 0, { callsign: 'AIR', state: 'AIRBORNE', archiveOnAirborne: true }));
  traffic.afterStep();
  assert.equal(simulation.entities.includes(parked), false);
  assert.equal(simulation.entities.includes(airborne), false);
  assert.equal(traffic.archived.length, 2);
  assert.ok(traffic.archived.every(entry => entry.aircraft));
});

test('la séparation au sol est bornée et reste nulle hors rayon', () => {
  const { Airplane, Separation } = setup();
  const a = new Airplane(0, 0, { state: 'TAXIING', altitude: 0 });
  const b = new Airplane(20, 0, { state: 'TAXIING', altitude: 0 });
  const force = Separation.forceFor(a, [a, b], { radius: 42, verticalThreshold: Infinity });
  assert.ok(force.mag() <= a.maxForce + 1e-9);
  b.pos.set(100, 0);
  assert.equal(Separation.forceFor(a, [a, b], { radius: 42, verticalThreshold: Infinity }).mag(), 0);
});
