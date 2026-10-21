import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

test('les quatre plateformes manuelles disposent d’une géométrie GeoJSON cohérente', () => {
  const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../data/airports');
  for (const file of ['GMMN.geojson', 'GMMX.geojson', 'LFMN.geojson', 'KJFK.geojson']) {
    const geojson = JSON.parse(readFileSync(resolve(dir, file), 'utf8'));
    assert.equal(geojson.type, 'FeatureCollection');
    assert.equal(geojson.metadata.coordinateSystem, 'WGS84');
    assert.ok(geojson.metadata.icao);
    const runways = geojson.features.filter(feature => feature.properties.aeroway === 'runway' && feature.geometry.type === 'LineString');
    assert.ok(runways.length >= 1);
    for (const feature of runways) {
      assert.equal(feature.geometry.type, 'LineString');
      assert.ok(feature.geometry.coordinates.length >= 2);
      assert.notDeepEqual(feature.geometry.coordinates[0], feature.geometry.coordinates[1]);
      for (const [lon, lat] of feature.geometry.coordinates) {
        assert.ok(lon >= -180 && lon <= 180);
        assert.ok(lat >= -90 && lat <= 90);
      }
    }
  }
});
