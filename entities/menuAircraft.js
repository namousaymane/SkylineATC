/** Decorative aircraft use the same immutable Vehicle locomotion as game entities. */
class MenuAircraft extends Vehicle {
  constructor(x, y, target, options = {}) {
    super(x, y);
    this.target = createVector(target.x, target.y);
    this.maxSpeed = options.speed ?? .8; this.maxForce = .012;
    // Explicit initialization of a newly created background aircraft.
    this.vel.set(target.x - x, target.y - y).setMag(this.maxSpeed);
    this.size = options.size ?? 15;
  }
  simulateStep() { super.applyForce(super.seek(this.target)); super.update(); }
  render(c) {
    c.save(); c.translate(this.pos.x, this.pos.y); c.rotate(this.vel.heading());
    const s = this.size; c.fillStyle = '#adbbcc';
    c.beginPath();
    for (const [i, p] of [[1,0],[.55,.07],[-.05,.08],[-.42,.7],[-.58,.7],[-.34,.07],[-.74,.05],[-.88,.25],[-1,.25],[-.92,0],[-1,-.25],[-.88,-.25],[-.74,-.05],[-.34,-.07],[-.58,-.7],[-.42,-.7],[-.05,-.08],[.55,-.07]].entries()) {
      if (i === 0) c.moveTo(p[0] * s, p[1] * s); else c.lineTo(p[0] * s, p[1] * s);
    }
    c.closePath(); c.fill();
    for (const [y, color] of [[-.66, '#ed6d6b'], [.66, '#74dfaf']]) {
      c.fillStyle = color; c.shadowColor = color; c.shadowBlur = 7;
      c.beginPath(); c.arc(-s * .47, s * y, 1.1, 0, Math.PI * 2); c.fill();
    }
    c.restore();
  }
}
globalThis.MenuAircraft = MenuAircraft;
