/** Exclusive ownership of a physical runway, retained through landing roll. */
class RunwayController {
  constructor(runways) {
    this.resources = new Map();
    const physical = new Map();
    for (const runway of runways) {
      const key = runway.physicalId ?? runway.id;
      if (!physical.has(key)) physical.set(key, { runway, owner: null });
      this.resources.set(runway.id, physical.get(key));
      this.resources.set(key, physical.get(key));
    }
  }

  reserve(id, aircraft) {
    const resource = this.resources.get(id);
    if (!resource || !aircraft || this.blockedBy(id, aircraft)) return false;
    resource.owner = aircraft;
    return true;
  }

  blockedBy(id, aircraft = null) {
    const resource = this.resources.get(id);
    if (!resource) return 'UNKNOWN_RUNWAY';
    for (const other of new Set(this.resources.values())) {
      if (!other.owner || other.owner === aircraft) continue;
      if (resource === other || this.intersects(resource.runway, other.runway)) return other.owner.callsign ?? 'OCCUPIED';
    }
    return null;
  }

  intersects(a, b) {
    const cross = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    const p = { x: a.x1, y: a.y1 }; const q = { x: a.x2, y: a.y2 }; const r = { x: b.x1, y: b.y1 }; const s = { x: b.x2, y: b.y2 };
    return cross(p, q, r) * cross(p, q, s) < 0 && cross(r, s, p) * cross(r, s, q) < 0;
  }

  owns(id, aircraft) {
    return Boolean(aircraft && this.resources.get(id)?.owner === aircraft);
  }

  release(id, aircraft) {
    if (!this.owns(id, aircraft)) return false;
    this.resources.get(id).owner = null;
    return true;
  }
}
if (typeof globalThis !== 'undefined') globalThis.RunwayController = RunwayController;
