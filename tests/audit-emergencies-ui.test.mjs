import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { towerRuntime } from './helpers/towerRuntime.mjs';
const api = towerRuntime();
const make = (id = 'SKY1') => {
  const airport = api.AirportCatalog[id];
  return new api.TowerSession({ airport, runway: airport.runway, parkings: airport.parking, randomTraffic: false, seed: 42 });
};

for (const id of ['SKY1', 'CMN', 'RAK', 'NCE', 'JFK']) {
  test(`audit ${id}: all three timed emergencies can be flown to the stand with normal player commands`, () => {
    const airport = api.AirportCatalog[id];
    for (const type of ['ENGINE_FAILURE', 'RADIO_FAILURE', 'HIJACK']) {
      const scenario = api.ScenarioFactory.create(type, { tower: true, airport, runway: airport.runway, parkings: airport.parking, gameMode: 'EMERGENCY', seed: 42, timeLimitSeconds: 180 });
      const { session: s, mission } = scenario; const a = scenario.arrivals[0];
      assert.ok(s.assignRunway(a, a.expectedRunway));
      for (let i = 0; i < 12000 && mission.status === 'RUNNING'; i++) {
        if (s.canAuthorizeLanding(a) && !a.landingCleared) assert.ok(s.authorizeLanding(a));
        if (a.state === 'WAITING_RUNWAY_CROSSING') assert.ok(s.authorizeCrossing(a), s.lastMessage);
        if (a.state === 'WAITING_TAXI') assert.ok(s.authorizeTaxi(a), s.lastMessage);
        s.step();
        assert.ok(!a.destroyed, `${id} ${type}: destroyed`);
      }
      assert.equal(mission.status, 'COMPLETED', `${id} ${type}: ${a.state} / ${s.lastMessage}`);
      assert.equal(mission.score, 1250); assert.equal(a.state, 'PARKED');
      if (type === 'ENGINE_FAILURE') assert.ok(s.emergencyDispatches.has(a.callsign));
    }
  });
}

test('audit: military entry is on the sector edge even when the civil is at its exact center', () => {
  const s = make(); const center = s.airport.center;
  const a = s.spawnInbound({ position: center, callsign: 'CENTER', altitude: 3000 });
  a.declareEmergency('7600'); assert.ok(s.scramble(a));
  const fighter = s.emergencies.assignments.get(a);
  const expected = s.emergencies.sector.radius - 12 * a.tcasUnitsPerNm;
  assert.ok(Math.abs(api.GroundOperations.distance(fighter.pos, center) - expected) < 1e-6);
  assert.ok(Math.abs(fighter.vel.mag() - 1.4) < 1e-8);
});

test('audit: ATC cannot send an interceptor to a parked aircraft', () => {
  const s = make(); const a = s.createDepartureFromFreeParking(api.ModelAircraft, { callsign: 'GROUND' });
  a.declareEmergency('7600'); assert.equal(s.scramble(a), false);
});

test('audit: ending an escort avoids a spurious TCAS between partners, then restores normal separation', () => {
  const s = make(); const a = s.spawnInbound({ callsign: 'CIVIL', position: { x: 200, y: -400 }, altitude: 2000 });
  a.vel.set(1, 0); a.declareEmergency('7600');
  const f = new api.FighterJet(200, -355, { callsign: 'MIL', altitude: 2000, state: 'AIRBORNE' });
  f.vel.set(1, 0); s.simulation.add(f); assert.ok(s.emergencies.intercept(a, f));
  a.state = 'FINAL'; s.emergencies.beforeStep();
  assert.equal(f.mission, 'EXIT'); assert.equal(a.escortPartner, null);
  assert.equal(api.Separation.advisoryFor(a, [f]), null);
  for (let i = 0; i < 160; i++) f.simulateStep({ peers: [] });
  assert.equal(f.departurePartner, null);
  assert.equal(api.Separation.exempt(a, f), false);
});

test('audit: a fighter whose civil target disappears is routed to an exit instead of drifting indefinitely', () => {
  const s = make(); const a = s.spawnInbound({ callsign: 'LOST', altitude: 2000 });
  a.declareEmergency('7600'); assert.ok(s.scramble(a)); const f = s.emergencies.assignments.get(a);
  s.simulation.remove(a); s.emergencies.beforeStep();
  assert.equal(f.mission, 'EXIT'); assert.equal(f.interceptTarget, null);
  assert.equal(f.exitTarget.type, 'EXIT'); assert.equal(s.emergencies.assignments.size, 0);
});

test('audit: real airport projection supplies the TCAS distance scale', () => {
  for (const id of ['CMN', 'RAK', 'NCE', 'JFK']) {
    const s = make(id); const a = s.spawnInbound({ callsign: id });
    assert.equal(a.tcasUnitsPerNm, s.airport.metersToPixels * 1852);
  }
});

test('audit UI: Debug reflects actual traffic, day/night and storms after session changes', () => {
  const elements = Object.fromEntries(['debug-random-traffic-toggle', 'debug-time-of-day', 'debug-weather-profile', 'debug-weather-status'].map(id => [id, {}]));
  const ui = vm.createContext({ byId: id => elements[id], skylineTimeOfDay: 'NIGHT' });
  vm.runInContext(readFileSync(new URL('../ui/steeringDebug.js', import.meta.url), 'utf8'), ui);
  ui.SteeringDebug.syncSession({ generator: { enabled: true }, weather: { storms: [{}, {}] } });
  assert.equal(elements['debug-random-traffic-toggle'].checked, true);
  assert.equal(elements['debug-time-of-day'].value, 'NIGHT');
  assert.equal(elements['debug-weather-profile'].value, 'STORM');
  assert.match(elements['debug-weather-status'].textContent, /2 cellules/);
  ui.SteeringDebug.syncSession({ generator: { enabled: false }, weather: { storms: [] } });
  assert.equal(elements['debug-random-traffic-toggle'].checked, false);
  assert.equal(elements['debug-weather-profile'].value, 'CLEAR');
});

test('audit rendering: visible storm mass is clipped to its physical circular hitbox', () => {
  const calls = []; let saved = 0;
  Object.assign(api, { translate() {}, scale() {}, noStroke() {}, fill() {}, circle() {}, radarWeatherMode: 'DOPPLER',
    drawingContext: { save() { saved++; }, restore() { saved--; }, beginPath() {}, arc(x, y, radius) { calls.push(radius); }, clip() { calls.push('clip'); } } });
  const storm = new api.StormCell(0, 0, { radius: 80, visualScale: 2 });
  storm.render();
  assert.equal(calls[0] * storm.visualScale, storm.hitboxRadius);
  assert.ok(calls.includes('clip')); assert.equal(saved, 0);
});

test('audit UI: the AI lab overlays the lobby and restores focus and pause when closed', () => {
  let focused = null;
  const origin = { isConnected: true, focus() { focused = 'lobby'; } };
  const close = { focus() { focused = 'close'; } };
  const s = { simulation: { paused: false } };
  const ui = vm.createContext({ session: s, document: { activeElement: origin, getElementById: () => close } });
  vm.runInContext(readFileSync(new URL('../ui/aiLabView.js', import.meta.url), 'utf8'), ui);
  const view = Object.create(ui.AILabView.prototype); view.root = { hidden: true }; view.render = () => {};
  view.open(); assert.equal(view.root.hidden, false); assert.equal(s.simulation.paused, true); assert.equal(focused, 'close');
  view.close(); assert.equal(view.root.hidden, true); assert.equal(s.simulation.paused, false); assert.equal(focused, 'lobby');
  const css = readFileSync(new URL('../ui/playLayout.css', import.meta.url), 'utf8');
  assert.match(css, /#ai-lab-modal\s*\{\s*z-index:\s*40/);
  assert.match(readFileSync(new URL('../index.html', import.meta.url), 'utf8'), /id="lobby-ai-open"/);
});
