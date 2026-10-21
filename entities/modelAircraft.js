class ModelAircraft extends Airplane {
  constructor(x, y, options = {}) {
    const model = AircraftModels[options.modelId ?? 'B738'];
    if (!model) throw new Error('Unknown aircraft model');
    super(x, y, { maxSpeed: model.cruise, maxForce: .07, radius: model.length * .13, ...options });
    this.model = model; this.aircraftType = model.id; this.modelId = model.id;
    this.groundSpeed = model.taxi; this.rayonZoneDeFreinage = 6;
    this.groundSeparationRadius = 5 + model.span * .07;
    this.behaviorWeights.separation = .35;
    this.operation = options.operation ?? 'ARRIVAL';
    this.routeIndex = 1; this.groundRoute = null; this.holdPosition = false;
    this.headingLocked = false;
  }

  buildSteering(context = {}) {
    if (this.holdPosition || this.trafficHold) {
      return [{ name: this.trafficHold ? 'trafficHold' : 'braking', force: this.vel.copy().mult(-1).limit(this.maxForce), weight: 1 }];
    }
    const contributions = super.buildSteering(context);
    if (this.operation === 'ARRIVAL' && this.wanderEnabled && this.state === 'INBOUND' && !this.airNavigation && !this.guidance) {
      const displacement = this.displaceRange;
      this.displaceRange = 0; // The base wander geometry stays intact; only its seeded phase moves.
      const wander = super.wander();
      this.displaceRange = displacement;
      this.wanderTheta += this.wanderRandom?.() ?? 0;
      contributions.push({ name: 'wander', force: wander, weight: this.wanderStrength ?? .12 });
    }
    if (this.altitude > 0 && this.target && ['NAV_HEADING', 'NAV_DIRECT', 'NAV_HOLD_ENTRY'].includes(this.state)) {
      const navigation = contributions.find(item => ['navigation', 'arrival'].includes(item.name));
      if (navigation) { navigation.force = FlightSteering.forceFor(this, this.target); navigation.name = 'flightTurn'; }
    }
    if (this.altitude === 0 && this.taxiLeader && this.vel.magSq() > .001) {
      const direction = this.vel.copy().setMag(1);
      const following = LeaderFollowing.forceFor(this, this.taxiLeader, { distance: this.taxiFollowingDistance ?? 14 });
      // Longitudinal projection keeps the chaining force on the taxiway, not sideways.
      const along = following.x * direction.x + following.y * direction.y;
      contributions.push({ name: 'leaderFollowing', force: direction.mult(along).limit(this.maxForce), weight: 2 });
    }
    // Ground separation is handled as a longitudinal hold by the tower system.
    return this.altitude === 0 ? contributions.filter(item => item.name !== 'separation') : contributions;
  }

  render() {
    if (typeof AircraftRenderer !== 'undefined') AircraftRenderer.render(this);
  }
}
globalThis.ModelAircraft = ModelAircraft;
