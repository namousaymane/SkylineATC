class Simulation {
  constructor(options = {}) {
    this.entities = [];
    this.paused = false;
    this.speed = options.speed ?? 1;
    this.maxCatchUpSteps = options.maxCatchUpSteps ?? 240;
    this.path = options.path ?? null;
    this.obstacles = options.obstacles ?? [];
    this.systems = [];
    this.accumulator = 0;
    this.lastTime = null;
    this.stepCount = 0;
    this.step = options.step ?? (1 / 60);
    if (!(Number.isFinite(this.step) && this.step > 0)) throw new Error('Invalid simulation step');
    if (!Number.isInteger(this.maxCatchUpSteps) || this.maxCatchUpSteps < 1) throw new Error('Invalid catch-up limit');
  }

  add(entity) {
    if (!this.entities.includes(entity)) this.entities.push(entity);
    return entity;
  }

  remove(entity) {
    this.entities = this.entities.filter(item => item !== entity);
  }

  setEnvironment({ path = this.path, obstacles = this.obstacles } = {}) {
    this.path = path;
    this.obstacles = obstacles;
  }

  addSystem(system) {
    if (system && !this.systems.includes(system)) this.systems.push(system);
    return system;
  }

  update(nowSeconds) {
    if (!Number.isFinite(nowSeconds)) throw new Error('Invalid simulation time');
    if (!Number.isFinite(this.speed) || this.speed < 0 || this.speed > 20) throw new Error('Invalid simulation speed');
    if (this.lastTime === null) this.lastTime = nowSeconds;
    const elapsed = Math.min(0.25, Math.max(0, nowSeconds - this.lastTime));
    this.lastTime = nowSeconds;
    if (this.paused) return;
    this.accumulator += elapsed * this.speed;
    let steps = 0;
    while (!this.paused && this.accumulator >= this.step && steps < this.maxCatchUpSteps) {
      // All neighbors are observed at the same instant, regardless of update order.
      const peers = this.entities.filter(entity => !entity.destroyed).map(entity => entity.pos ? {
        source: entity, callsign: entity.callsign, altitude: entity.altitude,
        assignedAltitude: entity.assignedAltitude, altitudeOrderActive: entity.altitudeOrderActive,
        pos: entity.pos.copy(), vel: entity.vel.copy()
      } : entity);
      const context = { peers, path: this.path, obstacles: this.obstacles };
      for (const system of this.systems) system.beforeStep?.(context);
      if (this.paused) break;
      for (const entity of this.entities) entity.simulateStep(context);
      for (const system of this.systems) system.afterStep?.(context);
      this.accumulator -= this.step;
      this.stepCount += 1;
      steps += 1;
    }
    if (this.paused) this.accumulator = 0;
    // Bound the backlog if a deliberately low catch-up budget is configured.
    if (steps === this.maxCatchUpSteps && this.accumulator >= this.step) this.accumulator %= this.step;
  }

  togglePause() {
    this.paused = !this.paused;
    return this.paused;
  }
}

if (typeof globalThis !== 'undefined') globalThis.Simulation = Simulation;
if (typeof module !== 'undefined' && module.exports) module.exports = Simulation;
