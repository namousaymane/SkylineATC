import test from 'node:test';
import assert from 'node:assert/strict';
import { towerRuntime } from './helpers/towerRuntime.mjs';
const api = towerRuntime();

for (const modelId of ['B738', 'B788', 'A388']) {
  test(`audit avoidance ${modelId}: real hitbox, bounded turns, navigation resumes for several storm sizes and offsets`, () => {
    for (const radius of [100, 400, 800]) for (const lateral of [-radius * .65, 0, radius * .65]) {
      const a = new api.ModelAircraft(-radius - 900, 0, { callsign: 'BYPASS', altitude: 3000, modelId });
      const storm = new api.StormCell(0, lateral, { radius, sizeMultiplier: 1, maxSpeed: 0, maxForce: 0 });
      a.vel.set(a.model.cruise, 0); a.setTarget({ x: radius + 1500, y: 0 });
      let minDistance = Infinity; let avoided = false; let turn = 0;
      for (let i = 0; i < 5500 && api.GroundOperations.distance(a.pos, a.target) > 60; i++) {
        const prior = a.vel.heading();
        a.simulateStep({ obstacles: [storm], peers: [] });
        minDistance = Math.min(minDistance, api.GroundOperations.distance(a.pos, storm.pos));
        turn = Math.max(turn, Math.abs(Math.atan2(Math.sin(a.vel.heading() - prior), Math.cos(a.vel.heading() - prior))));
        avoided ||= a.telemetry.behaviors.includes('obstacleAvoidance');
      }
      assert.ok(avoided, `${radius} / ${lateral}: no avoidance`);
      assert.ok(minDistance >= radius + a.r, `${radius} / ${lateral}: penetrated ${minDistance} < ${radius + a.r}`);
      assert.ok(a.pos.x > radius + 500, `${radius} / ${lateral}: never passed the cell`);
      assert.ok(api.GroundOperations.distance(a.pos, a.target) <= 60, `${radius} / ${lateral}: navigation never resumed`);
      assert.ok(turn <= api.FlightSteering.turnRate(a) + 1e-8);
      assert.ok(a.vel.mag() >= a.model.cruise * .64);
    }
  });
}

test('audit: storm avoidance never pulls a taxiing aircraft off its taxiway', () => {
  const a = new api.ModelAircraft(0, 0, { altitude: 0, state: 'TAXIING' });
  a.vel.set(.4, 0); a.setTarget({ x: 100, y: 0 });
  const storm = new api.StormCell(50, 0, { radius: 100, sizeMultiplier: 1 });
  for (let i = 0; i < 20; i++) a.simulateStep({ obstacles: [storm], peers: [] });
  assert.equal(a.pos.y, 0);
  assert.ok(!a.telemetry.behaviors.includes('obstacleAvoidance'));
});

test('audit: multiple staggered moving storms are all avoided, then the aircraft rejoins its objective', () => {
  const a = new api.ModelAircraft(-1800, 0, { altitude: 3000, modelId: 'B738' });
  a.vel.set(a.model.cruise, 0); a.setTarget({ x: 2400, y: 0 });
  const storms = [new api.StormCell(-400, 0, { radius: 300, sizeMultiplier: 1, maxSpeed: .08 }), new api.StormCell(700, 450, { radius: 400, sizeMultiplier: 1, maxSpeed: .08 })];
  for (let i = 0; i < 6000 && api.GroundOperations.distance(a.pos, a.target) > 60; i++) {
    for (const storm of storms) storm.simulateStep();
    a.simulateStep({ obstacles: storms, peers: [] });
    for (const storm of storms) assert.ok(api.GroundOperations.distance(a.pos, storm.pos) >= storm.hitboxRadius + a.r,
      `penetrated moving storm at ${storm.pos.x}, ${storm.pos.y}`);
  }
  assert.ok(api.GroundOperations.distance(a.pos, a.target) <= 60);
});

test('audit: stationary aircraft do not retain a stale avoidance warning', () => {
  const a = new api.ModelAircraft(0, 0, { altitude: 3000 });
  a.vel.set(1, 0);
  const storm = new api.StormCell(70, 0, { radius: 30, sizeMultiplier: 1 });
  api.ObstacleAvoidance.forceFor(a, [storm]); assert.ok(a.avoidanceThreat > 0);
  a.vel.set(0, 0);
  assert.equal(api.ObstacleAvoidance.forceFor(a, []).mag(), 0);
  assert.equal(a.avoidanceThreat, 0);
  assert.equal(a.avoidanceObstacle, null);
});

for (const id of ['SKY1', 'CMN', 'RAK', 'NCE', 'JFK']) {
  test(`audit lab ${id}: neuronal ATC completes a calm arrival/departure episode safely`, () => {
    const e = new api.ATCEpisode({ airport: api.AirportCatalog[id], brain: api.ATCPolicy.bootstrap([12, 8]), seed: 42, maxSteps: 24000, trafficLevel: 'CALM', weatherMode: 'CLEAR' });
    while (!e.done) e.step();
    assert.equal(e.metrics.success, true, JSON.stringify({ metrics: e.metrics, states: e.aircraft.map(a => a.state), log: e.session.lastMessage }));
    assert.equal(e.metrics.completed, e.metrics.requested);
    assert.ok(e.controller.decisions.some(d => d.type === 'LAND'));
    assert.ok(e.controller.decisions.some(d => d.type === 'TAKEOFF'));
  });
}

test('audit lab: weather training must not initialize arrivals inside an enlarged storm', () => {
  const e = new api.ATCEpisode({ airport: api.AirportCatalog.SKY1, seed: 42, weatherMode: 'STORM' });
  for (const a of e.aircraft.filter(a => a.altitude > 0)) for (const storm of e.session.weather.storms) {
    assert.ok(api.GroundOperations.distance(a.pos, storm.pos) > storm.hitboxRadius + a.r, 'arrival initialized in storm');
  }
});
