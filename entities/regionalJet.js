class RegionalJet extends Airplane {
  constructor(x, y, options = {}) {
    super(x, y, { maxSpeed: 2.6, maxForce: 0.12, radius: 11, ...options });
    this.aircraftType = 'REGIONAL_JET';
  }
}
if (typeof globalThis !== 'undefined') globalThis.RegionalJet = RegionalJet;
