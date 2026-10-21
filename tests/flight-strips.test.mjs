import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

function element(tagName) {
  return { tagName, dataset: {}, children: [], attributes: {},
    setAttribute(k, v) { this.attributes[k] = v; },
    append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } },
    replaceChildren(...children) { this.children = []; this.append(...children); },
    remove() { this.parent.children = this.parent.children.filter(child => child !== this); }
  };
}
function setup() {
  const api = vm.createContext({ document: { createElement: element } });
  vm.runInContext(readFileSync(new URL('../ui/flightStrips.js', import.meta.url), 'utf8'), api);
  return api.FlightStrips;
}
const aircraft = callsign => ({ callsign, modelId: 'B738', state: 'INBOUND', altitude: 3000, assignedAltitude: 3000, heading: 0 });

test('flight strips retain row identity and focus target as headings, altitude, alerts and selection change', () => {
  const renderer = setup(); const list = element('div'); const a = aircraft('TEST1'); const b = aircraft('TEST2');
  renderer.render(list, [a, b], a); const row = list.children[0]; const info = row.children[1];
  a.heading = 45; a.altitude = 2500; a.assignedAltitude = 3500; a.tcasAdvisory = { level: 'RA' };
  renderer.render(list, [a, b], b);
  assert.equal(list.children[0], row); assert.equal(row.children[1], info);
  assert.match(info.children[1].textContent, /2500 \/ 3500 ft · HDG 135/);
  assert.match(row.children[2].textContent, /TCAS RA/);
  assert.ok(!row.className.includes('selected')); assert.ok(list.children[1].className.includes('selected'));
});

test('flight strips remove exited flights, show one empty state and treat callsigns as text', () => {
  const renderer = setup(); const list = element('div'); const a = aircraft('<img src=x>');
  renderer.render(list, [], null); renderer.render(list, [], null); assert.equal(list.children.length, 1);
  renderer.render(list, [a], a); assert.equal(list.children.length, 1);
  assert.equal(list.children[0].children[1].children[0].textContent, '<img src=x>');
  renderer.render(list, [], null); assert.equal(list.children.length, 1); assert.equal(list.children[0].className, 'traffic-empty');
});

test('clearing selection invalidates the list even when its next signature is the empty string', () => {
  const api = vm.createContext({});
  vm.runInContext(readFileSync(new URL('../sketch.js', import.meta.url), 'utf8'), api);
  api.updateHud = () => {};
  api.selectAircraft(null);
  assert.equal(vm.runInContext('trafficSignature', api), null);
  assert.equal(vm.runInContext('trafficSignature !== ""', api), true);
});
