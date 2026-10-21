import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function makeVector(x = 0, y = 0) {
  return {
    x, y,
    copy() { return makeVector(this.x, this.y); },
    add(v) { this.x += v.x; this.y += v.y; return this; },
    sub(v) { this.x -= v.x; this.y -= v.y; return this; },
    mult(v) { this.x *= v; this.y *= v; return this; },
    set(xValue, yValue) { this.x = xValue; this.y = yValue; return this; },
    magSq() { return this.x ** 2 + this.y ** 2; },
    mag() { return Math.sqrt(this.magSq()); },
    setMag(value) { const m = this.mag(); if (m > 0) this.mult(value / m); return this; },
    limit(value) { if (this.mag() > value) this.setMag(value); return this; }
  };
}
function load(files) {
  const context = { createVector: makeVector, p5: { Vector: {
    sub(a, b) { return makeVector(a.x - b.x, a.y - b.y); }
  } } };
  vm.createContext(context);
  for (const file of files) vm.runInContext(readFileSync(resolve(root, file), 'utf8'), context);
  return context;
}

test('la projection scalaire reste bornée sur un segment nul', () => {
  const { PathFollowing } = load(['core/pathFollowing.js']);
  const result = PathFollowing.project({ x: 4, y: 5 }, { x: 1, y: 1 }, { x: 1, y: 1 });
  assert.deepEqual({ x: result.point.x, y: result.point.y, t: result.t }, { x: 1, y: 1, t: 0 });
});

test('la séparation ignore un avion séparé verticalement', () => {
  const { Separation } = load(['core/separation.js']);
  const own = { pos: makeVector(0, 0), vel: makeVector(1, 0), maxSpeed: 2, maxForce: 0.2, altitude: 1000 };
  const other = { pos: makeVector(10, 0), vel: makeVector(1, 0), altitude: 2000 };
  assert.equal(Separation.forceFor(own, [other]).magSq(), 0);
});

test('la séparation protège une superposition sans division par zéro', () => {
  const { Separation } = load(['core/separation.js']);
  const own = { pos: makeVector(0, 0), vel: makeVector(1, 0), maxSpeed: 2, maxForce: 0.2, altitude: 1000 };
  const other = { pos: makeVector(0, 0), altitude: 1000 };
  const force = Separation.forceFor(own, [other]);
  assert.ok(Number.isFinite(force.x) && Number.isFinite(force.y));
  assert.ok(force.mag() <= 0.2 + 1e-9);
});

test('l’évitement produit une force uniquement dans le corridor futur', () => {
  const { ObstacleAvoidance } = load(['core/obstacleAvoidance.js']);
  const own = { pos: makeVector(0, 0), vel: makeVector(1, 0), maxSpeed: 2, maxForce: 0.2 };
  const obstacle = { pos: makeVector(80, 0), r: 20 };
  assert.ok(ObstacleAvoidance.forceFor(own, [obstacle]).mag() > 0);
  assert.equal(ObstacleAvoidance.forceFor(own, [{ pos: makeVector(0, 100), r: 20 }]).magSq(), 0);
});
