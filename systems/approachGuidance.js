/** Simplified, screen-scale ILS. Distances are pixels, vertical levels feet. */
class ApproachGuidance {
  constructor(runway, controller, options = {}) {
    const length = Math.hypot(runway.x2 - runway.x1, runway.y2 - runway.y1);
    if (!(length > 0)) throw new Error('Runway must have a nonzero length');
    this.runway = runway;
    this.controller = controller;
    this.unit = { x: (runway.x2 - runway.x1) / length, y: (runway.y2 - runway.y1) / length };
    this.length = length;
    this.approachDistance = options.approachDistance ?? 300;
    this.interceptAltitude = options.interceptAltitude ?? 1800;
    this.verticalStep = options.verticalStep ?? 15;
    this.touchdownSpeed = options.touchdownSpeed ?? 1.3;
    this.rolloutPoint = this.point(length * 0.7);
  }

  point(along) {
    return createVector(this.runway.x1 + this.unit.x * along, this.runway.y1 + this.unit.y * along);
  }

  geometry(position) {
    const dx = position.x - this.runway.x1;
    const dy = position.y - this.runway.y1;
    return { along: dx * this.unit.x + dy * this.unit.y,
      lateral: -dx * this.unit.y + dy * this.unit.x };
  }

  clear(aircraft) {
    if (aircraft.altitude <= 0 || !['CRUISE', 'VECTORING'].includes(aircraft.state)) return false;
    if (this.geometry(aircraft.pos).along >= 0) return false;
    if (!this.controller.reserve(this.runway.id, aircraft)) return false;
    aircraft.guidance = this;
    aircraft.path = null;
    aircraft.target = null;
    aircraft.state = 'APPROACH';
    aircraft.approachSpeed = aircraft.maxSpeed;
    return true;
  }

  goAround(aircraft, reason = 'CONTROLLER') {
    if (!['APPROACH', 'FINAL'].includes(aircraft.state)) return false;
    this.controller.release(this.runway.id, aircraft);
    aircraft.state = 'GO_AROUND';
    aircraft.goAroundReason = reason;
    aircraft.assignedAltitude = this.interceptAltitude;
    aircraft.maxSpeed = aircraft.approachSpeed;
    return true;
  }

  prepare(aircraft, context = {}) {
    const geometry = this.geometry(aircraft.pos);
    if (aircraft.state === 'GO_AROUND') {
      aircraft.altitude = Math.min(this.interceptAltitude, aircraft.altitude + this.verticalStep);
      aircraft.target = this.point(Math.max(this.length + 300, geometry.along + 200));
      return;
    }
    if (['APPROACH', 'FINAL'].includes(aircraft.state)) {
      if (typeof WeatherEffects !== 'undefined' &&
        WeatherEffects.isUnstableApproach(aircraft, context.obstacles ?? [])) {
        this.goAround(aircraft, 'WEATHER_UNSTABLE');
        return this.prepare(aircraft, context);
      }
      if (!this.controller.owns(this.runway.id, aircraft)) {
        this.goAround(aircraft, 'RUNWAY_UNAVAILABLE');
        return this.prepare(aircraft);
      }
      if (geometry.along >= -60) aircraft.state = 'FINAL';
      const targetAltitude = this.interceptAltitude * Math.min(1, Math.max(0, -geometry.along / this.approachDistance));
      aircraft.assignedAltitude = targetAltitude;
      aircraft.altitude += Math.max(-this.verticalStep, Math.min(this.verticalStep, targetAltitude - aircraft.altitude));
      aircraft.ilsStatus = { ...geometry, targetAltitude };
      const fraction = Math.min(1, Math.max(0, -geometry.along / this.approachDistance));
      aircraft.maxSpeed = this.touchdownSpeed + (aircraft.approachSpeed - this.touchdownSpeed) * fraction;
      aircraft.path = [this.point(-this.approachDistance), this.point(this.length)];
      return;
    }
    if (['TOUCHDOWN', 'ROLL_OUT'].includes(aircraft.state)) {
      aircraft.state = aircraft.state === 'TOUCHDOWN' ? 'ROLL_OUT' : aircraft.state;
      aircraft.path = null;
      aircraft.target = this.rolloutPoint;
      aircraft.arrivalTarget = true;
    }
  }

  finish(aircraft) {
    if (['APPROACH', 'FINAL'].includes(aircraft.state)) {
      const geometry = this.geometry(aircraft.pos);
      if (geometry.along >= 0) {
        if (Math.abs(geometry.lateral) > this.runway.width / 3 || aircraft.altitude > 30) {
          this.goAround(aircraft, 'UNSTABLE_APPROACH');
        } else {
          aircraft.state = 'TOUCHDOWN';
          aircraft.altitude = 0;
        }
      }
    } else if (aircraft.state === 'ROLL_OUT' &&
      Math.hypot(aircraft.pos.x - this.rolloutPoint.x, aircraft.pos.y - this.rolloutPoint.y) < 1 && aircraft.vel.mag() < 0.03) {
      aircraft.state = 'STOPPED';
      // Reservation remains: the aircraft is still physically on the runway.
    }
  }
}
if (typeof globalThis !== 'undefined') globalThis.ApproachGuidance = ApproachGuidance;
