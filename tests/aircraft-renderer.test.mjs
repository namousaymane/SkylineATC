import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const context = vm.createContext({});
for (const file of ['entities/aircraftModels.js', 'ui/aircraftRenderer.js']) {
  vm.runInContext(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), context);
}

test('B738, B788 et A388 ont des silhouettes, dimensions et motorisations distinctes', () => {
  const models = ['B738', 'B788', 'A388'].map(id => context.AircraftModels[id]);
  const profiles = models.map(model => context.AircraftRenderer.profile(model));
  assert.deepEqual(models.map(model => model.engines), [2, 2, 4]);
  assert.ok(models[0].span < models[1].span && models[1].span < models[2].span);
  assert.equal(new Set(profiles.map(profile => profile.wingtip)).size, 3);
  assert.deepEqual(profiles.map(profile => profile.engineY.length * 2), [2, 2, 4]);
  for (const profile of profiles) {
    assert.ok(profile.wing.length >= 6);
    assert.ok(profile.wing.every(([x, y]) => Number.isFinite(x) && y > 0 && y <= .52));
  }
});
