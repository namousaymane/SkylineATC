/** Pure-JavaScript multilayer perceptron with backward-compatible brain import. */
class NeuralNetwork {
  constructor({ inputs = 8, hidden = 12, hiddenLayers = [hidden], outputs = 4, random = Math.random } = {}) {
    for (const [name, size] of Object.entries({ inputs, outputs })) {
      if (!Number.isInteger(size) || size < 1 || size > 128) throw new RangeError(`${name} must be a positive integer up to 128`);
    }
    if (!Array.isArray(hiddenLayers) || hiddenLayers.length < 1 || hiddenLayers.length > 4 || hiddenLayers.some(size => !Number.isInteger(size) || size < 1 || size > 64)) throw new RangeError('Use 1–4 hidden layers with 1–64 neurons each');
    this.inputs = inputs; this.outputs = outputs; this.hiddenLayers = [...hiddenLayers]; this.hidden = hiddenLayers[0];
    this.layerSizes = [inputs, ...hiddenLayers, outputs];
    this.weights = this.layerSizes.slice(1).map((size, i) => NeuralNetwork.matrix(size, this.layerSizes[i], random, Math.sqrt(2 / (size + this.layerSizes[i]))));
    this.biases = this.layerSizes.slice(1).map(size => NeuralNetwork.matrix(size, 1, random, .05));
    this.lastInputs = []; this.lastHidden = []; this.lastHiddenLayers = []; this.lastOutputs = [];
  }
  get weightsIH() { return this.weights[0]; }
  get weightsHO() { return this.weights.at(-1); }
  get biasH() { return this.biases[0]; }
  get biasO() { return this.biases.at(-1); }
  get parameterCount() { return this.weights.reduce((sum, layer, i) => sum + layer.length * (this.layerSizes[i] + 1), 0); }
  static matrix(rows, cols, random, scale) {
    return Array.from({ length: rows }, () => Array.from({ length: cols }, () => (random() * 2 - 1) * scale));
  }
  static dense(matrix, vector, bias, activation) {
    return matrix.map((row, i) => activation(row.reduce((sum, weight, j) => sum + weight * vector[j], bias[i][0])));
  }
  predict(values) {
    if (!Array.isArray(values) || values.length !== this.inputs || values.some(value => !Number.isFinite(value))) throw new TypeError(`Expected ${this.inputs} finite inputs`);
    this.lastInputs = [...values]; this.lastHiddenLayers = []; let activation = values;
    for (let i = 0; i < this.weights.length; i++) {
      const output = i === this.weights.length - 1;
      activation = NeuralNetwork.dense(this.weights[i], activation, this.biases[i], output ? value => 1 / (1 + Math.exp(-Math.max(-40, Math.min(40, value)))) : Math.tanh);
      if (!output) this.lastHiddenLayers.push([...activation]);
    }
    this.lastHidden = this.lastHiddenLayers.flat(); this.lastOutputs = [...activation]; return [...activation];
  }
  clone() { return NeuralNetwork.deserialize(this.serialize()); }
  mutate(rate = .08, strength = .2, random = Math.random) {
    if (!(rate >= 0 && rate <= 1) || !(strength >= 0) || !Number.isFinite(strength)) throw new RangeError('Invalid mutation parameters');
    const gaussian = () => { const u = Math.max(Number.EPSILON, 1 - random()); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random()); };
    for (const matrix of [...this.weights, ...this.biases]) for (const row of matrix) for (let j = 0; j < row.length; j++) if (random() < rate) row[j] += gaussian() * strength;
    return this;
  }
  crossover(partner, random = Math.random) {
    if (!(partner instanceof NeuralNetwork) || this.layerSizes.join(',') !== partner.layerSizes.join(',')) throw new TypeError('Network architectures must match');
    const child = this.clone();
    for (const key of ['weights', 'biases']) for (let layer = 0; layer < child[key].length; layer++) for (let i = 0; i < child[key][layer].length; i++) for (let j = 0; j < child[key][layer][i].length; j++) child[key][layer][i][j] = random() < .5 ? this[key][layer][i][j] : partner[key][layer][i][j];
    return child;
  }
  serialize() { return { version: 2, inputs: this.inputs, hiddenLayers: [...this.hiddenLayers], outputs: this.outputs, weights: this.weights.map(matrix => matrix.map(row => [...row])), biases: this.biases.map(matrix => matrix.map(row => [...row])) }; }
  static deserialize(data) {
    if (typeof data === 'string') data = JSON.parse(data);
    if (!data || ![1, 2].includes(data.version)) throw new TypeError('Unsupported neural network format');
    if (!Number.isInteger(data.inputs) || !Number.isInteger(data.outputs) || (data.version === 2 && !Array.isArray(data.hiddenLayers))) throw new TypeError('Invalid network dimensions');
    const network = new NeuralNetwork({ inputs: data.inputs, hiddenLayers: data.version === 1 ? [data.hidden] : data.hiddenLayers, outputs: data.outputs, random: () => .5 });
    const weights = data.version === 1 ? [data.weightsIH, data.weightsHO] : data.weights;
    const biases = data.version === 1 ? [data.biasH, data.biasO] : data.biases;
    for (const [key, matrices, expected] of [['weights', weights, network.weights], ['biases', biases, network.biases]]) {
      if (!Array.isArray(matrices) || matrices.length !== expected.length) throw new TypeError(`Invalid ${key} dimensions`);
      network[key] = matrices.map((matrix, layer) => {
        if (!Array.isArray(matrix) || matrix.length !== expected[layer].length || matrix.some(row => !Array.isArray(row) || row.length !== expected[layer][0].length || row.some(value => !Number.isFinite(value)))) throw new TypeError(`Invalid ${key} dimensions or values`);
        return matrix.map(row => [...row]);
      });
    }
    return network;
  }
}
globalThis.NeuralNetwork = NeuralNetwork;
