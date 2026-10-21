import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const api = vm.createContext({});
vm.runInContext(readFileSync(new URL('../ui/simulationControls.js', import.meta.url), 'utf8'), api);
test('le curseur de tempo ralentit, accélère et met en pause sans perdre la vitesse précédente', () => {
  const simulation = { paused: false, speed: 1 };
  assert.equal(api.SimulationControls.apply(simulation, 5), 4); assert.equal(simulation.speed, 4);
  api.SimulationControls.apply(simulation, 0); assert.equal(simulation.paused, true); assert.equal(simulation.speed, 4);
  api.SimulationControls.apply(simulation, 1); assert.equal(simulation.paused, false); assert.equal(simulation.speed, .25);
  api.SimulationControls.apply(simulation, 6); assert.equal(simulation.speed, 8);
  assert.throws(() => api.SimulationControls.apply(simulation, -1), /position/);
  assert.throws(() => api.SimulationControls.apply(simulation, NaN), /position/);
});
