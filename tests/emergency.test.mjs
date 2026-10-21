import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime } from './helpers/runtime.mjs';

test('un avion peut déclarer 7700 ou 7600 et rejette un code inconnu', () => {
  const context = runtime();
  const aircraft = new context.Airplane(0, 0);
  aircraft.declareEmergency('7600', 'RADIO_FAILURE');
  assert.equal(aircraft.squawk, '7600');
  assert.equal(aircraft.radioLost, true);
  aircraft.declareEmergency('7500', 'HIJACK'); assert.equal(aircraft.squawk, '7500'); assert.equal(aircraft.radioLost, true);
  assert.throws(() => aircraft.declareEmergency('1234'), /Unsupported/);
});

test('une panne moteur réduit la vitesse et déclenche 7700', () => {
  const context = runtime();
  const aircraft = new context.Airliner(0, 0);
  const nominal = aircraft.nominalMaxSpeed;
  aircraft.failEngine();
  assert.equal(aircraft.squawk, '7700');
  assert.equal(aircraft.engineFailure, true);
  assert.equal(aircraft.maxSpeed, nominal * 0.55);
});

test('EmergencySystem attend l’ordre du contrôleur avant toute interception', () => {
  const context = runtime();
  const simulation = new context.Simulation();
  const emergencies = new context.EmergencySystem(simulation);
  const distress = simulation.add(new context.Airliner(0, 0));
  const far = simulation.add(new context.FighterJet(100, 0));
  const near = simulation.add(new context.FighterJet(30, 0));
  distress.declareEmergency('7700', 'ENGINE_FAILURE');
  emergencies.beforeStep(); assert.equal(near.interceptTarget, null);
  assert.equal(emergencies.intercept(distress, near), true);
  assert.equal(near.interceptTarget, distress);
  assert.equal(far.interceptTarget, null);
});
test('un squawk 7500 ou 7600 engage l’interception militaire', () => {
  const context = runtime();
  for (const code of ['7500', '7600']) {
    const simulation = new context.Simulation(); const emergencies = new context.EmergencySystem(simulation);
    const distress = simulation.add(new context.Airliner(0, 0)); const fighter = simulation.add(new context.FighterJet(20, 0));
    distress.declareEmergency(code, code === '7500' ? 'HIJACK' : 'RADIO_FAILURE'); emergencies.beforeStep();
    assert.equal(fighter.interceptTarget, null, code);
    assert.equal(emergencies.intercept(distress, fighter), true, code);
    assert.equal(fighter.interceptTarget, distress, code);
  }
});

test('la résolution d’urgence libère l’intercepteur', () => {
  const context = runtime();
  const simulation = new context.Simulation();
  const emergencies = new context.EmergencySystem(simulation);
  const distress = simulation.add(new context.Airliner(0, 0));
  const fighter = simulation.add(new context.FighterJet(20, 0));
  distress.declareEmergency('7700');
  emergencies.beforeStep();
  assert.equal(emergencies.resolve(distress), true);
  assert.equal(distress.emergency, null);
  assert.equal(fighter.interceptTarget, null);
});
