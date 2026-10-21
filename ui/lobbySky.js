/** Isolated menu scene. Hidden menus stop rendering and never accrue catch-up time. */
class LobbySky {
  constructor(canvas) {
    this.canvas = canvas; this.context = canvas.getContext('2d');
    this.simulation = new Simulation(); this.width = 0; this.height = 0;
    this.stars = []; this.active = false;
    this.reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  }
  resize(width, height) {
    this.width = width; this.height = height;
    const ratio = Math.min(2, globalThis.devicePixelRatio ?? 1);
    this.canvas.width = Math.round(width * ratio); this.canvas.height = Math.round(height * ratio);
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const random = new SeededRandom(77201);
    this.stars = Array.from({ length: Math.min(420, Math.floor(width * height / 2400)) }, () => ({
      x: random.next() * width, y: random.next() * height, radius: .35 + random.next() * 1.1, alpha: .2 + random.next() * .7
    }));
    this.simulation.entities = [];
    for (let i = 0; i < 4; i++) this.spawn(i, true);
    this.simulation.lastTime = null; this.simulation.accumulator = 0;
  }
  spawn(index, initial = false) {
    const right = index % 2 === 0;
    const x = initial ? this.width * (.08 + index * .28) : right ? -50 : this.width + 50;
    const y = this.height * [.028, .972, .19, .82][index % 4];
    this.simulation.add(new MenuAircraft(x, y, { x: right ? this.width + 100 : -100, y: y + (index < 2 ? 0 : right ? 70 : -60) }, { speed: .55 + index * .14, size: 13 + index * 2 }));
  }
  update(active, now = performance.now() / 1000) {
    if (!active) { this.active = false; this.simulation.lastTime = null; this.simulation.accumulator = 0; return; }
    const width = this.canvas.clientWidth; const height = this.canvas.clientHeight;
    if (!width || !height) return;
    if (width !== this.width || height !== this.height) this.resize(width, height);
    if (this.reducedMotion && this.active) return;
    this.active = true;
    if (!this.reducedMotion) this.simulation.update(now);
    const c = this.context; c.clearRect(0, 0, width, height);
    for (const star of this.stars) {
      c.fillStyle = `rgba(209,225,255,${star.alpha})`; c.beginPath(); c.arc(star.x, star.y, star.radius, 0, Math.PI * 2); c.fill();
    }
    this.simulation.entities.forEach((plane, index) => {
      plane.render(c);
      if (plane.pos.x < -90 || plane.pos.x > width + 90) {
        // Explicit removal and creation at a screen boundary; no moving entity is teleported.
        this.simulation.remove(plane); this.spawn(index);
      }
    });
  }
}
globalThis.LobbySky = LobbySky;
