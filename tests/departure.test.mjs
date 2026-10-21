import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime } from './helpers/runtime.mjs';

function setup() {
  const api = runtime();
  const simulation = new api.Simulation({ step: 1 / 60 });
  const runwayController = new api.RunwayController([{ id: '09', x1: 0, y1: 0, x2: 600, y2: 0, width: 46 }]);
  const departures = new api.DepartureController(simulation, runwayController, { pushbackSteps: 5, waypointRadius: 14 });
  departures.registerParking({ id: 'P1', x: -220, y: -120 });
  const runway = runwayController.resources.get('09').runway;
  const route = [
    { x: -220, y: -120 },
    { x: -220, y: -30 },
    { x: -80, y: -30, type: 'RUNWAY_CROSSING' },
    { x: -80, y: 0, type: 'HOLD_SHORT' },
    { x: 0, y: 0 }
  ];
  const aircraft = departures.createDeparture(api.Airplane, { callsign: 'DEP001', parkingId: 'P1', runwayId: '09', runway, route });
  return { ...api, simulation, runwayController, departures, aircraft, route };
}

function step(setupValue, count = 1) {
  const { simulation, departures } = setupValue;
  for (let i = 0; i < count; i += 1) {
    const peers = simulation.entities.map(source => ({ source, pos: source.pos.copy(), vel: source.vel.copy(), altitude: source.altitude, callsign: source.callsign }));
    const context = { peers, path: null, obstacles: [] };
    departures.beforeStep(context);
    for (const aircraft of simulation.entities) aircraft.simulateStep(context);
    departures.afterStep(context);
  }
}

test('départ complet avec repoussage, traversée, hold short et décollage', () => {
  const value = setup();
  const { aircraft, departures, runwayController, route } = value;
  assert.ok(aircraft);
  assert.equal(departures.authorizeTaxi(aircraft), true);
  step(value, 5);
  assert.equal(aircraft.state, 'TAXIING');
  step(value, 500);
  assert.equal(aircraft.state, 'WAITING_RUNWAY_CROSSING');
  assert.equal(departures.authorizeCrossing(aircraft), true);
  step(value, 500);
  assert.equal(aircraft.state, 'HOLD_SHORT');
  assert.equal(departures.authorizeLineUp(aircraft), true);
  assert.equal(runwayController.owns('09', aircraft), true);
  step(value, 500);
  assert.equal(aircraft.state, 'LINE_UP_WAIT');
  assert.equal(departures.authorizeTakeoff(aircraft), true);
  step(value, 1200);
  assert.equal(aircraft.state, 'AIRBORNE');
  assert.equal(runwayController.owns('09', aircraft), false);
  assert.equal(departures.parkings.get('P1').occupied, false);
  assert.equal(aircraft.altitude, 1000);
  assert.ok(route.length > 1);
});

test('les autorisations sont séquentielles et le parking est réservé', () => {
  const value = setup();
  const { aircraft, departures } = value;
  assert.equal(departures.createDeparture(value.Airplane, {
    parkingId: 'P1', runwayId: '09', runway: value.runwayController.resources.get('09').runway,
    route: value.route
  }), null);
  assert.equal(departures.authorizeCrossing(aircraft), false);
  assert.equal(departures.authorizeLineUp(aircraft), false);
  assert.equal(departures.authorizeTakeoff(aircraft), false);
});
