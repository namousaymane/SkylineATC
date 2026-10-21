import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime } from './helpers/runtime.mjs';

test('une cellule orageuse est une Vehicle et se déplace par forces', () => {
  const context = runtime();
  const storm = new context.StormCell(10, 20, { vx: 0.2, vy: 0.1 });
  const before = storm.pos.copy();
  storm.simulateStep();
  assert.ok(storm instanceof context.Vehicle);
  assert.notDeepEqual({ x: storm.pos.x, y: storm.pos.y }, { x: before.x, y: before.y });
  assert.ok(storm.vel.mag() <= storm.maxSpeed + 1e-9);
});

test('WeatherSystem expose les cellules comme obstacles de la simulation', () => {
  const context = runtime();
  const simulation = new context.Simulation({ step: 1 / 60 });
  const weather = new context.WeatherSystem(simulation);
  const storm = weather.addStorm(80, 0, { radius: 30 });
  simulation.setEnvironment({ obstacles: weather.storms });
  assert.equal(simulation.obstacles[0], storm);
  assert.equal(simulation.entities[0], storm);
});

test('un avion produit une contribution obstacle devant une cellule orageuse', () => {
  const context = runtime();
  const airplane = new context.Airliner(0, 0, { maxSpeed: 2, maxForce: 0.2, altitude: 1000 });
  airplane.vel.set(1, 0);
  const storm = new context.StormCell(60, 0, { radius: 20 });
  const names = airplane.buildSteering({ obstacles: [storm], peers: [] }).map(item => item.name);
  assert.ok(names.includes('obstacleAvoidance'));
});

test('l evitement prioritaire ne peut pas etre annule par la turbulence de la meme cellule', () => {
  const context = runtime();
  const airplane = new context.Airplane(0, 0, { maxSpeed: 2, maxForce: 0.2, altitude: 1000 });
  airplane.vel.set(1, 0);
  const storm = new context.StormCell(45, 0, { radius: 20, intensity: 1, phase: 0 });
  const contributions = airplane.buildSteering({ obstacles: [storm], peers: [] });
  const avoidance = contributions.find(item => item.name === 'obstacleAvoidance');
  const turbulence = contributions.find(item => item.name === 'weatherTurbulence');
  assert.ok(avoidance?.force.mag() > 0);
  assert.ok(!turbulence || Math.sign(turbulence.force.y) === Math.sign(avoidance.force.y) || turbulence.force.mag() < avoidance.force.mag());
  const combined = context.SteeringComposer.combine(airplane, contributions);
  assert.equal(Math.sign(combined.y), Math.sign(avoidance.force.y));
});

test('la turbulence ajoute une force latérale bornée dans la zone météo', () => {
  const context = runtime();
  const airplane = new context.Airplane(0, 0, { maxSpeed: 2, maxForce: 0.2, altitude: 1000 });
  airplane.vel.set(1, 0);
  const storm = new context.StormCell(20, 0, { radius: 40, intensity: 1, phase: 0 });
  const force = context.WeatherEffects.forceFor(airplane, [storm]);
  assert.ok(force.mag() > 0);
  assert.ok(force.mag() <= airplane.maxForce + 1e-9);
  assert.ok(Math.abs(force.x) < 1e-9);
});

test('une approche dans une cellule intense déclenche une remise des gaz météo', () => {
  const context = runtime();
  const runway = { id: '09', x1: 0, y1: 0, x2: 600, y2: 0, width: 46 };
  const controller = new context.RunwayController([runway]);
  const guidance = new context.ApproachGuidance(runway, controller);
  const airplane = new context.Airplane(-1, 0, { altitude: 30, maxSpeed: 1.3 });
  airplane.vel.set(1.3, 0);
  assert.ok(guidance.clear(airplane));
  airplane.altitude = 0;
  const storm = new context.StormCell(10, 0, { radius: 40, intensity: 1 });
  airplane.simulateStep({ obstacles: [storm], peers: [] });
  assert.equal(airplane.state, 'GO_AROUND');
  assert.equal(airplane.goAroundReason, 'WEATHER_UNSTABLE');
});
