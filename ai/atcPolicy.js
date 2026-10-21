/** A shared action-ranking network. It never changes aircraft forces or coordinates. */
class ATCPolicy {
  static SCHEMA = 'skyline-atc-actions-v1';
  static ACTIONS = Object.freeze(['WAIT', 'APPROACH', 'LAND', 'EXIT', 'PUSHBACK', 'TAXI', 'CROSS', 'LINEUP', 'TAKEOFF', 'ALTITUDE', 'HOLD', 'GO_AROUND', 'EXPEDITE']);
  static INPUTS = 26;
  static OUTPUTS = 1;
  static labels = Object.freeze({ WAIT: 'Attendre', APPROACH: 'Assigner approche', LAND: 'Autoriser atterrissage', EXIT: 'Assigner sortie', PUSHBACK: 'Autoriser repoussage', TAXI: 'Autoriser taxi', CROSS: 'Autoriser traversée', LINEUP: 'Autoriser alignement', TAKEOFF: 'Autoriser décollage', ALTITUDE: 'Séparer en altitude', HOLD: 'Mettre en attente', GO_AROUND: 'Remise de gaz', EXPEDITE: 'Dégagement prioritaire' });
  static validate(brain) {
    if (!(brain instanceof NeuralNetwork) || brain.inputs !== this.INPUTS || brain.outputs !== this.OUTPUTS) throw new TypeError('Cerveau ATC requis : 26 entrées et 1 sortie. Les anciens cerveaux pilotes ne sont pas compatibles.');
    return brain;
  }
  static inputsFor(controller, candidate) {
    const s = controller.session; const a = candidate.aircraft; const nm = (s.airport.metersToPixels ?? .2) * 1852;
    const traffic = controller.traffic(); const runway = candidate.runway ?? s.direction(a?.assignedRunway ?? a?.expectedRunway) ?? s.runway;
    const distance = a ? Math.hypot(a.pos.x - runway.x1, a.pos.y - runway.y1) / nm : 0;
    const peers = a ? traffic.filter(b => b !== a && b.altitude > 0 && !Separation.exempt(a, b)) : [];
    const nearest = peers.reduce((min, b) => Math.min(min, Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y) / nm), 10);
    const cpa = peers.filter(b => Separation.verticalGap(a, b) < 1000).reduce((min, b) => Math.min(min, Separation.closestApproach(a, b, 600).distance / nm), 10);
    const stormDistance = a ? s.weather.storms.reduce((min, storm) => Math.min(min, (Math.hypot(a.pos.x - storm.pos.x, a.pos.y - storm.pos.y) - storm.radius) / nm), 10) : 10;
    const age = a ? s.simulation.stepCount - (controller.stateSince.get(a)?.step ?? 0) : 0;
    const oneHot = this.ACTIONS.map(type => type === candidate.type ? 1 : 0);
    const features = [distance / 15, (a?.altitude ?? 0) / 12000, (a?.vel.mag() ?? 0) / 2, age / 3600,
      traffic.length / 20, s.runwayController.blockedBy(runway.id, a) ? 1 : 0, nearest / 10, cpa / 10,
      controller.nearestArrival(runway, a) / 15, a?.emergency ? 1 : 0, candidate.priority / 10,
      stormDistance / 10, a?.operation === 'ARRIVAL' ? 1 : 0];
    return [...oneHot, ...features].map(value => Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0);
  }
  static rank(controller, candidates, brain) {
    return candidates.map(candidate => {
      const inputs = this.inputsFor(controller, candidate);
      const score = brain ? brain.predict(inputs)[0] : candidate.priority;
      return { ...candidate, inputs, score };
    }).sort((a, b) => b.score - a.score);
  }
  /** A transparent warm start: transmit urgency through neuron 0 of each layer.
   * Evolution still changes all weights. Other individuals start randomly. */
  static bootstrap(hiddenLayers) {
    const brain = new NeuralNetwork({ inputs: this.INPUTS, hiddenLayers, outputs: 1, random: () => .5 });
    for (const matrix of [...brain.weights, ...brain.biases]) for (const row of matrix) row.fill(0);
    brain.weights[0][0][23] = 2; // candidate priority / 10
    for (let i = 1; i < brain.weights.length; i++) brain.weights[i][0][0] = 1.5;
    return brain;
  }
}
globalThis.ATCPolicy = ATCPolicy;
