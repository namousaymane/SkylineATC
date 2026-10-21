import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime, vector } from './helpers/runtime.mjs';

function setup(options = {}) {
  const api = runtime();
  const runway = { id: '09', x1: 0, y1: 0, x2: 600, y2: 0, width: 46 };
  const controller = new api.RunwayController([runway]);
  const guidance = new api.ApproachGuidance(runway, controller);
  const airplane = new api.Airplane(-300, 0, { altitude: 1800, maxSpeed: 2.2, ...options });
  airplane.vel.set(2.2, 0);
  assert.ok(guidance.clear(airplane));
  return { ...api, runway, controller, guidance, airplane };
}

test('approche complète, toucher et freinage par Vehicle sans libération prématurée', () => {
  const { airplane, guidance, controller, Vehicle } = setup();
  assert.ok(airplane instanceof Vehicle);
  const states = new Set();
  for (let frame = 0; frame < 5000 && airplane.state !== 'STOPPED'; frame++) {
    const previous = airplane.pos.copy();
    airplane.simulateStep();
    states.add(airplane.state);
    assert.ok(Math.hypot(airplane.pos.x - previous.x, airplane.pos.y - previous.y) <= airplane.maxSpeed + 1e-9);
    assert.ok(Math.hypot(airplane.telemetry.force.x, airplane.telemetry.force.y) <= airplane.maxForce + 1e-9);
    assert.ok(airplane.vel.mag() <= airplane.maxSpeed + 1e-9);
    assert.equal(airplane.acc.mag(), 0);
  }
  for (const state of ['FINAL', 'TOUCHDOWN', 'ROLL_OUT', 'STOPPED']) assert.ok(states.has(state), state);
  assert.equal(airplane.altitude, 0);
  assert.ok(Math.hypot(airplane.pos.x - guidance.rolloutPoint.x, airplane.pos.y) < 1);
  assert.ok(controller.owns('09', airplane));
});

test('une piste réservée refuse une deuxième arrivée', () => {
  const { guidance, Airplane, controller, airplane } = setup();
  const other = new Airplane(-300, 20, { callsign: 'SKY002' });
  assert.equal(guidance.clear(other), false);
  assert.equal(controller.release('09', other), false);
  assert.ok(controller.owns('09', airplane));
});

test('une approche trop haute déclenche une remise des gaz sans toucher', () => {
  const { airplane, guidance, controller } = setup();
  // Explicit test initialization just before the threshold, at an unsafe level.
  airplane.pos.set(-1, 0);
  airplane.altitude = 1800;
  airplane.simulateStep();
  assert.equal(airplane.state, 'GO_AROUND');
  assert.equal(airplane.goAroundReason, 'UNSTABLE_APPROACH');
  assert.equal(controller.owns('09', airplane), false);
  const altitude = airplane.altitude;
  for (let i = 0; i < 20; i++) airplane.simulateStep();
  assert.ok(airplane.altitude > altitude);
  assert.ok(airplane.pos.x > guidance.runway.x1);
});

test('remise des gaz manuelle et piste devenue indisponible', () => {
  const { airplane, guidance, controller } = setup();
  assert.ok(guidance.goAround(airplane));
  assert.equal(airplane.state, 'GO_AROUND');
  assert.equal(guidance.goAround(airplane), false);
  const second = setup();
  second.controller.release('09', second.airplane);
  second.airplane.simulateStep();
  assert.equal(second.airplane.goAroundReason, 'RUNWAY_UNAVAILABLE');
  assert.equal(controller.owns('09', airplane), false);
});

test('projection prédictive, virage et arrêt au dernier point', () => {
  const { Airplane } = runtime();
  const aircraft = new Airplane(0, 0, { altitude: 1000 });
  aircraft.path = [vector(0, 0), vector(100, 0), vector(100, 100)];
  for (let i = 0; i < 2500; i++) aircraft.simulateStep();
  assert.ok(Math.hypot(aircraft.pos.x - 100, aircraft.pos.y - 100) < 1);
  assert.ok(aircraft.vel.mag() < 0.03);
});

test('TCAS superposé : forces opposées et décroissance inverse carré', () => {
  const { Airplane, Separation } = runtime();
  const a = new Airplane(0, 0, { callsign: 'A' });
  const b = new Airplane(0, 0, { callsign: 'B' });
  assert.ok(Separation.forceFor(a, [a, b]).x < 0);
  assert.ok(Separation.forceFor(b, [a, b]).x > 0);
  b.pos.set(100, 0);
  const near = Separation.forceFor(a, [a, b]).mag();
  b.pos.set(140, 0);
  assert.ok(Separation.forceFor(a, [a, b]).mag() < near);
});

test('TCAS prédit un rapprochement et distingue TA/RA selon altitude et CPA', () => {
  const { Airplane, Separation } = runtime();
  const own = new Airplane(0, 0, { callsign: 'OWN', altitude: 5000 });
  const intruder = new Airplane(220, 0, { callsign: 'INTR', altitude: 5400 });
  own.vel.set(1, 0); intruder.vel.set(-1, 0);
  const advisory = Separation.advisoryFor(own, [own, intruder]);
  assert.equal(advisory.level, 'RA');
  intruder.altitude = 7000;
  assert.equal(Separation.advisoryFor(own, [own, intruder]), null);
});

test('évitement latéral au milieu du corridor, côté stable et obstacle derrière ignoré', () => {
  const { Airplane, ObstacleAvoidance } = runtime();
  const a = new Airplane(0, 0);
  a.vel.set(2, 0);
  const obstacle = { pos: vector(35, 0), r: 10 };
  const force = ObstacleAvoidance.forceFor(a, [obstacle]);
  assert.ok(Math.abs(force.x) < 1e-12);
  assert.ok(Math.abs(force.y) > 0);
  obstacle.pos.y = 1;
  assert.equal(Math.sign(ObstacleAvoidance.forceFor(a, [obstacle]).y), Math.sign(force.y));
  obstacle.pos.x = -100;
  assert.equal(ObstacleAvoidance.forceFor(a, [obstacle]).mag(), 0);
});

test('poids arrivée effectif, une seule source de navigation et forces invalides ignorées', () => {
  const { Airplane, SteeringComposer } = runtime();
  const a = new Airplane(0, 0, { behaviorWeights: { arrival: 0 } });
  a.setTarget(vector(100, 0), true);
  a.simulateStep({ path: [vector(0, 0), vector(0, 100)] });
  assert.equal(a.vel.mag(), 0);
  assert.equal(a.telemetry.behaviors.length, 1);
  assert.equal(SteeringComposer.combine(a, [{ force: vector(NaN, 1) }]).mag(), 0);
});

test('le trafic reste indépendant de son ordre de mise à jour', () => {
  function run(reverse) {
    const { Airplane, Simulation } = runtime();
    const a = new Airplane(0, 0, { callsign: 'A' });
    const b = new Airplane(70, 0, { callsign: 'B' });
    a.setTarget(vector(300, 0));
    b.setTarget(vector(-300, 0));
    const sim = new Simulation();
    for (const item of reverse ? [b, a] : [a, b]) sim.add(item);
    sim.update(0);
    for (let frame = 1; frame <= 120; frame++) sim.update(frame / 60);
    return [a.pos.x, a.pos.y, b.pos.x, b.pos.y];
  }
  assert.deepEqual(run(false), run(true));
});

test('x8 exécute huit pas par image, pause et reprise sans rattrapage', () => {
  const { Simulation } = runtime();
  const sim = new Simulation({ speed: 8 });
  let steps = 0;
  sim.add({ simulateStep() { steps++; } });
  sim.update(0);
  sim.update(1 / 60);
  assert.equal(steps, 8);
  sim.togglePause();
  sim.update(10);
  assert.equal(steps, 8);
  sim.togglePause();
  sim.update(10 + 1 / 60);
  assert.ok(steps >= 15 && steps <= 16);
  assert.throws(() => new Simulation({ step: 0 }), /Invalid/);
  assert.throws(() => sim.update(NaN), /Invalid/);
});

test('une approche désaxée au seuil est refusée et une piste nulle rejetée', () => {
  const { airplane, ApproachGuidance, controller } = setup();
  airplane.pos.set(-1, 40);
  airplane.altitude = 0;
  airplane.simulateStep();
  assert.equal(airplane.goAroundReason, 'UNSTABLE_APPROACH');
  assert.throws(() => new ApproachGuidance({ x1: 0, y1: 0, x2: 0, y2: 0 }, controller), /nonzero/);
});
