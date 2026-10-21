class EmergencySystem {
  constructor(simulation) {
    this.simulation = simulation;
    this.assignments = new Map();
  }

  declare(aircraft, code = '7700', reason = 'CONTROLLER') {
    if (!aircraft?.declareEmergency) return false;
    aircraft.declareEmergency(code, reason);
    return true;
  }

  intercept(aircraft, interceptor) {
    if (!aircraft?.emergency || !interceptor || !this.simulation.entities.includes(aircraft) || !this.simulation.entities.includes(interceptor)) return false;
    if (interceptor.aircraftType !== 'FIGHTER_JET' || interceptor.interceptTarget) return false;
    interceptor.setInterceptTarget(aircraft); this.assignments.set(aircraft, interceptor);
    return true;
  }

  beforeStep() {
    for (const [civil, fighter] of this.assignments) {
      if (civil.destroyed || fighter.destroyed || !this.simulation.entities.includes(civil)) {
        fighter.setInterceptTarget(null); this.assignments.delete(civil); continue;
      }
      if (['FINAL', 'TOUCHDOWN', 'ROLL_OUT', 'PARKED'].includes(civil.state)) {
        const fixes = this.exitFixes ?? [];
        const exit = fixes.slice().sort((a, b) => Math.hypot(a.x - fighter.pos.x, a.y - fighter.pos.y) - Math.hypot(b.x - fighter.pos.x, b.y - fighter.pos.y))[0]
          ?? { x: fighter.pos.x + 2000, y: fighter.pos.y - 2000 };
        fighter.departEscort(exit); this.assignments.delete(civil);
        this.onDeparture?.(civil, fighter, exit);
      }
    }
    for (const fighter of this.simulation.entities.filter(e => e.aircraftType === 'FIGHTER_JET' && e.mission === 'EXIT')) {
      if (Math.hypot(fighter.pos.x - fighter.exitTarget.x, fighter.pos.y - fighter.exitTarget.y) < Math.max(15, fighter.maxSpeed * 8)) this.simulation.remove(fighter);
    }
    for (const item of this.simulation.entities.filter(entity => entity instanceof Airplane)) {
      if (!item.emergency) continue;
      item.emergency.age += this.simulation.step;
    }
  }

  resolve(aircraft) {
    const interceptor = this.assignments.get(aircraft);
    interceptor?.setInterceptTarget(null);
    this.assignments.delete(aircraft);
    return aircraft?.clearEmergency?.() ?? false;
  }

}

if (typeof globalThis !== 'undefined') globalThis.EmergencySystem = EmergencySystem;
if (typeof module !== 'undefined' && module.exports) module.exports = EmergencySystem;
