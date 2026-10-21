class Airplane extends Vehicle {
  static STATES = Object.freeze({
    CRUISE: 'CRUISE',
    VECTORING: 'VECTORING',
    APPROACH: 'APPROACH',
    FINAL: 'FINAL',
    TOUCHDOWN: 'TOUCHDOWN',
    ROLL_OUT: 'ROLL_OUT',
    STOPPED: 'STOPPED',
    GO_AROUND: 'GO_AROUND',
    PUSHBACK: 'PUSHBACK',
    TAXIING: 'TAXIING',
    WAITING_RUNWAY_CROSSING: 'WAITING_RUNWAY_CROSSING',
    HOLD_SHORT: 'HOLD_SHORT',
    LINE_UP_WAIT: 'LINE_UP_WAIT',
    CLEARED_TAKEOFF: 'CLEARED_TAKEOFF',
    TAKEOFF_ROLL: 'TAKEOFF_ROLL',
    ROTATION: 'ROTATION',
    CLIMB_OUT: 'CLIMB_OUT',
    AIRBORNE: 'AIRBORNE',
    PARKED: 'PARKED'
  });

  constructor(x, y, options = {}) {
    super(x, y);
    this.callsign = options.callsign ?? 'SKY001';
    this.state = options.state ?? Airplane.STATES.CRUISE;
    this.maxSpeed = options.maxSpeed ?? 3;
    this.maxForce = options.maxForce ?? 0.12;
    this.r = options.radius ?? 12;
    this.altitude = options.altitude ?? 2000;
    this.assignedAltitude = options.assignedAltitude ?? this.altitude;
    this.altitudeOrderActive = options.altitudeOrderActive ?? options.assignedAltitude !== undefined;
    this.heading = options.heading ?? 0;
    this.target = null;
    this.path = null;
    this.guidance = null;
    this.arrivalTarget = false;
    this.groundSpeed = options.groundSpeed ?? 1.1;
    this.archiveOnAirborne = options.archiveOnAirborne ?? false;
    this.squawk = options.squawk ?? '7000';
    this.emergency = null;
    this.radioLost = false;
    this.engineFailure = false;
    this.nominalMaxSpeed = this.maxSpeed;
    this.smokeTimer = 0;
    this.smokeOrigin = null;
    this.behaviorWeights = {
      navigation: 1,
      arrival: 1,
      separation: 1,
      weather: 1,
      groundSeparation: 1,
      ...options.behaviorWeights
    };
    this.tcasUnitsPerNm = options.tcasUnitsPerNm ?? 370.4;
    this.tcasAdvisory = null;
    this.destroyed = false;
    this.explosionTimer = 0;
    this.explosionOrigin = null;
  }

  setTarget(target, arrival = false) {
    if (this.guidance) throw new Error('Use goAround before changing an active approach');
    this.target = target;
    this.path = null;
    this.arrivalTarget = arrival;
    this.state = arrival ? Airplane.STATES.APPROACH : Airplane.STATES.VECTORING;
  }

  declareEmergency(code = '7700', reason = 'UNSPECIFIED') {
    if (!['7700', '7600', '7500'].includes(String(code))) throw new Error('Unsupported emergency squawk');
    this.squawk = String(code);
    this.emergency = { code: this.squawk, reason, age: 0 };
    this.radioLost = ['7600', '7500'].includes(this.squawk);
    return this.emergency;
  }

  failEngine(reason = 'ENGINE_FAILURE') {
    this.engineFailure = true;
    this.declareEmergency('7700', reason);
    this.maxSpeed = Math.min(this.maxSpeed, this.nominalMaxSpeed * 0.55);
    return true;
  }

  clearEmergency() {
    this.emergency = null;
    this.radioLost = false;
    this.squawk = '7000';
    return true;
  }

  buildSteering(context = {}) {
    const contributions = [];
    this.pathTelemetry = null;
    if (this.trafficHold) {
      const braking = this.vel.copy().mult(-1).limit(this.maxForce);
      contributions.push({ name: 'trafficHold', force: braking, weight: 1 });
    }
    const path = this.path ?? (!this.guidance && !this.target ? context.path : null);
    if (path) {
      contributions.push({ name: 'pathFollowing', force: PathFollowing.forceFor(this, path,
        { arriveAtEnd: this.pathArriveAtEnd ?? !this.guidance, lookAhead: this.pathLookAhead ?? 55, predictionFrames: this.pathPredictionFrames ?? 15 }), weight: this.behaviorWeights.navigation });
    } else if (this.target) {
      const targetVector = createVector(this.target.x, this.target.y);
      const force = this.arrivalTarget ? super.arrive(targetVector) : super.seek(targetVector);
      contributions.push({ name: this.arrivalTarget ? 'arrival' : 'navigation', force,
        weight: this.arrivalTarget ? this.behaviorWeights.arrival : this.behaviorWeights.navigation });
    }
    if (typeof Separation !== 'undefined') {
      const airborne = this.altitude > 0 && ['CRUISE', 'INBOUND', 'HOLDING', 'VECTORING', 'APPROACH', 'FINAL', 'GO_AROUND', 'CLIMB_OUT', 'AIRBORNE', 'HELI_RETURN', 'NAV_HEADING', 'NAV_DIRECT', 'NAV_HOLD_ENTRY', 'NAV_HOLD'].includes(this.state);
      this.tcasAdvisory = airborne ? Separation.advisoryFor(this, context.peers || []) : null;
      const force = Separation.forceFor(this, context.peers || [], airborne
        ? { airborneOnly: true, lookAhead: 120, radius: Math.max(150, this.tcasUnitsPerNm * .75) }
        : { radius: this.groundSeparationRadius ?? 42, verticalThreshold: Infinity, maxForce: this.maxForce });
      if (force.magSq() > 0) contributions.push({ name: 'separation', force, weight: this.behaviorWeights.separation });
    }
    if (this.altitude > 0 && typeof ObstacleAvoidance !== 'undefined' && context.obstacles) {
      const lookAhead = this.altitude > 0 && typeof FlightSteering !== 'undefined'
        ? Math.max(90, this.vel.mag() / FlightSteering.turnRate(this) * 2) : 90;
      const force = ObstacleAvoidance.forceFor(this, context.obstacles, { lookAhead });
      if (force.magSq() > 0) contributions.push({ name: 'obstacleAvoidance', force, weight: this.behaviorWeights.weather });
    } else { this.avoidanceObstacle = null; this.avoidanceThreat = 0; }
    if (typeof WeatherEffects !== 'undefined' && context.obstacles) {
      const force = WeatherEffects.forceFor(this, context.obstacles, { suppressDuringAvoidance: true });
      if (force.magSq() > 0) contributions.push({ name: 'weatherTurbulence', force, weight: this.behaviorWeights.weather });
    }
    return contributions;
  }

  simulateStep(context = {}) {
    if (this.altitude <= 0) this.tcasAdvisory = null;
    if (this.destroyed) {
      this.explosionTimer = Math.max(0, this.explosionTimer - 1);
      return;
    }
    if (this.state === Airplane.STATES.PARKED || this.state === Airplane.STATES.STOPPED) return;
    const previousState = this.state;
    this.guidance?.prepare(this, context);
    if (this.engineFailure) this.maxSpeed = Math.min(this.maxSpeed, this.nominalMaxSpeed * .55);
    const contributions = this.buildSteering(context);
    // Safety steering has priority over a navigation force pointing at the threat.
    const tcas = contributions.filter(item => item.name === 'separation' && this.tcasAdvisory?.level === 'RA');
    const weatherAvoidance = contributions.filter(item => item.name === 'obstacleAvoidance');
    const safety = tcas.length ? tcas : weatherAvoidance;
    const commanded = SteeringComposer.combine(this, safety.length ? safety.map(item => ({ ...item, weight: 1 })) : contributions);
    const force = typeof FlightSteering !== 'undefined' ? FlightSteering.constrain(this, commanded) : commanded;
    force.limit(this.maxForce);
    this.telemetry = { force: { x: force.x, y: force.y }, components: contributions.map(item => ({ name: item.name, x: item.force.x, y: item.force.y, weight: item.weight })), behaviors: [...contributions.map(item => item.name), ...(this.pathTelemetry?.arriving ? ['arrival'] : [])] };
    super.applyForce(force);
    super.update();
    if (!this.headingLocked && this.vel.magSq() > 0.0001) this.heading = (this.vel.heading() * 180 / Math.PI + 360) % 360;
    this.guidance?.finish(this);
    if (previousState !== Airplane.STATES.TOUCHDOWN && this.state === Airplane.STATES.TOUCHDOWN) {
      this.smokeTimer = 54;
      this.smokeOrigin = this.pos.copy();
    }
    if (this.smokeTimer > 0) this.smokeTimer -= 1;
  }

  render() {
    push();
    if (this.destroyed) {
      translate(this.explosionOrigin?.x ?? this.pos.x, this.explosionOrigin?.y ?? this.pos.y);
      const age = Math.max(0, 1 - this.explosionTimer / 90);
      noStroke(); fill(255, 210, 80, 210 * (1 - age)); circle(0, 0, this.r * (2.5 + age * 2));
      fill(245, 95, 35, 180 * (1 - age)); circle(0, 0, this.r * (1.5 + age * 3));
      stroke(255, 225, 145, 190 * (1 - age)); strokeWeight(2);
      for (let i = 0; i < 8; i += 1) { const angle = i * Math.PI / 4; line(Math.cos(angle) * this.r, Math.sin(angle) * this.r, Math.cos(angle) * this.r * (2 + age * 2), Math.sin(angle) * this.r * (2 + age * 2)); }
      pop(); return;
    }
    if (this.smokeTimer > 0 && this.smokeOrigin) {
      const fade = Math.min(1, this.smokeTimer / 32);
      noStroke();
      for (let index = 0; index < 4; index += 1) {
        fill(245, 250, 246, 42 * fade);
        circle(this.smokeOrigin.x - index * 9, this.smokeOrigin.y + ((index % 2) ? 6 : -6), 8 + index * 4);
      }
    }
    translate(this.pos.x, this.pos.y);
    rotate(this.vel.magSq() > 0.0001 ? this.vel.heading() : radians(this.heading));
    const accent = this.emergency ? '#ff6b63' : this.state === Airplane.STATES.APPROACH || this.state === Airplane.STATES.FINAL ? '#f2bd5b' : this.aircraftType === 'REGIONAL_JET' ? '#9e8cf4' : '#42c9d8';
    noStroke(); fill(0, 0, 0, 80); ellipse(-2, 4, this.r * 2.7, this.r * .9);
    fill('#dce8e6'); stroke('#11282c'); strokeWeight(1);
    ellipse(0, 0, this.r * 2.25, this.r * .62);
    fill(accent); noStroke();
    quad(-this.r * .15, -this.r * .15, -this.r * .95, -this.r * .95, -this.r * .60, -this.r * .08, this.r * .20, -this.r * .08);
    quad(-this.r * .15, this.r * .15, -this.r * .95, this.r * .95, -this.r * .60, this.r * .08, this.r * .20, this.r * .08);
    fill('#7aaeb6'); ellipse(this.r * .50, 0, this.r * .5, this.r * .43);
    fill('#6b8c98'); ellipse(-this.r * .62, -this.r * .17, this.r * .16, this.r * .16); ellipse(-this.r * .62, this.r * .17, this.r * .16, this.r * .16);
    if (['PUSHBACK', 'TAXIING', 'HOLD_SHORT', 'LINE_UP_WAIT', 'TAKEOFF_ROLL', 'ROLL_OUT'].includes(this.state)) {
      fill('#192427'); ellipse(-this.r * .08, -this.r * .54, this.r * .18, this.r * .12); ellipse(-this.r * .08, this.r * .54, this.r * .18, this.r * .12);
    }
    fill(this.emergency ? '#ff5d5d' : '#d8f7e6'); circle(this.r * .96, -this.r * .14, 2.4);
    pop();
  }
}

if (typeof globalThis !== 'undefined') globalThis.Airplane = Airplane;
if (typeof module !== 'undefined' && module.exports) module.exports = Airplane;
