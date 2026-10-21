/** Airport rescue vehicles move over assigned ground paths through Vehicle forces. */
class EmergencyVehicle extends Vehicle {
  constructor(x, y, options = {}) {
    super(x, y);
    this.kind = options.kind ?? 'FIRE';
    this.callsign = options.callsign ?? (this.kind === 'MEDICAL' ? 'MED-1' : 'FIRE-1');
    this.station = { x, y };
    this.state = 'STATIONED';
    this.maxSpeed = options.maxSpeed ?? .95;
    this.maxForce = options.maxForce ?? .08;
    this.r = 5;
    this.route = [];
    this.routeIndex = 1;
    this.incident = null;
  }

  dispatch(route, incident) {
    if (this.state !== 'STATIONED' || !Array.isArray(route) || route.length < 2) return false;
    this.route = route.map(point => ({ x: point.x, y: point.y }));
    this.routeIndex = 1; this.incident = incident; this.state = 'EN_ROUTE';
    return true;
  }

  returnToStation(route) {
    if (this.state !== 'ON_SCENE' || !Array.isArray(route) || route.length < 2) return false;
    this.route = route.map(point => ({ x: point.x, y: point.y }));
    this.routeIndex = 1; this.state = 'RETURNING';
    return true;
  }

  simulateStep() {
    let force = createVector(0, 0);
    if (['EN_ROUTE', 'RETURNING'].includes(this.state)) {
      const path = this.route.slice(this.routeIndex - 1, this.routeIndex + 1);
      force = PathFollowing.forceFor(this, path, { lookAhead: 8, predictionFrames: 2, arriveAtEnd: true });
      const target = this.route[this.routeIndex];
      if (target && Math.hypot(this.pos.x - target.x, this.pos.y - target.y) < 2 && this.vel.mag() < .12) {
        this.routeIndex += 1;
        if (this.routeIndex >= this.route.length) {
          this.state = this.state === 'RETURNING' ? 'STATIONED' : 'ON_SCENE';
          if (this.state === 'STATIONED') this.incident = null;
          this.route = []; this.routeIndex = 1;
        }
      }
    } else if (this.vel.magSq() > .0001) force = this.vel.copy().mult(-1).limit(this.maxForce);
    super.applyForce(force.limit(this.maxForce));
    super.update();
  }

  render() {
    const c = drawingContext; c.save(); c.translate(this.pos.x, this.pos.y); c.scale(this.renderScale ?? 1, this.renderScale ?? 1);
    if (this.vel.magSq() > .0001) c.rotate(this.vel.heading());
    const medical = this.kind === 'MEDICAL';
    const polygon = (points, color) => { c.fillStyle = color; c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); c.fill(); c.strokeStyle = '#26332d'; c.lineWidth = .7; c.stroke(); };
    c.fillStyle = '#111b18'; for (const x of [-4.2, 3.5]) { c.beginPath(); c.ellipse(x, -2.8, 1.25, .45, 0, 0, Math.PI * 2); c.ellipse(x, 2.8, 1.25, .45, 0, 0, Math.PI * 2); c.fill(); }
    polygon([[-6,-2.2],[3.6,-2.2],[5.9,-1.25],[6.4,0],[5.8,1.3],[3.6,2.2],[-6,2.2]], medical ? '#eee9d7' : '#d8d9ce');
    c.fillStyle = medical ? '#d84d43' : '#cf473b'; c.fillRect(-5.6,-2.15,7,4.3);
    c.fillStyle = '#253c40'; c.beginPath(); c.moveTo(2.2,-1.9); c.lineTo(4.8,-1.35); c.lineTo(5.25,0); c.lineTo(2.2,0); c.closePath(); c.fill();
    c.fillStyle = '#e9f3ed'; c.fillRect(2.2,.35,2.8,.35);
    c.fillStyle = medical ? '#c73935' : '#f2df9d'; c.fillRect(-4.8,-.35,4.4,.7);
    if (medical) { c.fillStyle = '#fff'; c.fillRect(-3.1,-1.7,.7,3.4); c.fillRect(-4.45,-.35,3.4,.7); }
    else { for (let x=-5.2;x<1.9;x+=1.35) { c.fillStyle='#f6eee0'; c.beginPath(); c.moveTo(x,-2.2); c.lineTo(x+.65,-2.2); c.lineTo(x-.05,2.2); c.lineTo(x-.7,2.2); c.closePath(); c.fill(); } }
    c.fillStyle = '#f8e9a1'; c.fillRect(5.4,-1.45,.7,.65); c.fillRect(5.4,.8,.7,.65);
    c.fillStyle = '#f33832'; c.fillRect(-1.6,-2.7,2,.5); c.fillStyle = '#f2db7a'; c.fillRect(-1.6,2.2,2,.5);
    if (this.state === 'EN_ROUTE') { c.fillStyle = '#ff382f'; c.fillRect(-.6,-3.15,.65,.35); c.fillStyle = '#4db8ff'; c.fillRect(.25,-3.15,.65,.35); }
    c.restore();
  }
}
globalThis.EmergencyVehicle = EmergencyVehicle;
