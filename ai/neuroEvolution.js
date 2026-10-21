/** Generic genetic optimizer. Fitness evaluation remains owned by the training scenario. */
class NeuroEvolution {
  constructor({ populationSize = 40, eliteRate = .1, mutationRate = .08, mutationStrength = .2, random = Math.random, networkOptions = {} } = {}) {
    if (!Number.isInteger(populationSize) || populationSize < 2) throw new RangeError('populationSize must be at least 2');
    if (!(eliteRate > 0 && eliteRate <= 1) || !(mutationRate >= 0 && mutationRate <= 1) || !(mutationStrength >= 0)) throw new RangeError('Invalid evolution parameters');
    this.populationSize = populationSize; this.eliteRate = eliteRate; this.mutationRate = mutationRate; this.mutationStrength = mutationStrength; this.random = random; this.networkOptions = networkOptions;
    this.generation = 1; this.population = Array.from({ length: populationSize }, () => new NeuralNetwork({ ...networkOptions, random })); this.history = []; this.best = null;
  }
  tournament(scored, size = 3) {
    let winner = null;
    for (let i = 0; i < size; i++) { const candidate = scored[Math.floor(this.random() * scored.length)]; if (!winner || candidate.fitness > winner.fitness) winner = candidate; }
    return winner.network;
  }
  evolve(fitnesses) {
    if (!Array.isArray(fitnesses) || fitnesses.length !== this.populationSize || fitnesses.some(value => !Number.isFinite(value))) throw new TypeError(`Expected ${this.populationSize} finite fitness scores`);
    const scored = this.population.map((network, index) => ({ network, fitness: fitnesses[index] })).sort((a, b) => b.fitness - a.fitness);
    const average = fitnesses.reduce((sum, value) => sum + value, 0) / fitnesses.length;
    if (!this.best || scored[0].fitness > this.best.fitness) this.best = { fitness: scored[0].fitness, network: scored[0].network.clone() };
    const report = { generation: this.generation, bestFitness: scored[0].fitness, averageFitness: average };
    this.history.push(report);
    const eliteCount = Math.min(this.populationSize - 1, Math.max(1, Math.floor(this.populationSize * this.eliteRate)));
    const next = [this.best.network.clone(), ...scored.slice(0, Math.max(0, eliteCount - 1)).map(item => item.network.clone())];
    while (next.length < this.populationSize) next.push(this.tournament(scored).crossover(this.tournament(scored), this.random).mutate(this.mutationRate, this.mutationStrength, this.random));
    this.population = next; this.generation += 1;
    return { ...report, best: this.best.network.clone() };
  }
  exportBest() { if (!this.best) throw new Error('No evaluated generation to export'); return this.best.network.serialize(); }
  importSeed(data) {
    const seed = NeuralNetwork.deserialize(data);
    this.networkOptions = { inputs: seed.inputs, hiddenLayers: [...seed.hiddenLayers], outputs: seed.outputs };
    this.population = this.population.map((_, index) => index === 0 ? seed.clone() : seed.clone().mutate(this.mutationRate, this.mutationStrength, this.random));
    this.best = null; this.history = []; this.generation = 1;
    return seed.clone();
  }
}
globalThis.NeuroEvolution = NeuroEvolution;
