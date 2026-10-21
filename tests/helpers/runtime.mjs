import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

export function vector(x = 0, y = 0) {
  return { x, y,
    copy() { return vector(this.x, this.y); },
    add(v) { this.x += v.x; this.y += v.y; return this; },
    sub(v) { this.x -= v.x; this.y -= v.y; return this; },
    mult(v) { this.x *= v; this.y *= v; return this; },
    set(x, y) { this.x = x; this.y = y; return this; },
    magSq() { return this.x ** 2 + this.y ** 2; },
    mag() { return Math.hypot(this.x, this.y); },
    setMag(n) { const m = this.mag(); if (m) this.mult(n / m); return this; },
    limit(n) { if (this.mag() > n) this.setMag(n); return this; },
    heading() { return Math.atan2(this.y, this.x); }
  };
}

export function runtime() {
  const context = { createVector: vector, random: () => 0,
    push() {}, pop() {}, cos: Math.cos, sin: Math.sin,
    map: (v, a, b, c, d) => c + (v - a) / (b - a) * (d - c),
    p5: { Vector: { sub: (a, b) => a.copy().sub(b),
      dist: (a, b) => Math.hypot(a.x - b.x, a.y - b.y) } }
  };
  vm.createContext(context);
  for (const file of ['vehicle.js', 'core/steeringComposer.js', 'core/pathFollowing.js',
    'core/separation.js', 'core/obstacleAvoidance.js', 'core/weatherEffects.js', 'core/pursuit.js', 'core/evasion.js', 'core/leaderFollowing.js',
    'entities/stormCell.js', 'entities/airplane.js', 'entities/airliner.js', 'entities/regionalJet.js', 'entities/fighterJet.js',
    'systems/runwayController.js', 'systems/approachGuidance.js', 'systems/taxiController.js', 'systems/departureController.js', 'systems/trafficManager.js', 'systems/weatherSystem.js', 'systems/emergencySystem.js', 'systems/missionSystem.js', 'core/simulation.js', 'core/gameSession.js', 'core/scenarioFactory.js']) {
    const source = readFileSync(fileURLToPath(new URL(`../../${file}`, import.meta.url)), 'utf8');
    vm.runInContext(source + (file === 'vehicle.js' ? '\nglobalThis.Vehicle = Vehicle;' : ''), context);
  }
  return context;
}
