import test from 'node:test';
import assert from 'node:assert/strict';
import { towerRuntime } from './helpers/towerRuntime.mjs';
const api = towerRuntime();
for (const modelId of ['B738', 'B788', 'A388']) for (const degrees of [90, -90, 180]) test(`${modelId} cap ${degrees}° : virage continu sans arrêt ni rotation instantanée`, () => {
  const a = new api.ModelAircraft(0, 0, { modelId, altitude: 2000, state: 'NAV_HEADING' });
  a.vel.set(a.maxSpeed, 0);
  const angle = degrees * Math.PI / 180; const initialSpeed = a.vel.mag();
  for (let i = 0; i < 600; i++) {
    a.target = { x: a.pos.x + Math.cos(angle) * 500, y: a.pos.y + Math.sin(angle) * 500 };
    const old = a.vel.copy(); const p = a.pos.copy();
    a.simulateStep({ peers: [], obstacles: [] });
    const turn = Math.abs(Math.atan2(old.x * a.vel.y - old.y * a.vel.x, old.x * a.vel.x + old.y * a.vel.y));
    assert.ok(turn <= .66 * Math.PI / 180 + 1e-9);
    assert.ok(a.vel.mag() >= initialSpeed * .99);
    assert.ok(Math.hypot(a.telemetry.force.x, a.telemetry.force.y) <= a.maxForce + 1e-9);
    assert.ok(Math.abs(a.pos.x - p.x - a.vel.x) < 1e-9);
    assert.ok(Math.abs(a.pos.y - p.y - a.vel.y) < 1e-9);
  }
  assert.ok(Math.abs(Math.atan2(Math.sin(a.vel.heading() - angle), Math.cos(a.vel.heading() - angle))) < .02);
});
test('le guidage depuis une vitesse nulle accélère par forces finies', () => {
  const a = new api.ModelAircraft(0, 0, { altitude: 2000, state: 'NAV_DIRECT' }); a.vel.set(0, 0); a.target = { x: 1000, y: 0 };
  a.simulateStep(); assert.ok(a.vel.mag() > 0); assert.ok(a.vel.mag() <= a.maxForce); assert.ok(Number.isFinite(a.pos.x));
});
