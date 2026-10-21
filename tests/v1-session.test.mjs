import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime } from './helpers/runtime.mjs';

function makeSession() {
  const api = runtime();
  const runway = { id: '09', x1: 0, y1: 0, x2: 600, y2: 0, width: 46 };
  const session = new api.GameSession({ runway, parkings: [{ id: 'P1', x: 100, y: 150 }, { id: 'P2', x: 300, y: 150 }] });
  return { ...api, session, runway };
}

test('V1 crée un scénario minimal arrivée + départ', () => {
  const { Airliner, RegionalJet, session, runway } = makeSession();
  const arrival = session.spawnArrival(Airliner, { callsign: 'ARR001', altitude: 1200 });
  assert.ok(arrival);
  const departure = session.createDeparture(RegionalJet, { callsign: 'DEP001', parkingId: 'P1', runwayId: runway.id,
    route: [{ x: 100, y: 150 }, { x: 100, y: 50 }, { x: 0, y: 0, type: 'HOLD_SHORT' }] });
  assert.ok(departure);
  assert.equal(arrival.state, 'APPROACH');
  assert.equal(departure.state, 'PARKED');
  assert.equal(session.simulation.entities.length, 2);
});

test('V1 refuse une deuxième arrivée sur une piste déjà réservée', () => {
  const { Airliner, session } = makeSession();
  assert.ok(session.spawnArrival(Airliner, { callsign: 'ARR001' }));
  assert.equal(session.spawnArrival(Airliner, { callsign: 'ARR002' }), null);
});

test('V1 conserve les positions par intégration et expose la télémétrie', () => {
  const { Airliner, session } = makeSession();
  const arrival = session.spawnArrival(Airliner, { callsign: 'ARR001' });
  const before = arrival.pos.copy();
  for (let i = 0; i < 60; i++) session.step();
  assert.notDeepEqual({ x: arrival.pos.x, y: arrival.pos.y }, { x: before.x, y: before.y });
  assert.ok(Array.isArray(arrival.telemetry.behaviors));
  assert.ok(arrival.telemetry.behaviors.includes('pathFollowing'));
  assert.ok(arrival.vel.mag() <= arrival.maxSpeed + 1e-9);
});

test('V1 conserve l’héritage Vehicle pour les modèles spécialisés', () => {
  const { Airliner, RegionalJet, Vehicle } = makeSession();
  assert.ok(new Airliner(0, 0) instanceof Vehicle);
  assert.ok(new RegionalJet(0, 0) instanceof Vehicle);
  assert.equal(new Airliner(0, 0).aircraftType, 'AIRLINER');
  assert.equal(new RegionalJet(0, 0).aircraftType, 'REGIONAL_JET');
});

test('V1 permet de créer un départ depuis un parking libre', () => {
  const { GameSession, RegionalJet } = runtime();
  const session = new GameSession({
    runway: { id: '09', x1: 0, y1: 0, x2: 600, y2: 0, width: 46 },
    parkings: [{ id: 'P1', x: 100, y: 100 }]
  });
  const departure = session.createDepartureFromFreeParking(RegionalJet, { callsign: 'NEW001' });
  assert.equal(departure.callsign, 'NEW001');
  assert.equal(departure.state, 'PARKED');
  assert.equal(departure.parkingId, 'P1');
  assert.ok(departure.departureRoute.some(point => point.type === 'HOLD_SHORT'));
});
