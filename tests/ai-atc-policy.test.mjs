import test from 'node:test';
import assert from 'node:assert/strict';
import { towerRuntime } from './helpers/towerRuntime.mjs';
const api = towerRuntime();
const options = { airport: api.AirportCatalog.SKY1, trafficLevel: 'CALM', weatherMode: 'CLEAR', seed: 42 };

test('le masque interdit alignement, décollage et atterrissage sur une piste occupée', () => {
  const e = new api.ATCEpisode(options); const dep = e.aircraft[1]; const arr = e.aircraft[0];
  dep.state = 'HOLD_SHORT'; dep.vel.set(0, 0);
  e.session.assignRunway(arr, arr.expectedRunway);
  e.session.runwayController.reserve(dep.assignedRunway, { callsign: 'BLOCK' });
  assert.ok(!e.controller.candidates().some(c => ['LINEUP', 'TAKEOFF', 'LAND'].includes(c.type)));
  dep.state = 'LINE_UP_WAIT'; assert.ok(!e.controller.candidates().some(c => c.type === 'TAKEOFF'));
});

test('une approche proche interdit l’alignement et le taxi de départ', () => {
  const e = new api.ATCEpisode(options); const dep = e.aircraft[1]; const arr = e.aircraft[0];
  e.controller.enabled = false; e.session.assignRunway(arr, arr.expectedRunway);
  for (let i = 0; i < 180; i++) e.step(); // enter the protected final corridor through normal locomotion
  dep.vel.set(0, 0);
  dep.state = 'HOLD_SHORT'; assert.ok(!e.controller.candidates().some(c => c.type === 'LINEUP'));
  dep.state = 'READY_TAXI'; assert.ok(!e.controller.candidates().some(c => c.type === 'TAXI' && c.aircraft === dep));
});

test('le contrôleur propose une séparation verticale prédictive avant une RA', () => {
  const e = new api.ATCEpisode(options); const s = e.session;
  const r = e.runway; const p = api.RunwayDirections.point(r, -2000, 2000);
  const a = s.spawnInbound({ callsign: 'CONFLICT-A', position: p, altitude: 4000, wanderEnabled: false });
  const b = s.spawnInbound({ callsign: 'CONFLICT-B', position: { x: p.x + 400, y: p.y }, altitude: 4000, wanderEnabled: false });
  a.vel.set(1, 0); b.vel.set(-1, 0);
  const choices = e.controller.candidates().filter(c => c.type === 'ALTITUDE' && c.aircraft === a);
  assert.ok(choices.length); assert.equal(a.tcasAdvisory, null);
  assert.equal(e.controller.execute(choices[0]), true); assert.ok(Math.abs(a.assignedAltitude - b.altitude) >= 1000);
});

test('la météo physique se rejoue à l’identique dans les sessions isolées', () => {
  const first = new api.ATCEpisode({ ...options, weatherMode: 'STORM' });
  const second = new api.ATCEpisode({ ...options, weatherMode: 'STORM' });
  for (let i = 0; i < 180; i++) { first.step(); second.step(); }
  const a = first.session.weather.storms[0]; const b = second.session.weather.storms[0];
  assert.deepEqual([a.pos.x, a.pos.y, a.vel.x, a.vel.y], [b.pos.x, b.pos.y, b.vel.x, b.vel.y]);
});

test('un stand libéré administrativement reste indisponible si un départ repousse devant lui', () => {
  const e = new api.ATCEpisode(options); const dep = e.aircraft[1];
  e.session.authorizePushback(dep);
  for (let i = 0; i < 150; i++) e.step();
  const free = e.session.findFreeParking(dep.model);
  assert.notEqual(free?.id, dep.parkingId);
});

test('trois scénarios inédits peuvent réellement valider un contrôleur traitant quatre mouvements sans incident', () => {
  const lab = new api.AITrainingLab({ airport: api.AirportCatalog.SKY1, seed: 2026, weatherMode: 'CLEAR' });
  lab.importBrain({ format: 'SkylineATC-Controller', version: 1, schema: api.ATCPolicy.SCHEMA, network: api.ATCPolicy.bootstrap([12]).serialize() });
  lab.startValidation(); while (lab.validating) lab.tick(1000);
  assert.equal(lab.validation.passed, true, JSON.stringify(lab.validation.results));
  assert.ok(lab.validation.results.every(r => r.metrics.completed === 4 && r.metrics.safe));
});
