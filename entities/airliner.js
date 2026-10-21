class Airliner extends Airplane {
  constructor(x, y, options = {}) {
    super(x, y, { maxSpeed: 2.2, maxForce: 0.09, radius: 14, ...options });
    this.aircraftType = 'AIRLINER';
  }
}
if (typeof globalThis !== 'undefined') globalThis.Airliner = Airliner;
