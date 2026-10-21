import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const api = {}; vm.createContext(api); vm.runInContext(readFileSync(new URL('../core/mapCamera.js', import.meta.url), 'utf8'), api);
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} ≠ ${b}`);

test('la vue garde le nord en haut et peut couvrir les arrivées à 80 NM', () => {
  const camera = new api.MapCamera(900, 620, 200);
  camera.airspace(80);
  assert.ok(camera.visible({ x: 550 + 78 * 200, y: 310 }));
  assert.ok(camera.visible({ x: 550, y: 310 - 78 * 200 }));
  const center = camera.screen(camera.center); const north = camera.screen({ x: camera.center.x, y: camera.center.y - 200 });
  near(center.x, north.x); assert.ok(north.y < center.y);
  camera.airport(); assert.ok(camera.rangeNm < 2);
});

test('dézoom et déplacement restent bornés au secteur de 80 NM', () => {
  const camera = new api.MapCamera(1100, 620, 370.4);
  camera.zoom(1e-20); camera.pan(1e6, -1e6);
  assert.ok(camera.visible({ x: 550 + 78 * 370.4, y: 310 }));
  assert.ok(camera.visible({ x: 550, y: 310 + 78 * 370.4 }));
  near(camera.center.x, 550); near(camera.center.y, 310);
});

test('le zoom conserve le point sous le curseur, le pan et les conversions sont réversibles', () => {
  const c = new api.MapCamera(1100, 620); const anchor = { x: 127, y: 249 }; const before = c.world(anchor);
  c.zoom(3, anchor); const after = c.world(anchor); near(before.x, after.x); near(before.y, after.y);
  c.pan(20, -18); const shifted = c.screen(before); near(shifted.x, anchor.x + 20); near(shifted.y, anchor.y - 18);
  c.zoom(1 / 3, anchor); const point = { x: 890, y: -1500 }; const roundTrip = c.world(c.screen(point)); near(roundTrip.x, point.x); near(roundTrip.y, point.y);
});

test('zoom borné, cadrage des points et redimensionnement conservent une échelle finie', () => {
  const c = new api.MapCamera(800, 600);
  c.zoom(1e20); near(c.scale, c.maxScale); c.zoom(1e-30); near(c.scale, c.minScale);
  c.fit([{ x: -8000, y: 1000 }, { x: 7000, y: -2000 }]);
  for (const p of [{ x: -8000, y: 1000 }, { x: 7000, y: -2000 }]) { const q = c.screen(p); assert.ok(q.x >= 0 && q.x <= 800 && q.y >= 0 && q.y <= 600); }
  c.resize(1200, 800); assert.ok(Number.isFinite(c.scale) && c.scale > 0);
});

test('les strips peuvent filtrer les vols réellement visibles après zoom et pan', () => {
  const c = new api.MapCamera(900, 600, 200);
  const center = { x: 550, y: 310 };
  const distant = { x: 550 + 70 * 200, y: 310 };
  assert.equal(c.visible(center), true);
  assert.equal(c.visible(distant), false);
  c.airspace(80);
  assert.equal(c.visible(distant), true);
  c.airport();
  assert.equal(c.visible(distant), false);
  assert.equal(c.visible(null), false);
  assert.equal(c.visible({ x: Number.NaN, y: 0 }), false);
  const border = c.world({ x: -8, y: 300 });
  assert.equal(c.visible(border), false);
  assert.equal(c.visible(border, 12), true);
});

test('le secteur des strips reste indépendant du niveau de zoom', () => {
  const c = new api.MapCamera(900, 600, 200);
  const center = { x: 550, y: 310 };
  const inSectorButOffscreen = { x: center.x + 70 * 200, y: center.y };
  const outsideSector = { x: center.x + 81 * 200, y: center.y };
  c.airport();
  assert.equal(c.visible(inSectorButOffscreen), false);
  assert.equal(c.inSector(inSectorButOffscreen, center), true);
  assert.equal(c.inSector(outsideSector, center), false);
  assert.equal(c.inSector(null, center), false);
});
