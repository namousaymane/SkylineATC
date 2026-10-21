import test from 'node:test';
import assert from 'node:assert/strict';
import { towerRuntime, until } from './helpers/towerRuntime.mjs';
const api = towerRuntime();
const make = seed => { const airport = api.AirportCatalog.SKY1; return new api.TowerSession({ airport, runway: airport.runway, parkings: airport.parking, seed }); };
const snapshot = s => Array.from(s.arrivals, a => [a.callsign, a.modelId, a.pos.x, a.pos.y, a.altitude, a.expectedRunway]);

test('le trafic est varié, unique, reproductible par graine et différent avec une autre graine', () => {
  const a = make(123); const b = make(123); const c = make(987);
  for (let i = 0; i < 20; i++) { a.generator.spawnArrival(); b.generator.spawnArrival(); c.generator.spawnArrival(); }
  assert.deepEqual(snapshot(a), snapshot(b));
  assert.notDeepEqual(snapshot(a), snapshot(c));
  assert.equal(new Set(a.arrivals.map(e => e.callsign)).size, 20);
  assert.equal(new Set(a.arrivals.map(e => e.modelId)).size, 3);
  assert.ok(new Set(a.arrivals.map(e => e.expectedRunway)).size > 1);
});

test('les entrants apparaissent près du bord et leurs caps sont variés, entrants et reproductibles', () => {
  const first = make(2026); const replay = make(2026);
  const a = Array.from({ length: 12 }, () => first.generator.spawnArrival());
  const b = Array.from({ length: 12 }, () => replay.generator.spawnArrival());
  const center = first.airport.center; const units = (first.airport.metersToPixels ?? .2) * 1852;
  const radii = a.map(plane => Math.hypot(plane.pos.x - center.x, plane.pos.y - center.y) / units);
  assert.ok(radii.every(radius => radius >= 71 && radius <= 79));
  const bearings = a.map(plane => Math.round(Math.atan2(plane.pos.x - center.x, center.y - plane.pos.y) * 180 / Math.PI));
  const courses = a.map(plane => Math.round(Math.atan2(plane.inboundTrack.x, -plane.inboundTrack.y) * 180 / Math.PI));
  assert.ok(new Set(bearings).size >= 8); assert.ok(new Set(courses).size >= 8);
  for (let index = 0; index < a.length; index++) {
    assert.equal(a[index].pos.x, b[index].pos.x); assert.equal(a[index].pos.y, b[index].pos.y);
    assert.deepEqual({ ...a[index].inboundTrack }, { ...b[index].inboundTrack });
  }
});

test('Wander dévie légèrement les entrants non contrôlés et disparaît après une clairance de cap', () => {
  const s = make(314); const a = s.generator.spawnArrival(); const before = a.wanderTheta;
  assert.ok(a.buildSteering({ peers: [] }).some(force => force.name === 'wander'));
  assert.notEqual(a.wanderTheta, before);
  s.airNavigation.setHeading(a, 90);
  assert.ok(!a.buildSteering({ peers: [] }).some(force => force.name === 'wander'));
});

test('pause, activation et plafond du trafic sont respectés', () => {
  const s = make(9); s.generator.nextStep = 2;
  s.simulation.paused = true; for (let i = 0; i < 100; i++) s.step();
  assert.equal(s.generator.created, 0);
  s.simulation.paused = false; until(s, () => s.generator.created > 0, 20);
  assert.equal(s.generator.created, 1);
  s.generator.enabled = false; s.generator.nextStep = 0;
  for (let i = 0; i < 60; i++) s.step();
  assert.equal(s.generator.created, 1);
  s.generator.enabled = true; s.generator.maxActive = 0; s.generator.nextStep = 0; s.step();
  assert.equal(s.generator.created, 1);
});

test('B737, B787 et A380 ont des proportions et performances différentes', () => {
  const planes = Object.keys(api.AircraftModels).map(modelId => new api.ModelAircraft(0, 0, { modelId }));
  assert.ok(planes.every(p => p instanceof api.Vehicle));
  assert.equal(planes[0].model.engines, 2); assert.equal(planes[2].model.engines, 4);
  assert.ok(planes[0].model.span < planes[1].model.span && planes[1].model.span < planes[2].model.span);
  assert.ok(planes[0].groundSpeed > planes[2].groundSpeed);
  assert.ok(planes[2].model.doubleDeck);
});

test('un stand réservé est exclusif et refuse un appareil trop large', () => {
  const s = make(17); const a = s.generator.spawnArrival(); const b = s.generator.spawnArrival();
  a.model = api.AircraftModels.B738; b.model = api.AircraftModels.A388;
  const stand = [...s.departures.parkings.values()][0]; stand.maxWingspan = 40;
  assert.equal(s.assignParking(a, stand.id), true);
  assert.equal(s.assignParking(b, stand.id), false);
  stand.reservedFor = null;
  assert.equal(s.assignParking(b, stand.id), false);
});
