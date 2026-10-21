import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { runtime } from './helpers/runtime.mjs';

function loadAirports() {
  const context = runtime();
  for (const file of ['data/airports/osmGeometry.js', 'core/airportGeometry.js', 'airports/airportCatalog.js']) {
    vm.runInContext(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), context);
  }
  return context;
}

test('les cartes restent au nord vrai en haut et à échelle uniforme', () => {
  const api = loadAirports();
  for (const airport of Object.values(api.AirportCatalog)) {
    assert.equal(airport.northUp, true);
    assert.equal(airport.northAngle, 0);
    if (!airport.project) continue;
    const [south, west, north, east] = airport.source.bbox;
    const lon = (east + west) / 2; const lat = (south + north) / 2;
    const origin = airport.project([lon, lat]);
    const northPoint = airport.project([lon, lat + .001]);
    const eastPoint = airport.project([lon + .001, lat]);
    assert.ok(northPoint.y < origin.y, airport.id);
    assert.equal(northPoint.x, origin.x);
    assert.ok(eastPoint.x > origin.x);
    assert.equal(eastPoint.y, origin.y);
    const meters = (origin.y - northPoint.y) / airport.metersToPixels;
    assert.ok(Math.abs(meters - 111.32) < .001);
  }
});

test('les désignateurs et le nombre de pistes correspondent aux quatre plateformes', () => {
  const api = loadAirports();
  const expected = { CMN: ['17L/35R', '17R/35L'], RAK: ['10/28'], NCE: ['04L/22R', '04R/22L'], JFK: ['04L/22R', '04R/22L', '13L/31R', '13R/31L'] };
  for (const [id, refs] of Object.entries(expected)) {
    assert.deepEqual(Array.from(api.AirportCatalog[id].runways, r => r.id).sort(), refs.sort());
    assert.ok(api.AirportCatalog[id].taxiways.length >= 90);
  }
});

test('chaque aéroport crée ses départs visibles avec une route sol et un arrêt avant piste', () => {
  const api = loadAirports();
  for (const airport of Object.values(api.AirportCatalog)) {
    const scenario = api.ScenarioFactory.create('CALM', { airport, runway: airport.runway, parkings: airport.parking });
    const departure = scenario.departures[0];
    assert.ok(departure);
    assert.equal(departure.altitude, 0);
    assert.ok(departure.departureRoute.length >= 4, airport.id);
    const hold = departure.departureRoute.find(p => p.type === 'HOLD_SHORT');
    assert.ok(hold);
    const r = airport.runway;
    assert.ok(api.AirportGeometry.distanceToSegment(hold, { x: r.x1, y: r.y1 }, { x: r.x2, y: r.y2 }) >= r.width / 2, airport.id);
    scenario.session.step(); scenario.session.step();
    assert.ok(scenario.session.simulation.entities.includes(departure), airport.id);
    assert.equal(scenario.session.authorizeTaxi(departure), true);
  }
});
