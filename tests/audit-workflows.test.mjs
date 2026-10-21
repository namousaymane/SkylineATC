import test from 'node:test';
import assert from 'node:assert/strict';
import { towerRuntime } from './helpers/towerRuntime.mjs';

const api = towerRuntime();
const airports = ['SKY1', 'CMN', 'RAK', 'NCE', 'JFK'];
const models = ['B738', 'B788', 'A388'];
const make = airport => new api.TowerSession({ airport, runway: airport.runway, parkings: airport.parking, randomTraffic: false, seed: 810 });

function advance(s, a, done, limit = 25000, action = () => {}) {
  for (let i = 0; i < limit && !done(); i++) {
    action();
    const before = a.pos.copy();
    const priorSpeedLimit = a.maxSpeed;
    const priorTick = s.simulation.stepCount;
    s.step();
    assert.ok(!a.destroyed, `${a.callsign}: destroyed`);
    assert.ok([a.pos.x, a.pos.y, a.vel.x, a.vel.y, a.altitude].every(Number.isFinite), `${a.callsign}: non-finite physics`);
    const ticks = s.simulation.stepCount - priorTick;
    assert.ok(Math.hypot(a.pos.x - before.x, a.pos.y - before.y) <= Math.max(priorSpeedLimit, a.maxSpeed) * ticks + 1e-6, `${a.callsign}: teleport`);
    if (a.telemetry) assert.ok(Math.hypot(a.telemetry.force.x, a.telemetry.force.y) <= a.maxForce + 1e-8);
  }
  assert.ok(done(), `${a.callsign}: stuck at ${a.state} / node ${a.routeIndex} / ${s.lastMessage}`);
}

for (const id of airports) for (const modelId of models) {
  test(`audit ${id} ${modelId}: every compatible runway, complete ground/departure and arrival workflows`, () => {
    const airport = api.AirportCatalog[id];
    const template = make(airport);
    const model = api.AircraftModels[modelId];
    const compatibleStand = [...template.departures.parkings.values()].some(p => p.maxWingspan >= model.span);
    if (!compatibleStand) {
      assert.equal(template.createDepartureFromFreeParking(api.ModelAircraft, { callsign: 'NO-STAND', modelId }), null);
      return;
    }
    for (const runway of template.directions.filter(r => r.lengthMeters >= model.minRunway)) {
      const s = make(airport);
      const a = s.createDepartureFromFreeParking(api.ModelAircraft, { callsign: `${id}-${modelId}-${runway.id}`, modelId });
      assert.ok(a, s.lastMessage);
      assert.ok(s.assignRunway(a, runway.id), s.lastMessage);
      assert.ok(s.assignDepartureExit(a, 'EXIT-090'));
      assert.ok(s.authorizePushback(a), s.lastMessage);
      advance(s, a, () => a.state === 'READY_TAXI', 3500);
      assert.ok(s.authorizeTaxi(a), s.lastMessage);
      advance(s, a, () => a.state === 'HOLD_SHORT', 30000, () => {
        if (a.state === 'WAITING_RUNWAY_CROSSING') assert.ok(s.authorizeCrossing(a), s.lastMessage);
      });
      assert.ok(s.authorizeLineUp(a), s.lastMessage);
      advance(s, a, () => a.state === 'LINE_UP_WAIT', 5000);
      assert.ok(s.authorizeTakeoff(a), s.lastMessage);
      advance(s, a, () => a.state === 'AIRBORNE', 4000);
      assert.equal(s.runwayController.owns(runway.id, a), false);

      // Separate session: no departing aircraft can hide an arrival defect.
      const inboundSession = make(airport);
      const inbound = inboundSession.spawnInbound({ callsign: `ARR-${a.callsign}`, modelId, runway, distance: 1200, lateral: 30, wanderEnabled: false });
      assert.ok(inboundSession.assignRunway(inbound, runway.id));
      advance(inboundSession, inbound, () => inboundSession.canAuthorizeLanding(inbound), 20000);
      assert.ok(inboundSession.authorizeLanding(inbound), inboundSession.lastMessage);
      advance(inboundSession, inbound, () => inbound.state === 'WAITING_TAXI', 20000, () => {
        if (inbound.state === 'WAITING_RUNWAY_CROSSING') assert.ok(inboundSession.authorizeCrossing(inbound), inboundSession.lastMessage);
      });
      assert.equal(inboundSession.runwayController.owns(runway.id, inbound), false);
      assert.ok(inboundSession.authorizeTaxi(inbound), inboundSession.lastMessage);
      advance(inboundSession, inbound, () => inbound.state === 'PARKED', 30000, () => {
        if (inbound.state === 'WAITING_RUNWAY_CROSSING') assert.ok(inboundSession.authorizeCrossing(inbound), inboundSession.lastMessage);
      });
      const parking = inboundSession.departures.parkings.get(inbound.parkingId);
      assert.ok(api.GroundOperations.distance(inbound.pos, parking) < 1);
    }
  });
}

test('audit: failed vacating clearance preserves an aborted departure and its runway reservation', () => {
  const s = make(api.AirportCatalog.SKY1);
  const r = s.runway;
  const p = api.RunwayDirections.point(r, r.length * .3);
  const a = new api.ModelAircraft(p.x, p.y, { callsign: 'FULL-STANDS', modelId: 'B738', operation: 'DEPARTURE', altitude: 0, state: 'TAKEOFF_ABORTED' });
  a.holdPosition = true; a.assignedRunway = r.id; a.departureRunway = r;
  s.addAircraft(a); s.runwayController.reserve(r.id, a);
  for (const stand of s.departures.parkings.values()) stand.occupied = true;
  assert.equal(s.returnToStandAfterAbort(a), false);
  assert.equal(a.state, 'TAKEOFF_ABORTED');
  assert.ok(s.runwayController.owns(r.id, a));
});

test('audit: one helipad cannot spawn two parked helicopters on top of each other', () => {
  const s = make(api.AirportCatalog.SKY1);
  assert.ok(s.spawnHelicopter({ callsign: 'H1' }));
  assert.equal(s.spawnHelicopter({ callsign: 'H2' }), null);
});

test('audit: separation and weather avoidance continue during helicopter return', () => {
  const s = make(api.AirportCatalog.SKY1);
  const h = s.spawnHelicopter({ callsign: 'RETURN-H' });
  assert.ok(s.launchHelicopter(h));
  assert.ok(s.airNavigation.setHeading(h, 90));
  for (let i = 0; i < 120; i++) s.step();
  assert.ok(s.returnHelicopter(h));
  const b = new api.ModelAircraft(h.pos.x + 15, h.pos.y, { altitude: h.altitude, state: 'AIRBORNE' });
  b.vel.set(-1, 0);
  const contributions = h.buildSteering({ peers: [b], obstacles: [] });
  assert.equal(h.tcasAdvisory?.level, 'RA');
  assert.ok(contributions.some(c => c.name === 'separation'));
  advance(s, h, () => h.state === 'PARKED', 3000);
});

test('audit: a taxi route blocked by a parked aircraft stops rather than driving through it', () => {
  const s = make(api.AirportCatalog.SKY1);
  const leader = new api.ModelAircraft(80, -200, { callsign: 'BLOCKED-STAND', modelId: 'B738', altitude: 0, state: 'PARKED' });
  leader.holdPosition = true;
  const a = new api.ModelAircraft(0, -200, { callsign: 'TAXI-BEHIND', modelId: 'B738', altitude: 0, state: 'TAXIING' });
  a.vel.set(a.model.taxi, 0);
  s.addAircraft(leader); s.addAircraft(a);
  s.ground.start(a, [{ x: 0, y: -200 }, { x: 180, y: -200 }], 'TAXI');
  for (let i = 0; i < 500; i++) s.step();
  assert.ok(!a.destroyed && !leader.destroyed);
  assert.ok(a.pos.x < leader.pos.x - a.r - leader.r);
  assert.ok(a.vel.mag() < .01);
});

test('audit: a moving aircraft physically hitting a parked aircraft is not collision-exempt', () => {
  const s = make(api.AirportCatalog.SKY1);
  const parked = new api.ModelAircraft(0, -200, { callsign: 'PARKED-CONTACT', altitude: 0, state: 'PARKED' });
  parked.holdPosition = true;
  const moving = new api.ModelAircraft(1, -200, { callsign: 'TAXI-CONTACT', altitude: 0, state: 'TAXIING' });
  moving.vel.set(.4, 0);
  s.addAircraft(parked); s.addAircraft(moving); s.resolveAirCollisions();
  assert.ok(parked.destroyed && moving.destroyed);
});
