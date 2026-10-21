import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('la simulation transmet le contexte commun aux entités', () => {
  const context = {};
  vm.createContext(context);
  vm.runInContext(readFileSync(resolve(root, 'core/simulation.js'), 'utf8'), context);
  const received = [];
  const simulation = new context.Simulation({ step: 1 / 60, path: ['path'], obstacles: ['obstacle'] });
  simulation.add({ simulateStep(value) { received.push(value); } });
  simulation.update(0);
  simulation.update(1 / 60);
  assert.equal(received.length, 1);
  assert.deepEqual(received[0].path, ['path']);
  assert.deepEqual(received[0].obstacles, ['obstacle']);
  assert.equal(received[0].peers.length, 1);
});
