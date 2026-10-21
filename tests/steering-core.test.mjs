import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const vector = (x = 0, y = 0) => ({
  x, y,
  copy() { return vector(this.x, this.y); },
  add(v) { this.x += v.x; this.y += v.y; return this; },
  mult(v) { this.x *= v; this.y *= v; return this; },
  mag() { return Math.hypot(this.x, this.y); },
  limit(max) { if (this.mag() > max) this.mult(max / this.mag()); return this; }
});

function load() {
  const context = { createVector: vector };
  vm.createContext(context);
  vm.runInContext(readFileSync(resolve(root, 'core/steeringComposer.js'), 'utf8'), context);
  return context.SteeringComposer;
}

test('la composition pondérée est limitée par maxForce', () => {
  const SteeringComposer = load();
  const result = SteeringComposer.combine({ maxForce: 1 }, [
    { force: vector(1, 0), weight: 1 },
    { force: vector(0, 1), weight: 1 }
  ]);
  assert.ok(Math.abs(result.mag() - 1) < 1e-9);
  assert.ok(result.x > 0 && result.y > 0);
});

test('une contribution désactivée ne modifie pas la force', () => {
  const SteeringComposer = load();
  const result = SteeringComposer.combine({ maxForce: 2 }, [
    { force: vector(2, 0), weight: 1, enabled: false },
    { force: vector(0, 0.5), weight: 1 }
  ]);
  assert.equal(result.x, 0);
  assert.equal(result.y, 0.5);
});
