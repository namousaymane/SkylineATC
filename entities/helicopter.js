/** Rotorcraft using the same Vehicle integration and aircraft navigation orders. */
class Helicopter extends ModelAircraft {
  constructor(x, y, options = {}) {
    super(x, y, { modelId: 'H145', maxForce: .055, maxSpeed: .8, radius: 6, ...options });
    this.operation = 'HELICOPTER';
    this.heliPad = options.heliPad ?? { x, y };
    this.state = 'PARKED';
    this.altitude = 0;
    this.assignedAltitude = 700;
  }

  takeOff() {
    if (this.state !== 'PARKED' || this.operation !== 'HELICOPTER') return false;
    this.altitude = 700; this.assignedAltitude = 700; this.state = 'AIRBORNE';
    this.maxSpeed = this.model.cruise;
    return true;
  }

  returnToPad() {
    if (this.operation !== 'HELICOPTER' || this.altitude <= 0 || this.state === 'HELI_RETURN') return false;
    this.guidance = null; this.airNavigation = null; this.path = null;
    this.target = { ...this.heliPad }; this.arrivalTarget = true;
    this.state = 'HELI_RETURN'; this.maxSpeed = this.model.cruise;
    this.rayonZoneDeFreinage = 55;
    return true;
  }

  simulateStep(context = {}) {
    super.simulateStep(context);
    if (this.state === 'HELI_RETURN' &&
      Math.hypot(this.pos.x - this.heliPad.x, this.pos.y - this.heliPad.y) < 4 && this.vel.mag() < .08) {
      this.target = null; this.altitude = 0; this.assignedAltitude = 0; this.state = 'PARKED';
    }
  }
}
globalThis.Helicopter = Helicopter;
