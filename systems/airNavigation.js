/** Airborne orders use steering targets and scalar-projection path following. */
class AirNavigation {
  static ALTITUDE_STEP = 500;
  static MIN_ALTITUDE = 1000;
  static MAX_ALTITUDE = 12000;
  constructor(session) { this.session = session; this.fixes = NavigationCatalog.forAirport(session.airport); }
  static heading(from, to) { return (Math.atan2(to.x - from.x, -(to.y - from.y)) * 180 / Math.PI + 360) % 360; }
  static vector(heading) { const r = heading * Math.PI / 180; return { x: Math.sin(r), y: -Math.cos(r) }; }
  canControl(a) { return this.session.owns(a) && !a.destroyed && a.altitude > 0 && !['TAKEOFF_ROLL', 'CLIMB_OUT', 'TOUCHDOWN', 'ROLL_OUT'].includes(a.state); }
  prepareOrder(a) {
    if (!this.canControl(a)) return this.session.result(false, 'Le cap et les directs sont réservés aux avions en vol sous votre contrôle.');
    if (['APPROACH', 'FINAL'].includes(a.state)) return this.session.result(false, 'Approche établie : ordonnez une remise des gaz avant un nouveau cap ou direct.');
    if (a.guidance) a.guidance.controller.release(a.guidance.runway.id, a);
    a.guidance = null; a.landingCleared = false; a.assignedRunway = null;
    a.path = null; a.target = null; a.outsideSectorTarget = null; a.holdPosition = false; a.headingLocked = false;
    a.maxSpeed = a.model.cruise;
    a.pathArriveAtEnd = false; a.pathLookAhead = 15; a.pathPredictionFrames = 8;
    return true;
  }
  setHeading(a, heading) {
    if (!Number.isFinite(heading) || !this.prepareOrder(a)) return false;
    heading = (heading % 360 + 360) % 360;
    a.airNavigation = { mode: 'HEADING', heading }; a.state = 'NAV_HEADING';
    return this.session.result(true, `${a.callsign} : volez cap vrai ${Math.round(heading).toString().padStart(3, '0')}°.`);
  }
  setAltitude(a, altitude) {
    if (a?.tcasAdvisory?.level === 'RA') return this.session.result(false, 'TCAS RA en cours : attendez la fin de l’évitement avant une nouvelle clairance verticale.');
    if (!this.canControl(a) || a.guidance || !Number.isFinite(altitude) || altitude < AirNavigation.MIN_ALTITUDE || altitude > AirNavigation.MAX_ALTITUDE) return this.session.result(false, 'Niveau 1000–12000 ft par paliers de 500, hors approche et montée initiale.');
    a.assignedAltitude = Math.round(altitude / AirNavigation.ALTITUDE_STEP) * AirNavigation.ALTITUDE_STEP;
    a.altitudeOrderActive = true;
    const instruction = a.assignedAltitude > a.altitude ? 'montez' : a.assignedAltitude < a.altitude ? 'descendez' : 'maintenez';
    return this.session.result(true, `${a.callsign} : ${instruction} ${a.assignedAltitude} ft.`);
  }
  direct(a, fixId, options = {}) {
    const fix = this.fixes.find(p => p.id === fixId);
    if (!fix) return this.session.result(false, 'Point de navigation inconnu dans cet espace.');
    if (!this.prepareOrder(a)) return false;
    const holding = options.hold ? this.holding(fix, options) : null;
    a.airNavigation = { mode: 'DIRECT', fix, holding, heading: AirNavigation.heading(a.pos, fix) };
    a.state = holding ? 'NAV_HOLD_ENTRY' : 'NAV_DIRECT';
    return this.session.result(true, `${a.callsign} : direct ${fix.id}${holding ? ', puis circuit d’attente ' + (holding.turn === 'RIGHT' ? 'droite' : 'gauche') : ''}.`);
  }
  holding(fix, options = {}) {
    const inbound = Number.isFinite(options.inbound) ? ((options.inbound % 360) + 360) % 360 : 0;
    const turn = options.turn === 'LEFT' ? 'LEFT' : 'RIGHT'; const sign = turn === 'RIGHT' ? 1 : -1;
    const units = (this.session.airport.metersToPixels ?? .2) * 1852;
    const radius = Math.max(.3, Math.min(3, options.radiusNm ?? .7)) * units;
    const leg = Math.max(1, Math.min(8, options.legNm ?? 2.5)) * units;
    const u = AirNavigation.vector(inbound); const right = { x: -u.y * sign, y: u.x * sign };
    const center = { x: fix.x + right.x * radius, y: fix.y + right.y * radius };
    const theta = Math.atan2(-right.y, -right.x); const points = [{ x: fix.x, y: fix.y }];
    for (let j = 1; j <= 16; j++) { const angle = theta + sign * Math.PI * j / 16; points.push({ x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius }); }
    const otherCenter = { x: center.x - u.x * leg, y: center.y - u.y * leg };
    points.push({ x: otherCenter.x + right.x * radius, y: otherCenter.y + right.y * radius });
    for (let j = 1; j <= 16; j++) { const angle = theta + sign * Math.PI + sign * Math.PI * j / 16; points.push({ x: otherCenter.x + Math.cos(angle) * radius, y: otherCenter.y + Math.sin(angle) * radius }); }
    points.push({ x: fix.x, y: fix.y });
    return { inbound, turn, radius, leg, points, index: 1, laps: 0 };
  }
  beforeStep() {
    for (const a of this.session.simulation.entities) if (a instanceof ModelAircraft && this.canControl(a) && !a.guidance) {
      a.verticalRate = a.tcasAdvisory?.level === 'RA' ? 0 : Math.max(-8, Math.min(8, a.assignedAltitude - a.altitude));
      a.altitude += a.verticalRate;
      if (a.altitude === a.assignedAltitude) a.altitudeOrderActive = false;
    }
    for (const a of this.session.simulation.entities.filter(a => a instanceof ModelAircraft && a.airNavigation)) {
      const order = a.airNavigation;
      if (order.mode === 'HEADING') {
        const u = AirNavigation.vector(order.heading); a.path = null;
        a.target = { x: a.pos.x + u.x * 500, y: a.pos.y + u.y * 500 }; a.arrivalTarget = false;
      } else if (order.mode === 'DIRECT') {
        a.path = null; a.target = order.fix; a.arrivalTarget = false;
        const capture = Math.max(4, a.maxSpeed * 5);
        if (Math.hypot(a.pos.x - order.fix.x, a.pos.y - order.fix.y) < capture) {
          if (order.holding) {
            order.mode = 'HOLD'; a.state = 'NAV_HOLD'; a.target = null;
            this.session.recordEvent(`${a.callsign} : établi dans l’attente ${order.fix.id}.`);
          } else {
            order.mode = 'HEADING'; a.state = 'NAV_HEADING';
            this.session.recordEvent(`${a.callsign} : ${order.fix.id} passé, maintenez cap ${Math.round(order.heading)}°.`);
          }
        }
      } else if (order.mode === 'HOLD') {
        const h = order.holding; const next = h.points[h.index];
        const previous = h.points[h.index - 1];
        const dx = next.x - previous.x; const dy = next.y - previous.y;
        const passed = (a.pos.x - next.x) * dx + (a.pos.y - next.y) * dy >= 0;
        if (passed || Math.hypot(a.pos.x - next.x, a.pos.y - next.y) < Math.max(12, a.maxSpeed * 14)) {
          h.index++; if (h.index >= h.points.length) { h.index = 1; h.laps++; }
        }
        a.target = null; a.path = [previous, next]; a.pathArriveAtEnd = false;
        a.pathLookAhead = Math.max(8, a.maxSpeed * 9); a.pathPredictionFrames = 6;
      }
    }
  }
}
globalThis.AirNavigation = AirNavigation;
