import test from 'node:test';
import assert from 'node:assert/strict';
import { towerRuntime, until } from './helpers/towerRuntime.mjs';
const api = towerRuntime();
test('chaque aéroport possède une aire H1 et peut y stationner un H145', () => {
  for (const id of ['SKY1', 'CMN', 'RAK', 'NCE', 'JFK']) {
    const airport = api.AirportCatalog[id];
    assert.ok(Number.isFinite(airport.helicopterPad.x) && Number.isFinite(airport.helicopterPad.y), id);
    const session = new api.TowerSession({ airport, runway: airport.runway, parkings: airport.parking, randomTraffic: false, seed: 7 });
    const helicopter = session.spawnHelicopter({ callsign: `H${id}` });
    assert.ok(helicopter instanceof api.Vehicle);
    assert.equal(helicopter.modelId, 'H145'); assert.equal(helicopter.state, 'PARKED');
    assert.deepEqual([helicopter.pos.x, helicopter.pos.y], [airport.helicopterPad.x, airport.helicopterPad.y]);
    assert.equal(session.launchHelicopter(helicopter), true);
    assert.equal(helicopter.altitude, 700);
    assert.equal(session.airNavigation.setHeading(helicopter, 90), true);
    const before = helicopter.pos.copy();
    for (let i = 0; i < 60; i += 1) session.step();
    assert.ok(helicopter.pos.x > before.x);
    assert.equal(session.returnHelicopter(helicopter), true);
  }
});
test('une urgence 7700 à l’approche engage les véhicules incendie et médical sans téléportation', () => {
  const airport = api.AirportCatalog.SKY1;
  const session = new api.TowerSession({ airport, runway: airport.runway, parkings: airport.parking, randomTraffic: false, seed: 3 });
  const aircraft = session.spawnInbound({ callsign: 'MAY01', modelId: 'B738' });
  aircraft.assignedRunway = session.runway.id; aircraft.state = 'FINAL'; aircraft.declareEmergency('7700', 'ENGINE_FAILURE');
  const starts = session.emergencyVehicles.map(v => v.pos.copy());
  session.afterOperations();
  assert.equal(session.emergencyVehicles[0].state, 'EN_ROUTE');
  assert.equal(session.emergencyVehicles[1].state, 'EN_ROUTE');
  assert.match(session.lastMessage, /secours/i);
  for (let i = 0; i < 90; i += 1) session.step();
  assert.ok(session.emergencyVehicles.some((v, i) => v.pos.x !== starts[i].x || v.pos.y !== starts[i].y));
});
test('le scénario détournement attend l’ordre du contrôleur puis fait entrer le F-16 par la limite du secteur', () => {
  const airport = api.AirportCatalog.SKY1;
  const scenario = api.ScenarioFactory.create('HIJACK', { tower: true, airport, runway: airport.runway, parkings: airport.parking, randomTraffic: false, seed: 4 });
  assert.equal(scenario.arrivals[0].squawk, '7500');
  assert.equal(scenario.session.simulation.entities.some(entity => entity instanceof api.FighterJet), false);
  assert.equal(scenario.session.scramble(scenario.arrivals[0]), true);
  const fighter = scenario.session.simulation.entities.find(entity => entity instanceof api.FighterJet);
  assert.ok(fighter);
  assert.ok(Math.abs(Math.hypot(fighter.pos.x - airport.center.x, fighter.pos.y - airport.center.y) / ((airport.metersToPixels ?? .2) * 1852) - 68) < .01);
  assert.equal(fighter.interceptTarget, scenario.arrivals[0]);
  assert.ok(scenario.session.eventLog.some(event => /interception autorisée/i.test(event.message)));
});
for (const id of ['CMN', 'RAK', 'NCE', 'JFK']) {
  test(`${id} : départ complet sur la géométrie réelle`, () => {
    const airport = api.AirportCatalog[id];
    const s = new api.TowerSession({ airport, runway: airport.runway, parkings: airport.parking, randomTraffic: false, seed: 7 });
    const a = s.createDepartureFromFreeParking(api.ModelAircraft, { callsign: 'DEP1', modelId: 'B738' });
    assert.ok(a?.assignedRunway, s.lastMessage);
    assert.equal(s.assignDepartureExit(a, 'EXIT-090'), true);
    assert.equal(s.authorizePushback(a), true);
    assert.ok(until(s, () => a.state === 'READY_TAXI', 1600), a.state);
    assert.equal(s.authorizeTaxi(a), true);
    assert.ok(until(s, () => {
      if (a.state === 'WAITING_RUNWAY_CROSSING') assert.equal(s.authorizeCrossing(a), true, s.lastMessage);
      return a.state === 'HOLD_SHORT';
    }, 20000), `${a.state} ${a.routeIndex}`);
    assert.equal(s.authorizeLineUp(a), true, s.lastMessage);
    assert.ok(until(s, () => {
      if (a.state === 'WAITING_RUNWAY_CROSSING') s.authorizeCrossing(a);
      if (a.state === 'HOLD_SHORT') s.authorizeLineUp(a);
      return a.state === 'LINE_UP_WAIT';
    }, 10000), `${a.state} ${a.routeIndex} ${s.lastMessage}`);
    assert.equal(s.authorizeTakeoff(a), true);
    assert.ok(until(s, () => a.state === 'AIRBORNE', 3000), a.state);
  });
  test(`${id} : arrivée complète sur la géométrie réelle`, () => {
    const airport = api.AirportCatalog[id];
    const s = new api.TowerSession({ airport, runway: airport.runway, parkings: airport.parking, randomTraffic: false, seed: 7 });
    const a = s.spawnInbound({ callsign: 'ARR1', modelId: 'B738', distance: 220, lateral: 25 });
    assert.equal(s.assignRunway(a, s.runway.id), true);
    assert.ok(until(s, () => s.canAuthorizeLanding(a), 18000), a.state);
    assert.equal(s.authorizeLanding(a), true);
    assert.ok(until(s, () => a.state === 'WAITING_TAXI', 15000), `${a.state} ${a.routeIndex}`);
    assert.equal(s.authorizeTaxi(a), true);
    assert.ok(until(s, () => {
      if (a.state === 'WAITING_RUNWAY_CROSSING') s.authorizeCrossing(a);
      return a.state === 'PARKED';
    }, 20000), `${a.state} ${a.routeIndex}`);
  });
}
test('une arrivée créée hors secteur rejoint sa cible par steering, sans téléportation', () => {
  const airport = api.AirportCatalog.SKY1;
  const session = new api.TowerSession({ airport, runway: airport.runway, parkings: airport.parking, randomTraffic: false, seed: 13 });
  const center = airport.center;
  const unitsPerNm = (airport.metersToPixels ?? .2) * 1852;
  const aircraft = session.spawnInbound({ callsign: 'FAR01', modelId: 'B738', position: { x: center.x + 100 * unitsPerNm, y: center.y } });
  assert.ok(aircraft.outsideSectorTarget);
  assert.ok(Math.hypot(aircraft.pos.x - aircraft.outsideSectorTarget.x, aircraft.pos.y - aircraft.outsideSectorTarget.y) > 0);
  const initialPosition = aircraft.pos.copy();
  const initialDistance = api.GroundOperations.distance(aircraft.pos, aircraft.outsideSectorTarget);
  for (let i = 0; i < 120; i += 1) session.step();
  assert.notDeepEqual([aircraft.pos.x, aircraft.pos.y], [initialPosition.x, initialPosition.y]);
  assert.ok(api.GroundOperations.distance(aircraft.pos, aircraft.outsideSectorTarget) < initialDistance);
});
