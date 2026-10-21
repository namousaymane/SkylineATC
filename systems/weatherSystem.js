class WeatherSystem {
  constructor(simulation, options = {}) {
    this.simulation = simulation;
    this.storms = [];
    this.bounds = options.bounds ?? null;
  }

  addStorm(x, y, options = {}) {
    const storm = x instanceof StormCell ? x : new StormCell(x, y, {
      ...options,
      bounds: options.bounds ?? this.bounds
    });
    this.storms.push(storm);
    this.simulation.add(storm);
    return storm;
  }

  removeStorm(storm) {
    this.storms = this.storms.filter(item => item !== storm);
    this.simulation.remove(storm);
  }

  beforeStep() {
    const tick = this.simulation.stepCount;
    for (const storm of this.storms) {
      const variation = 0.82 + 0.18 * Math.sin(tick * 0.035 + storm.phase);
      storm.intensity = Math.max(0, storm.baseIntensity * variation);
    }
  }
}

if (typeof globalThis !== 'undefined') globalThis.WeatherSystem = WeatherSystem;
if (typeof module !== 'undefined' && module.exports) module.exports = WeatherSystem;
