import test from 'node:test';
import assert from 'node:assert/strict';
import { towerRuntime } from './helpers/towerRuntime.mjs';
const api = towerRuntime();
test('Leader Following taxi : force longitudinale bornée, freinage prioritaire', () => {
  const a = new api.ModelAircraft(0, 0, { altitude: 0, state: 'TAXIING' });
  const b = new api.ModelAircraft(16, 0, { altitude: 0, state: 'TAXIING' });
  a.vel.set(.5, 0); b.vel.set(.2, 0); a.taxiLeader = b;
  const force = a.buildSteering({ peers: [] }).find(f => f.name === 'leaderFollowing');
  assert.ok(force); assert.ok(Math.abs(force.force.y) < 1e-12); assert.ok(force.force.mag() <= a.maxForce);
  a.trafficHold = true; assert.equal(a.buildSteering()[0].name, 'trafficHold');
  assert.equal(a.buildSteering().length, 1);
});
test('file taxi : leader devant sur le même axe, ni trafic inverse ni avion en vol', () => {
  const airport = api.AirportCatalog.SKY1;
  const s = new api.TowerSession({ airport, runway: airport.runway, parkings: airport.parking, randomTraffic: false });
  const a = new api.ModelAircraft(0, 0, { altitude: 0, state: 'TAXIING' });
  const b = new api.ModelAircraft(30, 0, { altitude: 0, state: 'TAXIING' });
  a.vel.set(.5, 0); b.vel.set(.4, 0); a.groundRoute = [{ x: 100, y: 0 }]; b.groundRoute = [{ x: 100, y: 0 }];
  s.addAircraft(a); s.addAircraft(b); s.beforeOperations(); assert.equal(a.taxiLeader, b); assert.equal(b.taxiLeader, null);
  b.vel.set(-.4, 0); s.beforeOperations(); assert.equal(a.taxiLeader, null);
  b.vel.set(.4, 0); b.altitude = 1000; s.beforeOperations(); assert.equal(a.taxiLeader, null);
});
