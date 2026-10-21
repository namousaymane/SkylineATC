class SeededRandom {
  constructor(seed = Date.now()) { this.seed = Number(seed) >>> 0; this.state = this.seed; }
  next() { this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0; return this.state / 4294967296; }
  between(min, max) { return min + (max - min) * this.next(); }
  pick(items) { return items[Math.floor(this.next() * items.length)]; }
}
globalThis.SeededRandom = SeededRandom;
