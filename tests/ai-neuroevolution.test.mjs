import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const context = vm.createContext({});
for (const file of ['ai/neuralNetwork.js', 'ai/neuroEvolution.js']) vm.runInContext(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), context);

test('réseau IA : dimensions, activations bornées, reproductibilité et sérialisation JSON', () => {
  const network = new context.NeuralNetwork({ random: () => .65 });
  const output = [...network.predict([0, .1, -.2, .3, -.4, .5, -.6, .7])];
  assert.equal(output.length, 4); assert.ok(output.every(value => value > 0 && value < 1));
  assert.deepEqual([...context.NeuralNetwork.deserialize(JSON.stringify(network.serialize())).predict(network.lastInputs)], output);
  assert.equal(network.lastHidden.length, 12); assert.throws(() => network.predict([1]), /finite inputs/);
  assert.throws(() => context.NeuralNetwork.deserialize({ version: 1, inputs: 8, hidden: 12, outputs: 4 }), /dimensions/);
});

test('neuroévolution : classement, conservation du meilleur et population constante', () => {
  let seed = 7; const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const evolution = new context.NeuroEvolution({ populationSize: 10, random });
  const result = evolution.evolve(Array.from({ length: 10 }, (_, index) => index));
  assert.equal(result.bestFitness, 9); assert.equal(evolution.generation, 2); assert.equal(evolution.population.length, 10);
  evolution.evolve(Array(10).fill(-1)); assert.equal(evolution.best.fitness, 9);
  const exported = evolution.exportBest(); evolution.importSeed(exported); assert.equal(evolution.population.length, 10);
  assert.throws(() => evolution.evolve([1]), /finite fitness/);
});

test('réseau multicouche : prédictions, activations et aller-retour JSON pour 1 à 4 couches', () => {
  for (const hiddenLayers of [[8], [16, 8], [24, 16, 8], [12, 10, 8, 6]]) {
    const network = new context.NeuralNetwork({ hiddenLayers, random: () => .63 });
    const inputs = [0, .1, .2, .3, .4, .5, .6, 1]; const output = Array.from(network.predict(inputs));
    assert.equal(network.lastHiddenLayers.length, hiddenLayers.length);
    assert.deepEqual(Array.from(network.lastHiddenLayers, layer => layer.length), hiddenLayers);
    assert.ok(output.every(value => Number.isFinite(value) && value >= 0 && value <= 1));
    const restored = context.NeuralNetwork.deserialize(JSON.stringify(network.serialize()));
    assert.deepEqual(Array.from(restored.predict(inputs)), output);
    assert.equal(restored.parameterCount, network.parameterCount);
    const child = network.crossover(restored, () => .4).mutate(1, .2, () => .4);
    assert.equal(child.weights.length, hiddenLayers.length + 1);
    assert.ok(child.predict(inputs).every(Number.isFinite));
    assert.notDeepEqual(child.serialize(), network.serialize());
    assert.throws(() => network.crossover(new context.NeuralNetwork({ hiddenLayers: [7] })), /architectures/);
  }
});

test('les cerveaux historiques v1 restent utilisables et les architectures invalides sont refusées', () => {
  const original = new context.NeuralNetwork({ hidden: 12, random: () => .7 });
  const old = { version: 1, inputs: 8, hidden: 12, outputs: 4, weightsIH: original.weightsIH, weightsHO: original.weightsHO, biasH: original.biasH, biasO: original.biasO };
  const imported = context.NeuralNetwork.deserialize(old); const inputs = Array(8).fill(.5);
  assert.deepEqual(Array.from(imported.predict(inputs)), Array.from(original.predict(inputs)));
  for (const hiddenLayers of [[], [65], [0], [NaN], [2, 2, 2, 2, 2]]) assert.throws(() => new context.NeuralNetwork({ hiddenLayers }), /hidden layers/);
  const invalid = original.serialize(); invalid.weights[0][0][0] = Infinity;
  assert.throws(() => context.NeuralNetwork.deserialize(invalid), /values/);
});
