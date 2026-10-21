import test from 'node:test';
import assert from 'node:assert/strict';
import { towerRuntime, until } from './helpers/towerRuntime.mjs';
const api = towerRuntime();
function setup() { const airport = api.AirportCatalog.SKY1; return new api.TowerSession({ airport, runway: airport.runway, parkings: airport.parking, randomTraffic: false }); }

test('chaque direction possède un repère FINAL à 3 NM sans faux statut de STAR', () => {
  for (const id of ['SKY1', 'CMN', 'RAK', 'NCE', 'JFK']) {
    const airport = api.AirportCatalog[id]; const s = new api.TowerSession({ airport, runway: airport.runway, parkings: airport.parking, randomTraffic: false });
    for (const r of s.directions) {
      const f = s.navPoints.find(f => f.id === `FINAL-${r.id}`);
      assert.equal(f.training, true); assert.equal(f.source, undefined);
      assert.ok(Math.abs(Math.hypot(f.x - r.x1, f.y - r.y1) / ((airport.metersToPixels ?? .2) * 1852) - 3) < 1e-8);
      assert.equal(s.airNavigation.fixes.includes(f), true);
    }
  }
});
for (const lateral of [-80, 80]) test(`arrivée côté opposé ${lateral} : décalage, vent arrière, base et finale stable`, () => {
  const s = setup(); const r = s.direction('09');
  const start = api.RunwayDirections.point(r, r.length + 200, lateral);
  const a = s.spawnInbound({ callsign: `BASE${lateral}`, position: start, modelId: 'B738' });
  assert.equal(s.assignRunway(a, '09'), true);
  assert.equal(s.authorizeLanding(a), false, 'l’avion est encore loin et pas établi sur la finale');
  const g = a.guidance; const route = a.approachRoute;
  assert.equal(route.length, 5);
  assert.ok(Math.abs(g.geometry(route[1]).lateral) >= g.unitsPerNm);
  assert.ok(g.geometry(route[1]).along < -g.approachDistance);
  let crossed = false;
  for (let i = 0; i < 18000 && !s.canAuthorizeLanding(a); i++) {
    s.step(); const p = g.geometry(a.pos);
    if (p.along >= 0 && p.along <= r.length && Math.abs(p.lateral) < r.width / 2) crossed = true;
    assert.ok(a.vel.mag() <= a.maxSpeed + 1e-8);
  }
  assert.equal(crossed, false); assert.equal(a.state, 'APPROACH');
  assert.ok(s.canAuthorizeLanding(a)); assert.equal(s.authorizeLanding(a), true);
  assert.ok(g.geometry(a.pos).along < 0);
  assert.ok((a.vel.x * g.unit.x + a.vel.y * g.unit.y) / a.vel.mag() > .94);
  assert.ok(until(s, () => a.state === 'ROLL_OUT', 6000), a.state);
});
test('ordre altitude progressif, borné et indisponible en approche', () => {
  const s = setup(); const a = s.spawnInbound({ altitude: 2000 });
  assert.equal(s.airNavigation.setAltitude(a, 3250), true);
  assert.equal(a.assignedAltitude, 3500, 'les clairances utilisent des paliers de 500 ft'); s.step(); s.step();
  assert.equal(a.altitude, 2008);
  assert.ok(until(s, () => a.altitude === 3500, 250));
  assert.equal(s.airNavigation.setAltitude(a, NaN), false);
  assert.equal(s.airNavigation.setAltitude(a, 100), false);
  s.assignRunway(a, '09'); assert.equal(s.airNavigation.setAltitude(a, 4000), false);
});
test('orages jouables : Vehicle, obstacles partagés, déplacement par forces et plafond', () => {
  const s = setup(); const a = s.spawnInbound(); a.vel.set(1, 0);
  assert.equal(s.createStormAhead(null), false);
  for (let i = 0; i < 5; i++) assert.equal(s.createStormAhead(a), true);
  assert.equal(s.createStormAhead(a), false);
  const storm = s.weather.storms[0]; const before = storm.pos.copy();
  assert.ok(storm instanceof api.Vehicle); assert.equal(s.simulation.obstacles[0], storm);
  assert.equal(storm.hitboxRadius, storm.radius, 'la zone de collision est une hitbox circulaire dédiée');
  s.step(); s.step(); assert.ok(Math.hypot(storm.pos.x - before.x, storm.pos.y - before.y) > 0);
  assert.ok(storm.vel.mag() <= storm.maxSpeed + 1e-8);
});

test('TCAS tient compte des paliers en cours de changement d’altitude', () => {
  const { Airplane, Separation } = api;
  const own = new Airplane(0, 0, { callsign: 'CLIMB', altitude: 2000, assignedAltitude: 4000 });
  const peer = new Airplane(180, 0, { callsign: 'LEVEL', altitude: 3000, assignedAltitude: 3000 });
  own.vel.set(1, 0); peer.vel.set(-1, 0);
  assert.equal(Separation.verticalGap(own, peer), 0);
  assert.equal(Separation.advisoryFor(own, [own, peer]).level, 'RA');
  assert.ok(Separation.forceFor(own, [own, peer], { radius: 250 }).mag() > 0);
});

test('collision aérienne : les deux appareils sont détruits avec une explosion', () => {
  const s = setup();
  const first = new api.ModelAircraft(550, 310, { callsign: 'COL1', altitude: 3000, state: 'AIRBORNE' });
  const second = new api.ModelAircraft(550, 310, { callsign: 'COL2', altitude: 3000, state: 'AIRBORNE' });
  s.addAircraft(first); s.addAircraft(second); s.step(); s.step();
  assert.equal(first.destroyed, true); assert.equal(second.destroyed, true);
  assert.equal(first.state, 'DESTROYED'); assert.equal(first.explosionTimer, 90);
  assert.match(s.lastMessage, /COLLISION/);
});
