class Evasion {
  static forceFor(evader, threat, options = {}) {
    if (!threat?.pos) return createVector(0, 0);
    const predicted = Pursuit.predictedPosition(evader, threat, options);
    if (!predicted) return createVector(0, 0);
    return evader.flee(predicted).limit(options.maxForce ?? evader.maxForce);
  }
}

if (typeof globalThis !== 'undefined') globalThis.Evasion = Evasion;
if (typeof module !== 'undefined' && module.exports) module.exports = Evasion;
