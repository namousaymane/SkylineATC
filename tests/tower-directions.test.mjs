import test from 'node:test';
import assert from 'node:assert/strict';
import { towerRuntime, until } from './helpers/towerRuntime.mjs';
const api = towerRuntime();
for (const id of ['CMN', 'RAK', 'NCE', 'JFK']) {
  const airport = api.AirportCatalog[id];
  for (const runway of api.RunwayDirections.fromAirport(airport)) {
    test(`${id} ${runway.id} : direction sélectionnable, départ puis arrivée`, () => {
      const s = new api.TowerSession({ airport, runway: airport.runway, parkings: airport.parking, seed: 3, randomTraffic: false });
      const a = s.createDepartureFromFreeParking(api.ModelAircraft, { callsign: 'DEPDIR', modelId: 'B738' });
      assert.equal(s.assignRunway(a, runway.id), true, s.lastMessage);
      const exitBearing = Math.round((Number(runway.id.slice(0, 2)) * 10) / 45) * 45 % 360;
      assert.equal(s.assignDepartureExit(a, `EXIT-${String(exitBearing).padStart(3, '0')}`), true);
      assert.equal(s.authorizePushback(a), true);
      assert.ok(until(s, () => a.state === 'READY_TAXI', 2000), a.state);
      assert.equal(s.authorizeTaxi(a), true);
      assert.ok(until(s, () => {
        if (a.state === 'WAITING_RUNWAY_CROSSING') s.authorizeCrossing(a);
        if (a.state === 'HOLD_SHORT') s.authorizeLineUp(a);
        return a.state === 'LINE_UP_WAIT' || a.state === 'HOLD_POSITION';
      }, 30000), `taxi ${a.state} ${a.routeIndex}`);
      assert.equal(a.state, 'LINE_UP_WAIT');
      assert.equal(s.authorizeTakeoff(a), true);
      assert.ok(until(s, () => a.state === 'AIRBORNE', 4000), a.state);
      const b = s.spawnInbound({ callsign: 'ARRDIR', modelId: 'B738', runway, distance: 220, lateral: 15 });
      assert.equal(s.assignRunway(b, runway.id), true);
      assert.ok(until(s, () => s.canAuthorizeLanding(b), 18000), b.state);
      assert.equal(s.authorizeLanding(b), true);
      assert.ok(until(s, () => {
        // Some exits need a second runway crossing before the apron-side taxi stop.
        if (b.state === 'WAITING_RUNWAY_CROSSING') assert.equal(s.authorizeCrossing(b), true, s.lastMessage);
        return b.state === 'WAITING_TAXI';
      }, 15000), `arrival ${b.state}`);
      assert.equal(s.authorizeTaxi(b), true);
      assert.ok(until(s, () => {
        if (b.state === 'WAITING_RUNWAY_CROSSING') s.authorizeCrossing(b);
        return b.state === 'PARKED';
      }, 25000), `taxi-in ${b.state}`);
    });
  }
}
