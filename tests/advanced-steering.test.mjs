import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime, vector } from './helpers/runtime.mjs';

test('Pursue prédit la position future d’une cible mobile', () => {
  const context = runtime();
  const chaser = new context.Airplane(0, 0, { maxSpeed: 2 });
  const target = { pos: vector(100, 0), vel: vector(1, 0) };
  const predicted = context.Pursuit.predictedPosition(chaser, target);
  assert.ok(predicted.x > target.pos.x);
  assert.equal(predicted.y, 0);
  assert.ok(context.Pursuit.forceFor(chaser, target).mag() <= chaser.maxForce + 1e-9);
});

test('Evasion produit une force opposée à une menace prédite', () => {
  const context = runtime();
  const evader = new context.Airplane(0, 0, { maxSpeed: 2 });
  const threat = { pos: vector(30, 0), vel: vector(1, 0) };
  const force = context.Evasion.forceFor(evader, threat);
  assert.ok(force.x < 0);
  assert.ok(force.mag() <= evader.maxForce + 1e-9);
});

test('Leader Following vise une position derrière le leader', () => {
  const context = runtime();
  const follower = new context.Airplane(0, 20, { maxSpeed: 2 });
  const leader = { pos: vector(100, 20), vel: vector(2, 0) };
  const force = context.LeaderFollowing.forceFor(follower, leader, { distance: 40 });
  assert.ok(force.x > 0);
  assert.ok(force.mag() <= follower.maxForce + 1e-9);
});

test('FighterJet ajoute un steering de poursuite sans modifier Vehicle', () => {
  const context = runtime();
  const fighter = new context.FighterJet(0, 0, { altitude: 1000 });
  const target = new context.Airliner(100, 20, { altitude: 1000 });
  target.vel.set(1, 0);
  fighter.setInterceptTarget(target);
  const names = fighter.buildSteering({ peers: [], obstacles: [] }).map(item => item.name);
  assert.ok(fighter instanceof context.Vehicle);
  assert.equal(fighter.mission, 'INTERCEPT');
  assert.ok(names.includes('pursuit'));
});
