import test from 'node:test';
import assert from 'node:assert/strict';
import { towerRuntime, until } from './helpers/towerRuntime.mjs';
const api = towerRuntime();
function session(id = 'SKY1', options = {}) {
  const airport = api.AirportCatalog[id];
  return new api.TowerSession({ airport, runway: airport.runway, parkings: airport.parking, randomTraffic: false, seed: 42, ...options });
}

test('les deux directions partagent la piste et les pistes sécantes sont protégées', () => {
  const s = session('JFK'); const a = { callsign: 'A' }; const b = { callsign: 'B' };
  assert.equal(s.runwayController.reserve('04L', a), true);
  assert.equal(s.runwayController.reserve('22R', b), false);
  assert.equal(s.runwayController.owns('22R', a), true);
  assert.equal(s.runwayController.reserve('13R', b), false);
  assert.equal(s.runwayController.release('22R', a), true);
  assert.equal(s.runwayController.reserve('22R', b), true);
});

test('départ : repoussage physique, taxi, arrêt, alignement confirmé et décollage', () => {
  const s = session(); const a = s.createDepartureFromFreeParking(api.ModelAircraft, { callsign: 'TEST1', modelId: 'B738' });
  const origin = a.pos.copy();
  assert.equal(s.assignDepartureExit(a, 'EXIT-090'), true);
  assert.equal(s.authorizeTakeoff(a), false);
  assert.equal(s.authorizeTaxi(a), false);
  assert.equal(s.authorizePushback(a), true);
  assert.ok(until(s, () => a.state === 'READY_TAXI', 1500), a.state);
  assert.ok(Math.hypot(a.pos.x - origin.x, a.pos.y - origin.y) > 3);
  assert.equal(s.authorizeTaxi(a), true);
  assert.ok(until(s, () => a.state === 'HOLD_SHORT'), `${a.state} ${a.routeIndex}`);
  assert.equal(s.authorizeTakeoff(a), false);
  assert.equal(s.authorizeLineUp(a), true);
  assert.equal(s.authorizeTakeoff(a), false);
  assert.ok(until(s, () => a.state === 'LINE_UP_WAIT', 3000), `${a.state} ${a.routeIndex}`);
  assert.equal(s.authorizeTakeoff(a), true);
  assert.ok(until(s, () => a.state === 'AIRBORNE', 2500), a.state);
  assert.equal(s.runwayController.owns(a.assignedRunway, a), false);
  assert.ok(a.altitude > 0);
});

test('un départ exige une sortie sectorielle et un avion entrant n’est pas placé en attente automatiquement', () => {
  const s = session(); const departure = s.createDepartureFromFreeParking(api.ModelAircraft, { callsign: 'EXIT1', modelId: 'B738' });
  assert.equal(s.assignDepartureExit(departure, 'NOT-A-FIX'), false);
  assert.equal(s.assignDepartureExit(departure, 'EXIT-315'), true);
  const arrival = s.spawnInbound({ callsign: 'INB1', modelId: 'B738', distance: 220 });
  assert.equal(arrival.state, 'INBOUND');
  s.beforeOperations();
  assert.equal(arrival.state, 'INBOUND');
  assert.ok(arrival.target);
  assert.equal(arrival.holdingCenter, undefined);
});

test('une approche donnée avant la limite reprend après l’entrée physique dans le secteur', () => {
  const s = session(); const a = s.generator.spawnArrival();
  assert.ok(a.outsideSectorTarget);
  assert.equal(s.assignRunway(a, a.expectedRunway), true);
  assert.ok(until(s, () => !a.outsideSectorTarget, 10000));
  assert.ok(a.guidance);
  assert.notEqual(a.state, 'INBOUND');
});

test('approche sans clairance : remise des gaz au point de décision', () => {
  const s = session(); const a = s.spawnInbound({ callsign: 'TEST2', modelId: 'B738', distance: 220, lateral: 20 });
  assert.equal(s.assignRunway(a, '09'), true);
  assert.ok(until(s, () => a.state === 'GO_AROUND', 3000), a.state);
  assert.equal(a.goAroundReason, 'NO_LANDING_CLEARANCE');
  assert.equal(a.landingCleared, false);
});

test('après la montée de remise des gaz, l’avion poursuit sa route et attend une instruction au lieu d’orbiter seul', () => {
  const s = session(); const a = s.spawnInbound({ callsign: 'GA01', modelId: 'B738' });
  assert.equal(s.assignRunway(a, '09'), true);
  a.state = 'GO_AROUND'; a.goAroundAge = 500; a.goAroundReason = 'NO_LANDING_CLEARANCE';
  s.beforeOperations();
  assert.equal(a.state, 'INBOUND');
  assert.ok(a.target);
  assert.equal(a.holdingCenter, undefined);
});

test('changer de direction ne téléporte pas et la finale exige une remise des gaz', () => {
  const s = session(); const a = s.spawnInbound({ callsign: 'CHANGE', modelId: 'B738', distance: 220, lateral: 10 });
  const origin = a.pos.copy();
  assert.equal(s.assignRunway(a, '27'), true);
  assert.equal(a.pos.x, origin.x); assert.equal(a.pos.y, origin.y);
  assert.equal(a.assignedRunway, '27');
  a.state = 'FINAL';
  assert.equal(s.assignRunway(a, '09'), false);
  assert.equal(s.goAround(a), true);
  assert.equal(s.assignRunway(a, '09'), true);
  assert.equal(a.assignedRunway, '09');
});

test('atterrissage et traversée sont refusés pendant une occupation concurrente', () => {
  const s = session(); const a = s.spawnInbound({ callsign: 'LAND', modelId: 'B738' });
  const b = s.createDepartureFromFreeParking(api.ModelAircraft, { callsign: 'GROUND', modelId: 'B738' });
  assert.equal(s.assignRunway(a, '09'), true);
  assert.equal(s.runwayController.reserve('27', b), true);
  assert.equal(s.authorizeLanding(a), false);
  b.state = 'WAITING_RUNWAY_CROSSING'; b.pendingCheckpoint = { runwayId: '09/27' };
  s.runwayController.release('27', b); s.runwayController.reserve('09', a);
  assert.equal(s.authorizeCrossing(b), false);
});

test('arrivée autorisée : toucher, dégagement complet, taxi séparé et parking', () => {
  const s = session(); const a = s.spawnInbound({ callsign: 'TEST3', modelId: 'B788', distance: 220, lateral: 20 });
  assert.equal(s.assignRunway(a, '09'), true);
  assert.equal(s.authorizeLanding(a), false);
  assert.ok(until(s, () => s.canAuthorizeLanding(a), 18000), a.state);
  assert.equal(s.authorizeLanding(a), true);
  assert.ok(until(s, () => a.state === 'ROLL_OUT', 3000), a.state);
  assert.equal(a.altitude, 0);
  assert.equal(s.runwayController.owns('09', a), true);
  assert.ok(until(s, () => a.state === 'WAITING_TAXI', 6000), `${a.state} ${a.routeIndex}`);
  assert.equal(s.runwayController.owns('09', a), false);
  assert.equal(s.authorizeTaxi(a), true);
  assert.ok(until(s, () => a.state === 'PARKED', 8000), `${a.state} ${a.routeIndex}`);
  assert.ok(a instanceof api.Vehicle);
});

test('piste modifiable au point d’attente : le départ quitte le hold short par taxi, sans téléportation', () => {
  const s = session(); const a = s.createDepartureFromFreeParking(api.ModelAircraft, { callsign: 'REROUTE', modelId: 'B738' });
  assert.equal(s.authorizePushback(a), true);
  assert.ok(until(s, () => a.state === 'READY_TAXI', 1600));
  assert.equal(s.authorizeTaxi(a), true);
  assert.ok(until(s, () => a.state === 'HOLD_SHORT', 12000), a.state);
  const old = a.pos.copy();
  assert.equal(s.assignRunway(a, '27'), true, s.lastMessage);
  assert.equal(a.assignedRunway, '27'); assert.equal(a.state, 'TAXIING');
  assert.deepEqual([a.pos.x, a.pos.y], [old.x, old.y]);
  assert.ok(a.groundRoute?.length > 1);
});

test('annulation du décollage freine par force puis permet un dégagement prioritaire', () => {
  const s = session(); const a = s.createDepartureFromFreeParking(api.ModelAircraft, { callsign: 'ABORT', modelId: 'B738' });
  s.assignDepartureExit(a, 'EXIT-090');
  s.authorizePushback(a); assert.ok(until(s, () => a.state === 'READY_TAXI', 1600));
  s.authorizeTaxi(a); assert.ok(until(s, () => a.state === 'HOLD_SHORT', 12000));
  s.authorizeLineUp(a); assert.ok(until(s, () => a.state === 'LINE_UP_WAIT', 5000));
  assert.equal(s.authorizeTakeoff(a), true);
  for (let i = 0; i < 30; i++) s.step();
  assert.ok(a.vel.mag() > 0);
  const position = a.pos.copy();
  assert.equal(s.cancelTakeoff(a), true);
  assert.ok(until(s, () => a.state === 'TAKEOFF_ABORTED', 300), a.state);
  assert.equal(s.runwayController.owns(a.assignedRunway, a), true);
  assert.ok(Math.hypot(a.pos.x - position.x, a.pos.y - position.y) > 0, 'le freinage doit rester intégré par la physique');
  assert.equal(s.expediteRunwayExit(a), true, s.lastMessage);
  assert.equal(a.state, 'VACATING');
});

function rejectedDeparture(s, callsign) {
  const a = s.createDepartureFromFreeParking(api.ModelAircraft, { callsign, modelId: 'B738' });
  s.assignDepartureExit(a, 'EXIT-090');
  s.authorizePushback(a); assert.ok(until(s, () => a.state === 'READY_TAXI', 1600));
  s.authorizeTaxi(a); assert.ok(until(s, () => a.state === 'HOLD_SHORT', 12000));
  s.authorizeLineUp(a); assert.ok(until(s, () => a.state === 'LINE_UP_WAIT', 5000));
  s.authorizeTakeoff(a); for (let i = 0; i < 30; i++) s.step();
  assert.equal(s.cancelTakeoff(a), true); assert.ok(until(s, () => a.state === 'TAKEOFF_ABORTED', 300));
  return a;
}

test('après rejet : retour au parking en taxi, sans repoussage automatique', () => {
  const s = session(); const a = rejectedDeparture(s, 'RETURN1');
  const position = a.pos.copy();
  assert.equal(s.returnToStandAfterAbort(a), true, s.lastMessage);
  assert.equal(a.state, 'VACATING'); assert.equal(s.runwayController.owns(a.assignedRunway, a), true);
  assert.ok(until(s, () => a.state === 'PARKED', 12000), a.state);
  assert.equal(s.runwayController.owns('09', a), false);
  assert.equal(a.postAbortReturn, true);
  assert.ok(Math.hypot(a.pos.x - position.x, a.pos.y - position.y) > 10);
  assert.equal(s.runwayController.owns(a.assignedRunway, a), false);
});

test('après rejet : nouvelle direction, sortie physique puis taxi jusqu’au point d’attente', () => {
  const s = session(); const a = rejectedDeparture(s, 'RETRY1');
  const position = a.pos.copy();
  assert.equal(s.retryTakeoffAfterAbort(a, '27'), true, s.lastMessage);
  assert.equal(a.state, 'VACATING'); assert.equal(a.assignedRunway, '09');
  assert.ok(until(s, () => a.state === 'TAXIING' || a.state === 'WAITING_RUNWAY_CROSSING', 5000), a.state);
  assert.equal(s.runwayController.owns('09', a), false);
  assert.equal(a.assignedRunway, '27');
  assert.ok(Math.hypot(a.pos.x - position.x, a.pos.y - position.y) > 10);
  assert.ok(until(s, () => a.state === 'HOLD_SHORT', 12000), a.state);
  assert.equal(s.authorizeLineUp(a), true);
  assert.ok(until(s, () => a.state === 'LINE_UP_WAIT', 5000), a.state);
  assert.equal(s.authorizeTakeoff(a), true);
});

test('deux avions sur le même taxiway gardent une file au hold short', () => {
  const s = session();
  const follower = new api.ModelAircraft(0, 20, { callsign: 'FOLLOW', altitude: 0, state: 'TAXIING', modelId: 'B738' });
  const leader = new api.ModelAircraft(45, 20, { callsign: 'LEADER', altitude: 0, state: 'TAXIING', modelId: 'B738' });
  for (const a of [follower, leader]) {
    a.groundRoute = [{ x: a.pos.x, y: a.pos.y }, { x: 100, y: 20, type: 'HOLD_SHORT', runwayId: '09' }];
    a.routeIndex = 1; a.groundPhase = 'TAXI'; a.vel.set(.48, 0);
    s.addAircraft(a);
  }
  assert.ok(until(s, () => leader.state === 'HOLD_SHORT', 1200), `${leader.state} ${leader.pos.x}`);
  for (let i = 0; i < 240; i++) s.step();
  assert.ok(follower.pos.x < leader.pos.x - 12, `avions trop proches : ${follower.pos.x} / ${leader.pos.x}`);
  assert.notEqual(follower.state, 'HOLD_SHORT', 'le suivant ne doit pas s’arrêter sur le même point d’attente');
});

for (const modelId of ['B738', 'B788', 'A388']) {
  test(`${modelId} : cycle départ et arrivée dans le sens réciproque 27`, () => {
    const s = session(); const a = s.createDepartureFromFreeParking(api.ModelAircraft, { callsign: `D${modelId}`, modelId });
    assert.equal(s.assignRunway(a, '27'), true);
    assert.equal(s.assignDepartureExit(a, 'EXIT-270'), true);
    assert.equal(s.authorizePushback(a), true);
    assert.ok(until(s, () => a.state === 'READY_TAXI', 1600));
    assert.equal(s.authorizeTaxi(a), true);
    assert.ok(until(s, () => a.state === 'HOLD_SHORT'));
    assert.equal(s.authorizeLineUp(a), true);
    assert.ok(until(s, () => a.state === 'LINE_UP_WAIT', 4000), a.state);
    assert.equal(s.authorizeTakeoff(a), true);
    assert.ok(until(s, () => a.state === 'AIRBORNE', 3000), a.state);
    const arrival = s.spawnInbound({ callsign: `A${modelId}`, modelId, runway: s.direction('27'), distance: 220, lateral: 20 });
    assert.equal(s.assignRunway(arrival, '27'), true);
    assert.ok(until(s, () => s.canAuthorizeLanding(arrival), 18000), arrival.state);
    assert.equal(s.authorizeLanding(arrival), true);
    assert.ok(until(s, () => arrival.state === 'WAITING_TAXI', 9000), arrival.state);
    assert.equal(s.authorizeTaxi(arrival), true);
    assert.ok(until(s, () => arrival.state === 'PARKED', 12000), arrival.state);
  });
}
