import test from 'node:test';
import assert from 'node:assert/strict';
import { towerRuntime, until } from './helpers/towerRuntime.mjs';
const api = towerRuntime();
const setup = () => { const airport = api.AirportCatalog.SKY1; return new api.TowerSession({ airport, runway: airport.runway, parkings: airport.parking, randomTraffic: false }); };
function flight(session, callsign, x, y, altitude = 3000) {
  const a = new api.ModelAircraft(x, y, { callsign, altitude, state: 'NAV_HEADING', operation: 'ARRIVAL' });
  a.wanderEnabled = false; session.addAircraft(a); return a;
}

test('TCAS frontal : alertes RA réciproques, force latérale et aucune collision', () => {
  const s = setup(); const a = flight(s, 'FRONT1', 300, -400); const b = flight(s, 'FRONT2', 700, -400);
  a.vel.set(a.maxSpeed, 0); b.vel.set(-b.maxSpeed, 0);
  s.airNavigation.setHeading(a, 90); s.airNavigation.setHeading(b, 270);
  let alerts = false; let lateral = false;
  for (let i = 0; i < 450; i++) {
    s.step();
    alerts ||= a.tcasAdvisory?.level === 'RA' && b.tcasAdvisory?.level === 'RA';
    lateral ||= Math.abs(a.telemetry?.force.y ?? 0) > .00001;
    assert.equal(a.destroyed || b.destroyed, false);
    assert.ok(a.vel.mag() >= a.model.cruise * .65 - 1e-8);
  }
  assert.ok(alerts); assert.ok(lateral);
});

test('les trajectoires verticales ne sont pas des collisions physiques', () => {
  const s = setup(); const a = flight(s, 'HIGH', 500, -400, 2000); const b = flight(s, 'LOW', 500, -400, 4000);
  a.assignedAltitude = 5000; a.altitudeOrderActive = true;
  s.resolveAirCollisions();
  assert.equal(api.Separation.verticalGap(a, b), 0);
  assert.equal(a.destroyed || b.destroyed, false);
});

test('collision balayée entre deux pas : destruction, une pénalité, libération et disparition', () => {
  const s = setup(); const a = flight(s, 'SWEPT1', 600, -400); const b = flight(s, 'SWEPT2', 400, -400);
  s.mission = new api.MissionSystem(s, { continuous: true });
  const peers = [
    { source: a, pos: api.createVector(400, -400), altitude: 3000 },
    { source: b, pos: api.createVector(600, -400), altitude: 3000 }
  ];
  s.runwayController.reserve('09', a); a.assignedRunway = '09';
  s.resolveAirCollisions({ peers });
  assert.ok(a.destroyed && b.destroyed); assert.ok(a.explosionTimer > 0);
  assert.equal(s.runwayController.owns('09', a), false);
  assert.equal(s.owns(a), false);
  assert.equal(s.mission.scoreBreakdown.collisions, 1);
  s.resolveAirCollisions({ peers }); assert.equal(s.mission.scoreBreakdown.collisions, 1);
  assert.ok(until(s, () => !s.simulation.entities.includes(a), 150));
});

test('même altitude et contact au sol : collision ; mission limitée en échec', () => {
  const s = setup(); const a = flight(s, 'CONTACT1', 500, -400, 0); const b = flight(s, 'CONTACT2', 500, -400, 0);
  a.state = 'TAXIING'; b.state = 'TAXIING'; s.mission = new api.MissionSystem(s, { continuous: false });
  s.resolveAirCollisions(); assert.ok(a.destroyed && b.destroyed); assert.equal(s.mission.status, 'FAILED');
});

test('tous les guidages aériens bornent le virage sans arrêter le vol', () => {
  for (const state of ['INBOUND', 'VECTORING', 'NAV_HOLD', 'GO_AROUND']) {
    const a = new api.ModelAircraft(0, 0, { callsign: state, altitude: 3000, state });
    a.vel.set(a.maxSpeed, 0); a.target = { x: -1000, y: 0 };
    for (let i = 0; i < 50; i++) {
      const previous = a.vel.copy(); a.simulateStep({ peers: [] });
      const delta = Math.abs(Math.atan2(previous.x * a.vel.y - previous.y * a.vel.x, previous.x * a.vel.x + previous.y * a.vel.y));
      assert.ok(delta <= api.FlightSteering.turnRate(a) + 1e-8);
      assert.ok(a.vel.mag() > a.model.cruise * .64);
    }
  }
});

test('un cap conserve la clairance verticale ; une finale exige une remise des gaz', () => {
  const s = setup(); const a = flight(s, 'ORDERS', 500, -400, 2000);
  assert.equal(s.airNavigation.setAltitude(a, 4000), true);
  assert.equal(s.airNavigation.setHeading(a, 180), true); assert.equal(a.assignedAltitude, 4000);
  a.state = 'FINAL'; assert.equal(s.airNavigation.setHeading(a, 90), false);
  a.state = 'NAV_HEADING'; a.tcasAdvisory = { level: 'RA' };
  assert.equal(s.airNavigation.setAltitude(a, 5000), false);
});

test('escorte militaire : seek/pursuit, aucun TCAS avec le civil, suivi latéral puis sortie finale', () => {
  const s = setup(); const civil = flight(s, 'ESCORT1', 500, -400); civil.vel.set(1.35, 0);
  civil.declareEmergency('7600');
  const fighter = new api.FighterJet(100, -350, { callsign: 'MILTEST', altitude: 3000 }); fighter.vel.set(2, 0);
  s.simulation.add(fighter); assert.equal(s.emergencies.intercept(civil, fighter), true);
  assert.equal(api.Separation.advisoryFor(civil, [fighter]), null);
  assert.equal(api.Separation.forceFor(civil, [fighter], { airborneOnly: true }).mag(), 0);
  assert.ok(fighter.buildSteering({ peers: [civil] }).some(f => f.name === 'seek'));
  for (let i = 0; i < 1500 && fighter.mission !== 'ESCORT'; i++) {
    civil.simulateStep({ peers: [] }); fighter.simulateStep({ peers: [civil] });
  }
  assert.equal(fighter.mission, 'ESCORT');
  assert.ok(fighter.buildSteering({ peers: [civil] }).some(f => f.name === 'leaderFollowing'));
  for (let i = 0; i < 500; i++) { civil.simulateStep({ peers: [] }); fighter.simulateStep({ peers: [civil] }); }
  assert.ok(Math.hypot(fighter.pos.x - fighter.escortSlot.x, fighter.pos.y - fighter.escortSlot.y) < 80);
  civil.state = 'FINAL'; s.emergencies.beforeStep();
  assert.equal(fighter.mission, 'EXIT'); assert.equal(fighter.interceptTarget, null);
  assert.equal(s.emergencies.assignments.has(civil), false); assert.equal(civil.escortPartner, null);
  assert.equal(fighter.exitTarget.type, 'EXIT');
  const altitude = fighter.altitude; fighter.simulateStep({ peers: [] }); assert.ok(fighter.altitude > altitude);
});
