class FighterJet extends Airplane {
  constructor(x, y, options = {}) {
    super(x, y, { maxSpeed: 4.2, maxForce: 0.18, radius: 9, ...options });
    this.aircraftType = 'FIGHTER_JET';
    this.interceptTarget = options.interceptTarget ?? null;
    this.mission = options.mission ?? 'PATROL';
    this.nominalInterceptSpeed = this.maxSpeed;
    this.exitTarget = null;
  }

  setInterceptTarget(target) {
    if (this.interceptTarget?.escortPartner === this) this.interceptTarget.escortPartner = null;
    this.interceptTarget = target ?? null;
    this.escortPartner = target ?? null;
    if (target) target.escortPartner = this;
    this.mission = target ? 'INTERCEPT' : 'PATROL';
    return this.interceptTarget;
  }

  buildSteering(context = {}) {
    const contributions = super.buildSteering(context);
    const target = this.interceptTarget;
    if (target && !target.destroyed) {
      const distance = Math.hypot(target.pos.x - this.pos.x, target.pos.y - this.pos.y);
      const heading = target.vel.magSq() > .001 ? target.vel.heading() : (target.heading ?? 0) * Math.PI / 180;
      const lateral = Math.max(40, (target.r + this.r) * 3);
      const slot = createVector(target.pos.x - Math.sin(heading) * lateral, target.pos.y + Math.cos(heading) * lateral);
      this.escortSlot = slot;
      this.altitude += Math.max(-8, Math.min(8, target.altitude - this.altitude));
      if (this.mission === 'INTERCEPT') {
        this.maxSpeed = this.nominalInterceptSpeed;
        contributions.push({ name: 'seek', force: super.seek(slot), weight: .8 });
        contributions.push({ name: 'pursuit', force: Pursuit.forceFor(this, { pos: slot, vel: target.vel }), weight: .2 });
      } else {
        this.maxSpeed = Math.min(this.nominalInterceptSpeed, Math.max(.6, target.vel.mag()) + Math.min(.8, distance / 100));
        // Offset pursuit plus velocity matching follows the civil at its side.
        const predicted = slot.copy().add(target.vel.copy().mult(20));
        const matching = target.vel.copy().add(slot.copy().sub(this.pos).mult(.025)).sub(this.vel).limit(this.maxForce);
        contributions.push({ name: 'offsetPursuit', force: super.seek(predicted), weight: .2 });
        contributions.push({ name: 'leaderFollowing', force: matching, weight: .8 });
      }
    }
    return contributions;
  }

  departEscort(exit) {
    this.setInterceptTarget(null); this.mission = 'EXIT'; this.state = 'AIRBORNE';
    this.exitTarget = exit; this.target = exit; this.path = null; this.arrivalTarget = false;
    this.assignedAltitude = Math.max(3000, this.altitude + 1000); this.maxSpeed = this.nominalInterceptSpeed;
  }

  simulateStep(context = {}) {
    if (this.mission === 'EXIT' && !this.destroyed) this.altitude += Math.max(-8, Math.min(8, this.assignedAltitude - this.altitude));
    super.simulateStep(context);
    if (this.interceptTarget && this.mission === 'INTERCEPT' && this.escortSlot && Math.hypot(this.escortSlot.x - this.pos.x, this.escortSlot.y - this.pos.y) < 100) this.mission = 'ESCORT';
  }
}

if (typeof globalThis !== 'undefined') globalThis.FighterJet = FighterJet;
if (typeof module !== 'undefined' && module.exports) module.exports = FighterJet;
