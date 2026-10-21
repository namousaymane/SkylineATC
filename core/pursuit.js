class Pursuit {
  static predictedPosition(chaser, target, options = {}) {
    if (!target?.pos) return null;
    const offset = createVector(target.pos.x - chaser.pos.x, target.pos.y - chaser.pos.y);
    const distance = offset.mag();
    const speed = Math.max(chaser.maxSpeed ?? 0, 1e-6);
    const prediction = Math.min(options.maxPrediction ?? 30, distance / speed);
    const velocity = target.vel?.copy?.() ?? createVector(0, 0);
    return target.pos.copy().add(velocity.mult(prediction));
  }

  static forceFor(chaser, target, options = {}) {
    const predicted = this.predictedPosition(chaser, target, options);
    if (!predicted) return createVector(0, 0);
    return chaser.seek(predicted);
  }
}

if (typeof globalThis !== 'undefined') globalThis.Pursuit = Pursuit;
if (typeof module !== 'undefined' && module.exports) module.exports = Pursuit;
