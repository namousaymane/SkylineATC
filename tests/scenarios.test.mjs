import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime } from './helpers/runtime.mjs';

test('le catalogue V1 crée des scénarios reproductibles', () => {
  const { ScenarioFactory } = runtime();
  for (const id of Object.keys(ScenarioFactory.DEFINITIONS)) {
    const first = ScenarioFactory.create(id);
    const second = ScenarioFactory.create(id);
    assert.equal(first.id, id);
    assert.equal(first.created, first.requested);
    assert.equal(first.arrivals.length, second.arrivals.length);
    assert.equal(first.departures.length, second.departures.length);
    assert.deepEqual(
      first.arrivals.map(aircraft => [aircraft.callsign, aircraft.pos.x, aircraft.pos.y]),
      second.arrivals.map(aircraft => [aircraft.callsign, aircraft.pos.x, aircraft.pos.y])
    );
  }
});

test('le conflit de piste conserve la priorité de l’arrivée', () => {
  const { ScenarioFactory } = runtime();
  const scenario = ScenarioFactory.create('RUNWAY_CONFLICT');
  assert.equal(scenario.arrivals.length, 1);
  assert.equal(scenario.departures.length, 2);
  const arrival = scenario.arrivals[0];
  const departure = scenario.departures[0];
  departure.state = 'HOLD_SHORT';
  assert.equal(scenario.session.runwayController.owns('09', arrival), true);
  assert.equal(scenario.session.authorizeLineUp(departure), false);
});

test('le scénario de remise des gaz démarre hors du localizer', () => {
  const { ScenarioFactory } = runtime();
  const scenario = ScenarioFactory.create('GO_AROUND');
  const arrival = scenario.arrivals[0];
  assert.ok(arrival);
  assert.equal(arrival.guidance.geometry(arrival.pos).lateral, 44);
  assert.equal(arrival.state, 'APPROACH');
});

test('un scénario inconnu est rejeté explicitement', () => {
  const { ScenarioFactory } = runtime();
  assert.throws(() => ScenarioFactory.create('UNKNOWN'), /Unknown scenario/);
});

test('les scénarios d’urgence instancient un avion avec la panne annoncée', () => {
  const { ScenarioFactory } = runtime();
  const engine = ScenarioFactory.create('ENGINE_FAILURE');
  assert.equal(engine.arrivals.length, 1);
  assert.equal(engine.arrivals[0].emergency.reason, 'ENGINE_FAILURE');
  assert.equal(engine.arrivals[0].engineFailure, true);
  const radio = ScenarioFactory.create('RADIO_FAILURE');
  assert.equal(radio.arrivals[0].squawk, '7600');
  assert.equal(radio.arrivals[0].radioLost, true);
});
