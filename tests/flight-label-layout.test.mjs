import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const api = vm.createContext({});
for (const file of ['core/mapCamera.js', 'ui/flightLabelLayout.js']) {
  vm.runInContext(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), api);
}

test('les étiquettes ne se recouvrent pas, évitent les panneaux et privilégient le vol sélectionné', () => {
  const camera = new api.MapCamera(600, 500, 200);
  camera.airspace(60);
  const selected = { pos: { x: 550, y: 310 }, altitude: 2000, callsign: 'SEL' };
  const traffic = Array.from({ length: 20 }, (_, i) => ({
    pos: { x: 550 + (i % 5 - 2) * 850, y: 310 + (Math.floor(i / 5) - 2) * 850 },
    altitude: 2000, callsign: `VOL${i}`
  }));
  const reserved = [{ x: 0, y: 0, width: 600, height: 80 }];
  const labels = api.FlightLabelLayout.place([...traffic, selected], camera, selected, reserved);
  assert.ok(labels.has(selected));
  const boxes = [...labels.values()];
  for (let i = 0; i < boxes.length; i++) {
    const box = boxes[i];
    assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= camera.width && box.y + box.height <= camera.height);
    assert.ok(!api.FlightLabelLayout.intersects(box, reserved[0]));
    for (let j = i + 1; j < boxes.length; j++) assert.ok(!api.FlightLabelLayout.intersects(box, boxes[j]));
  }
  assert.equal(labels.get(selected).compact, false);
  assert.ok([...labels.entries()].some(([plane, box]) => plane !== selected && box.compact));
});

test('les aéronefs hors écran et le trafic sol éloigné ne reçoivent pas d’étiquette', () => {
  const camera = new api.MapCamera(600, 500, 200);
  const parked = { pos: { x: 550, y: 310 }, altitude: 0 };
  const offscreen = { pos: { x: 550 + 100 * 200, y: 310 }, altitude: 2000 };
  const labels = api.FlightLabelLayout.place([parked, offscreen], camera);
  assert.equal(labels.size, 0);
  camera.airport();
  assert.equal(api.FlightLabelLayout.place([parked], camera).size, 1);
});
