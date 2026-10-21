import test from 'node:test';
import assert from 'node:assert/strict';
import { towerRuntime, until } from './helpers/towerRuntime.mjs';
const api = towerRuntime();
function setup() {
  const airport = api.AirportCatalog.SKY1;
  const s = new api.TowerSession({ airport, runway: airport.runway, parkings: airport.parking, seed: 45, randomTraffic: false });
  const a = s.spawnInbound({ callsign: 'NAV1', modelId: 'B738', position: { x: 550, y: 310 }, altitude: 2000 });
  return { s, a };
}

test('cap vrai : nord 000°, est 090°, sud 180°, ouest 270°', () => {
  for (const [x, y, heading] of [[0, -10, 0], [10, 0, 90], [0, 10, 180], [-10, 0, 270]]) assert.equal(api.AirNavigation.heading({ x: 0, y: 0 }, { x, y }), heading);
});

test('les sorties du secteur sont réparties sur la limite 80 NM et suivent les caps vrais', () => {
  const airport = api.AirportCatalog.SKY1;
  const exits = api.NavigationCatalog.forAirport(airport).filter(fix => fix.type === 'EXIT');
  const units = (airport.metersToPixels ?? .2) * 1852;
  assert.equal(exits.length, 8);
  for (const fix of exits) {
    assert.ok(Math.abs(Math.hypot(fix.x - 550, fix.y - 310) / units - 72) < 1e-8);
    assert.equal(fix.training, true);
  }
});

test('un cap est assigné sans téléportation et suivi par des forces bornées', () => {
  const { s, a } = setup(); const origin = a.pos.copy();
  assert.equal(s.airNavigation.setHeading(a, 90), true);
  assert.equal(a.pos.x, origin.x); assert.equal(a.pos.y, origin.y);
  for (let i = 0; i < 180; i++) {
    s.step(); assert.ok(a.vel.mag() <= a.maxSpeed + 1e-9);
    if (a.telemetry) assert.ok(Math.hypot(a.telemetry.force.x, a.telemetry.force.y) <= a.maxForce + 1e-9);
  }
  assert.ok(a.pos.x > origin.x + 100); assert.ok(Math.abs(a.pos.y - origin.y) < .01);
  assert.ok(a.telemetry.behaviors.includes('flightTurn'));
  assert.equal(a.altitude, 2000);
});

test('direct au point : capture puis poursuite du cap, sans arrêt en vol', () => {
  const { s, a } = setup(); const fix = s.navPoints.find(f => f.id === 'TRN-E');
  assert.equal(s.airNavigation.direct(a, fix.id), true);
  assert.ok(until(s, () => a.state === 'NAV_HEADING', 7000), a.state);
  assert.ok(a.vel.mag() > .5); assert.ok(Math.abs(a.pos.x - fix.x) < 15);
});

for (const turn of ['RIGHT', 'LEFT']) {
  test(`holding ${turn} : entrée au point, tours fermés, sortie par un nouveau cap`, () => {
    const { s, a } = setup(); const fix = s.navPoints[0];
    assert.equal(s.airNavigation.direct(a, fix.id, { hold: true, inbound: 45, turn, radiusNm: .3, legNm: 1 }), true);
    assert.ok(until(s, () => a.state === 'NAV_HOLD', 6500), a.state);
    const hold = a.airNavigation.holding;
    assert.deepEqual(hold.points[0], hold.points.at(-1));
    assert.ok(until(s, () => hold.laps >= 2, 9000), `laps ${hold.laps}`);
    assert.ok(Math.hypot(a.pos.x - fix.x, a.pos.y - fix.y) < hold.leg + hold.radius * 3);
    const position = a.pos.copy();
    assert.equal(s.airNavigation.setHeading(a, 270), true);
    assert.equal(a.pos.x, position.x); assert.equal(a.pos.y, position.y);
    assert.equal(a.airNavigation.mode, 'HEADING');
    assert.equal(a.airNavigation.holding, undefined);
  });
}

test('une nouvelle approche remplace le holding et les ordres invalides ne changent pas le vol', () => {
  const { s, a } = setup();
  assert.equal(s.airNavigation.direct(a, 'UNKNOWN'), false);
  assert.equal(s.airNavigation.setHeading(a, NaN), false);
  assert.equal(s.airNavigation.direct(a, s.navPoints[0].id, { hold: true }), true);
  assert.equal(s.assignRunway(a, '09'), true);
  assert.equal(a.airNavigation, null); assert.equal(a.state, 'VECTORING');
  assert.equal(s.authorizeLanding(a), false, 'une clairance ne peut pas être donnée depuis le vecteur initial');
  assert.ok(until(s, () => s.canAuthorizeLanding(a), 18000), `finale indisponible en ${a.state}`);
  assert.equal(s.authorizeLanding(a), true);
  assert.equal(s.airNavigation.setHeading(a, 180), false, 'une approche établie exige une remise des gaz explicite');
  assert.equal(s.goAround(a), true);
  assert.equal(s.airNavigation.setHeading(a, 180), true);
  assert.equal(s.runwayController.owns('09', a), false); assert.equal(a.guidance, null);
  a.altitude = 0;
  assert.equal(s.airNavigation.setHeading(a, 90), false);
});

test('les positions publiées sont projetées dans le même repère WGS84 que les pistes', () => {
  assert.ok(Math.abs(api.NavigationCatalog.dms('403143.69N') - 40.5288027778) < 1e-8);
  assert.throws(() => api.NavigationCatalog.dms('436000N'));
  for (const id of ['CMN', 'RAK', 'NCE', 'JFK']) {
    const airport = api.AirportCatalog[id]; const fixes = api.NavigationCatalog.forAirport(airport).filter(fix => !fix.training);
    assert.ok(fixes.length >= 4);
    for (const f of fixes) { const projected = airport.project([f.lon, f.lat]); assert.ok(f.source.startsWith('https://')); assert.equal(projected.x, f.x); assert.equal(projected.y, f.y); assert.equal(f.training, false); }
  }
});
