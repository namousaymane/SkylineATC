/** Explicit approach clearance, landing clearance and a decision point. */
class TowerApproach extends ApproachGuidance {
  constructor(runway, controller, options = {}) {
    super(runway, controller, { ...options, approachDistance: options.approachDistance ?? 180, touchdownSpeed: options.touchdownSpeed ?? .9 });
    this.manualLanding = true;
    this.unitsPerNm = options.unitsPerNm ?? 60;
    this.approachDistance = options.approachDistance ?? this.unitsPerNm * 3;
  }
  navigationFix() { return { ...this.point(-this.approachDistance), id: `FINAL-${this.runway.id}`, type: 'FINAL', training: true, threshold: this.point(0), runwayId: this.runway.id, distanceNm: this.approachDistance / this.unitsPerNm }; }
  vectorRoute(aircraft) {
    const g = this.geometry(aircraft.pos); const d = this.approachDistance; const side = g.lateral < 0 ? -1 : 1;
    const offset = Math.max(this.unitsPerNm * 1.5, this.runway.width * 4);
    const p = (along, lateral) => { const v = this.point(along); return { x: v.x - this.unit.y * lateral, y: v.y + this.unit.x * lateral }; };
    // Keep downwind outside the runway corridor; join via base, never direct across the field.
    if (g.along > -d || Math.abs(g.lateral) > offset) return [
      p(g.along, side * Math.max(offset, Math.abs(g.lateral))),
      p(-d - this.unitsPerNm, side * offset),
      p(-d - this.unitsPerNm * .5, side * this.unitsPerNm * .5),
      p(-d, 0), p(-d + this.unitsPerNm * .5, 0)
    ];
    return [p(-d - this.unitsPerNm, 0), p(-d, 0), p(-d + this.unitsPerNm * .5, 0)];
  }
  clear(aircraft) {
    if (aircraft.altitude <= 0 || !['INBOUND', 'HOLDING', 'VECTORING', 'GO_AROUND', 'NAV_HEADING', 'NAV_DIRECT', 'NAV_HOLD_ENTRY', 'NAV_HOLD', 'AIRBORNE'].includes(aircraft.state)) return false;
    aircraft.guidance = this; aircraft.state = 'VECTORING'; aircraft.landingCleared = false;
    aircraft.approachSpeed = aircraft.model?.cruise ?? aircraft.maxSpeed;
    aircraft.interceptPoint = this.point(-this.approachDistance);
    aircraft.approachRoute = this.vectorRoute(aircraft); aircraft.approachRouteIndex = 0;
    aircraft.holdPosition = false;
    return true;
  }
  prepare(aircraft, context = {}) {
    if (aircraft.state === 'VECTORING') {
      const route = aircraft.approachRoute; const index = aircraft.approachRouteIndex;
      aircraft.target = route[index]; aircraft.path = null; aircraft.arrivalTarget = false;
      aircraft.maxSpeed = aircraft.approachSpeed;
      const turnRadius = aircraft.maxSpeed / (typeof FlightSteering !== 'undefined' ? FlightSteering.turnRate(aircraft) : .01);
      const capture = index < route.length - 1 ? Math.max(9, aircraft.maxSpeed * 6, turnRadius * .85) : Math.max(9, aircraft.maxSpeed * 6);
      const current = this.geometry(aircraft.pos);
      if (index === route.length - 1 && current.along > this.geometry(route[index]).along - turnRadius) {
        // Continue intercepting the centreline ahead; do not orbit a missed fix.
        aircraft.target = this.point(Math.max(this.geometry(route[index]).along, current.along + turnRadius));
      }
      if (Math.hypot(aircraft.pos.x - route[index].x, aircraft.pos.y - route[index].y) < capture || (index === route.length - 1 && current.along >= this.geometry(route[index]).along)) {
        if (index < route.length - 1) { aircraft.approachRouteIndex++; return; }
        const g = this.geometry(aircraft.pos); const speed = aircraft.vel.mag();
        const aligned = speed > .01 && (aircraft.vel.x * this.unit.x + aircraft.vel.y * this.unit.y) / speed > .94;
        if (!aligned || Math.abs(g.lateral) > Math.max(3, this.runway.width / 4)) return;
        aircraft.state = 'APPROACH'; aircraft.target = null; this.interceptAltitude = aircraft.altitude;
        this.descentDistance = Math.max(1, -g.along);
      }
      return;
    }
    if (['APPROACH', 'FINAL'].includes(aircraft.state)) {
      const geometry = this.geometry(aircraft.pos);
      if (geometry.along > -55 && !aircraft.landingCleared) { this.goAround(aircraft, 'NO_LANDING_CLEARANCE'); return; }
      if (aircraft.landingCleared && !this.controller.owns(this.runway.id, aircraft)) { this.goAround(aircraft, 'RUNWAY_UNAVAILABLE'); return; }
      if (typeof WeatherEffects !== 'undefined' && WeatherEffects.isUnstableApproach(aircraft, context.obstacles ?? [])) { this.goAround(aircraft, 'WEATHER_UNSTABLE'); return; }
      aircraft.state = geometry.along > -75 ? 'FINAL' : 'APPROACH';
      const fraction = Math.max(0, Math.min(1, -geometry.along / (this.descentDistance ?? this.approachDistance)));
      const targetAltitude = this.interceptAltitude * fraction;
      aircraft.assignedAltitude = targetAltitude;
      aircraft.altitude += Math.max(-30, Math.min(30, targetAltitude - aircraft.altitude));
      aircraft.ilsStatus = { ...geometry, targetAltitude };
      aircraft.maxSpeed = this.touchdownSpeed + (aircraft.approachSpeed - this.touchdownSpeed) * fraction;
      aircraft.path = [this.point(-this.approachDistance), this.point(this.length)]; aircraft.pathArriveAtEnd = false;
      aircraft.pathLookAhead = 25; aircraft.pathPredictionFrames = 8; return;
    }
    if (aircraft.state === 'GO_AROUND') {
      aircraft.altitude = Math.min(2200, aircraft.altitude + 15); aircraft.assignedAltitude = 2200;
      aircraft.maxSpeed = aircraft.approachSpeed;
      aircraft.target = this.point(Math.max(this.length + 180, this.geometry(aircraft.pos).along + 80)); aircraft.path = null; aircraft.arrivalTarget = false;
    }
  }
  finish(aircraft) {
    if (!['APPROACH', 'FINAL'].includes(aircraft.state)) return;
    const g = this.geometry(aircraft.pos);
    if (g.along < 0) return;
    if (!aircraft.landingCleared || !this.controller.owns(this.runway.id, aircraft) || Math.abs(g.lateral) > this.runway.width / 3 || aircraft.altitude > 40) {
      this.goAround(aircraft, 'UNSTABLE_APPROACH'); return;
    }
    aircraft.altitude = 0; aircraft.state = 'TOUCHDOWN'; aircraft.path = null; aircraft.target = null;
  }
  goAround(aircraft, reason = 'CONTROLLER') {
    if (!['VECTORING', 'APPROACH', 'FINAL'].includes(aircraft.state)) return false;
    this.controller.release(this.runway.id, aircraft); aircraft.state = 'GO_AROUND'; aircraft.landingCleared = false;
    aircraft.goAroundReason = reason; aircraft.goAroundAge = 0; aircraft.goAroundAnnounced = false; aircraft.holdPosition = false; aircraft.maxSpeed = aircraft.approachSpeed;
    return true;
  }
}
globalThis.TowerApproach = TowerApproach;
