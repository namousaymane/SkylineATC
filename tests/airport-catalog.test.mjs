import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

test('le catalogue contient plusieurs aéroports avec une piste exploitable', () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const context = {};
  vm.createContext(context);
  for (const file of ['data/airports/osmGeometry.js', 'core/airportGeometry.js', 'airports/airportCatalog.js']) vm.runInContext(readFileSync(resolve(root, file), 'utf8'), context);
  assert.deepEqual(Object.keys(context.AirportCatalog), ['SKY1', 'CMN', 'RAK', 'NCE', 'JFK']);
  for (const airport of Object.values(context.AirportCatalog)) {
    assert.ok(airport.runway.x1 !== airport.runway.x2 || airport.runway.y1 !== airport.runway.y2);
    assert.ok(airport.parking.length >= 3);
    assert.ok(airport.parking.length <= 18, `${airport.id}: trop de postes affichés`);
    for (let i = 0; i < airport.parking.length; i++) for (let j = i + 1; j < airport.parking.length; j++) {
      assert.ok(Math.hypot(airport.parking[i].x - airport.parking[j].x, airport.parking[i].y - airport.parking[j].y) >= 20, `${airport.id}: postes trop rapprochés`);
    }
    assert.ok(airport.runways.length >= 1);
    assert.ok(airport.terminals.length >= 1);
  }
});
