import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
test('décor déterministe, cache borné et rendu indépendant de la caméra', () => {
  const calls = [];
  const ctx = new Proxy({}, { get: (_, key) => (...args) => calls.push([key, ...args]), set: () => true });
  const api = vm.createContext({ document: { createElement: () => ({ getContext: () => ctx }) } });
  for (const f of ['core/seededRandom.js', 'core/mapCamera.js', 'ui/surroundingsRenderer.js']) vm.runInContext(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'), api);
  const renderer = api.SurroundingsRenderer; const airport = { id: 'CMN' };
  assert.equal(renderer.seed('CMN', 1, 2, 0), renderer.seed('CMN', 1, 2, 0));
  assert.notEqual(renderer.seed('CMN', 1, 2, 0), renderer.seed('RAK', 1, 2, 0));
  const tile = renderer.tile(airport, 0, 0, 0); assert.equal(renderer.tile(airport, 0, 0, 0), tile);
  assert.ok(calls.some(c => c[0] === 'bezierCurveTo')); assert.ok(calls.some(c => c[0] === 'arc'));
  for (let i = 0; i < 270; i++) renderer.tile(airport, i, 0, 0);
  assert.ok(renderer.cache.size <= 257);
  const camera = new api.MapCamera(1100, 620); const origin = JSON.stringify(camera.center);
  renderer.render(ctx, camera, airport); assert.equal(JSON.stringify(camera.center), origin);
  assert.ok(calls.some(c => c[0] === 'drawImage'));
});

test('le rivage OSM sert de limite à la génération terrestre côtière', () => {
  const api = vm.createContext({});
  vm.runInContext(readFileSync(new URL('../ui/surroundingsRenderer.js', import.meta.url), 'utf8'), api);
  const airport = { features: [{ properties: { natural: 'coastline' }, points: [{ x: 0, y: 100 }, { x: 100, y: 120 }] }] };
  assert.equal(api.SurroundingsRenderer.coastlineY(airport, 50), 110);
  assert.equal(api.SurroundingsRenderer.coastlineY(airport, 150), null);
  assert.equal(api.SurroundingsRenderer.coastlineY({ features: [] }, 50), null);
  const folded = { features: [{ properties: { natural: 'coastline' }, points: [{ x: 0, y: 10 }, { x: 100, y: 110 }] }, { properties: { natural: 'coastline' }, points: [{ x: 0, y: 190 }, { x: 100, y: 90 }] }] };
  assert.equal(api.SurroundingsRenderer.coastlineY(folded, 50), 140);
});
