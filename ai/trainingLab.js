/** Neuroevolution of ATC policies evaluated in isolated live TowerSessions. */
class AITrainingLab {
  constructor({ airport, populationSize = 6, mutationRate = .08, mutationStrength = .24, elitism = .12, hiddenLayers = [12], seed = 2026, maxSteps = 12000, weatherMode = 'AUTO', trafficLevel = 'NORMAL' } = {}) {
    if (!airport?.runways?.length) throw new TypeError('ATC training requires an airport');
    if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 54000) throw new RangeError('Episode horizon must be 1–54000 steps');
    if (!['AUTO', 'CLEAR', 'STORM'].includes(weatherMode) || !['CALM', 'NORMAL', 'BUSY'].includes(trafficLevel)) throw new RangeError('Invalid training scenario');
    this.airport = airport; this.seed = Number(seed) >>> 0; this.maxSteps = maxSteps; this.weatherMode = weatherMode; this.trafficLevel = trafficLevel;
    this.speed = 1; this.running = false; this.hiddenLayers = [...hiddenLayers]; this.history = []; this.report = null; this.validation = null; this.validating = false; this.hasLearnedBrain = false;
    this.mutationRate = mutationRate; this.mutationStrength = mutationStrength; this.elitism = elitism;
    this.createEvolution(populationSize); this.buildGeneration();
  }
  get population() { return this.evolution.population; }
  get generation() { return this.evolution.generation; }
  createEvolution(populationSize) {
    if (!Number.isInteger(populationSize) || populationSize < 6 || populationSize > 64) throw new RangeError('Population must be between 6 and 64');
    if (!(this.mutationRate >= .01 && this.mutationRate <= .5) || !(this.elitism >= .05 && this.elitism <= .5) || !(this.mutationStrength >= .01 && this.mutationStrength <= 1)) throw new RangeError('Invalid evolution parameters');
    this.rng = new SeededRandom(this.seed);
    this.evolution = new NeuroEvolution({ populationSize, eliteRate: this.elitism, mutationRate: this.mutationRate, mutationStrength: this.mutationStrength, random: () => this.rng.next(), networkOptions: { inputs: ATCPolicy.INPUTS, hiddenLayers: this.hiddenLayers, outputs: ATCPolicy.OUTPUTS } });
    const warm = ATCPolicy.bootstrap(this.hiddenLayers);
    for (let i = 0; i < Math.ceil(populationSize / 2); i++) this.population[i] = i === 0 ? warm : warm.clone().mutate(this.mutationRate, this.mutationStrength, () => this.rng.next());
  }
  options(seed = this.seed) { return { airport: this.airport, seed, maxSteps: this.maxSteps, weatherMode: this.weatherMode, trafficLevel: this.trafficLevel }; }
  buildGeneration() {
    this.agents = this.population.map(brain => ({ brain, episode: new ATCEpisode({ ...this.options(), brain }), fitness: 0, done: false }));
    this.baseline = new ATCEpisode(this.options()); this.generationStep = 0;
    this.runway = this.baseline.runway; this.unitsPerNm = this.baseline.unitsPerNm; this.weatherScenario = this.baseline.weather;
  }
  configure({ populationSize = this.population.length, mutationRate = this.mutationRate, mutationStrength = this.mutationStrength, elitism = this.elitism, hiddenLayers = this.hiddenLayers } = {}) {
    new NeuralNetwork({ inputs: ATCPolicy.INPUTS, hiddenLayers, outputs: 1 });
    if (!Number.isInteger(populationSize) || populationSize < 6 || populationSize > 64) throw new RangeError('Population must be between 6 and 64');
    if (!(mutationRate >= .01 && mutationRate <= .5) || !(elitism >= .05 && elitism <= .5) || !Number.isFinite(mutationStrength) || mutationStrength < .01 || mutationStrength > 1) throw new RangeError('Invalid evolution parameters');
    const seed = this.hiddenLayers.join(',') === hiddenLayers.join(',') && this.hasLearnedBrain ? this.exportBest() : null;
    this.pause(); this.validating = false; this.hiddenLayers = [...hiddenLayers]; this.mutationRate = mutationRate; this.mutationStrength = mutationStrength; this.elitism = elitism;
    this.createEvolution(populationSize); if (seed) this.evolution.importSeed(seed);
    this.hasLearnedBrain = false; this.history = []; this.report = null; this.validation = null; this.buildGeneration();
  }
  setSpeed(value) { if (![1, 5, 10, 20].includes(Number(value))) throw new RangeError('Training speed must be 1, 5, 10, or 20'); return this.speed = Number(value); }
  start() { if (this.validating) return false; this.running = true; return true; }
  pause() { this.running = false; return false; }
  reset(seed = this.seed) { this.pause(); this.validating = false; this.seed = Number(seed) >>> 0; this.createEvolution(this.population.length); this.history = []; this.report = null; this.validation = null; this.hasLearnedBrain = false; this.buildGeneration(); }
  finishGeneration() {
    const result = this.evolution.evolve(this.agents.map(item => item.fitness));
    const winner = this.agents.reduce((a, b) => a.fitness >= b.fitness ? a : b);
    this.hasLearnedBrain = true; this.validation = null;
    this.report = { generation: result.generation, bestFitness: result.bestFitness, averageFitness: result.averageFitness, baselineFitness: this.baseline.fitness,
      population: this.agents.length, safePolicies: this.agents.filter(item => item.episode.metrics.safe).length,
      successfulPolicies: this.agents.filter(item => item.episode.metrics.success).length, metrics: { ...winner.episode.metrics }, baselineMetrics: { ...this.baseline.metrics } };
    this.history.push(this.report); if (this.history.length > 120) this.history.shift(); this.buildGeneration();
  }
  tick(steps = this.speed) {
    if (!this.running && !this.validating) return 0;
    if (!Number.isInteger(steps) || steps < 1 || steps > 2000) throw new RangeError('Invalid training batch size');
    for (let i = 0; i < steps; i++) {
      if (this.validating) { this.tickValidation(); continue; }
      if (!this.running) break;
      for (const item of this.agents) { item.episode.step(); item.fitness = item.episode.fitness; item.done = item.episode.done; }
      this.baseline.step(); this.generationStep++;
      if (this.agents.every(item => item.done) && this.baseline.done) this.finishGeneration();
    }
    return steps;
  }
  exportBest() { if (!this.hasLearnedBrain || !this.evolution.best) throw new Error('Évaluez une génération avant d’exporter le contrôleur.'); return this.evolution.best.network.serialize(); }
  importBrain(payload) {
    if (!payload || payload.format !== 'SkylineATC-Controller' || payload.version !== 1 || payload.schema !== ATCPolicy.SCHEMA) throw new TypeError('Fichier de contrôleur ATC attendu. Les cerveaux pilotes ont été retirés.');
    const brain = ATCPolicy.validate(NeuralNetwork.deserialize(payload.network));
    this.pause(); this.validating = false; this.hiddenLayers = [...brain.hiddenLayers]; this.evolution.importSeed(brain.serialize());
    this.evolution.best = { fitness: -Infinity, network: brain.clone() }; this.hasLearnedBrain = true;
    this.history = []; this.report = null; this.validation = null; this.buildGeneration(); return brain;
  }
  exportPayload() { return { format: 'SkylineATC-Controller', version: 1, schema: ATCPolicy.SCHEMA, airport: this.airport.id, seed: this.seed, generation: this.generation - 1, network: this.exportBest() }; }
  startValidation() {
    const network = this.exportBest(); this.pause(); this.validationBrain = NeuralNetwork.deserialize(network); this.validating = true;
    this.validation = { status: 'RUNNING', results: [], seedIndex: 0, passed: false }; this.buildValidationPair();
  }
  buildValidationPair() {
    const seed = (this.seed + 100003 + this.validation.seedIndex * 7919) >>> 0;
    this.validationPair = [new ATCEpisode({ ...this.options(seed), brain: this.validationBrain.clone() }), new ATCEpisode(this.options(seed))];
  }
  tickValidation() {
    for (const episode of this.validationPair) episode.step();
    if (!this.validationPair.every(episode => episode.done)) return;
    const [learned, baseline] = this.validationPair;
    this.validation.results.push({ seed: learned.seed, metrics: { ...learned.metrics }, baselineMetrics: { ...baseline.metrics }, fitness: learned.fitness, baselineFitness: baseline.fitness });
    this.validation.seedIndex++;
    if (this.validation.seedIndex < 3) this.buildValidationPair();
    else { this.validating = false; this.validation.status = 'COMPLETE'; this.validation.passed = this.validation.results.every(r => r.metrics.success && r.fitness >= r.baselineFitness); }
  }
  cancelValidation() { this.validating = false; if (this.validation?.status === 'RUNNING') this.validation.status = 'CANCELLED'; }
}
globalThis.AITrainingLab = AITrainingLab;
