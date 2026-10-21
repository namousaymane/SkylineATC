/** Static light positions derived from the same projected surfaces as the map. */
class AirportLighting {
  static cache = new WeakMap();
  static build(airport) {
    if (this.cache.has(airport)) return this.cache.get(airport);
    const lights = []; const seen = new Set();
    const add = (x, y, kind, color, radius = .8) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      const spacing = kind.startsWith('taxi-') ? 2.5 : .5;
      const key = `${kind}:${Math.round(x / spacing)}:${Math.round(y / spacing)}`;
      if (seen.has(key)) return; seen.add(key);
      lights.push({ x, y, kind, color, radius });
    };
    const meters = airport.metersToPixels ?? .2;
    for (const r of airport.runways ?? []) {
      const length = Math.hypot(r.x2 - r.x1, r.y2 - r.y1);
      if (!Number.isFinite(length) || length <= 0) continue;
      const ux = (r.x2 - r.x1) / length; const uy = (r.y2 - r.y1) / length;
      const halfWidth = (r.width ?? 12) / 2;
      const count = Math.min(180, Math.max(10, Math.ceil(length / (60 * meters))));
      for (let i = 0; i <= count; i++) {
        const d = length * i / count;
        for (const side of [-1, 1]) add(r.x1 + ux * d - uy * side * (halfWidth + 1), r.y1 + uy * d + ux * side * (halfWidth + 1), 'runway-edge', '#fff1c8', .85);
        if (i > 0 && i < count) add(r.x1 + ux * d, r.y1 + uy * d, 'runway-center', '#f4f2e2', .55);
      }
      for (const end of [0, 1]) {
        const x = end ? r.x2 : r.x1; const y = end ? r.y2 : r.y1;
        for (let i = -4; i <= 4; i++) {
          add(x - uy * halfWidth * i / 4, y + ux * halfWidth * i / 4, 'threshold', '#54e6a5', .9);
          const offset = end ? 2 : -2;
          add(x + ux * offset - uy * halfWidth * i / 4, y + uy * offset + ux * halfWidth * i / 4, 'runway-end', '#f17f6c', .75);
        }
      }
    }
    for (const way of airport.taxiways ?? []) {
      const points = way.points ?? [{ x: way.x1, y: way.y1 }, { x: way.x2, y: way.y2 }];
      const width = airport.metersToPixels ? Math.max(4, (parseFloat(way.properties?.width) || 23) * meters) : 14;
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1]; const b = points[i];
        const length = Math.hypot(b.x - a.x, b.y - a.y);
        if (!Number.isFinite(length) || length < .1) continue;
        const nx = -(b.y - a.y) / length; const ny = (b.x - a.x) / length;
        const count = Math.max(1, Math.min(100, Math.ceil(length / Math.max(5, 30 * meters))));
        for (let j = 0; j <= count; j++) {
          const t = j / count; const x = a.x + (b.x - a.x) * t; const y = a.y + (b.y - a.y) * t;
          // Leave runway intersections to the runway lighting layer.
          if ((airport.runways ?? []).some(r => AirportGeometry.distanceToSegment({ x, y }, { x: r.x1, y: r.y1 }, { x: r.x2, y: r.y2 }) < r.width / 2 + 1)) continue;
          add(x, y, 'taxi-center', '#6ddca8', .35);
          for (const side of [-1, 1]) add(x + nx * side * (width / 2 + .6), y + ny * side * (width / 2 + .6), 'taxi-edge', '#69a9ff', .5);
        }
      }
    }
    for (const stand of airport.parking ?? []) add(stand.x, stand.y, 'stand', '#edc880', 1.1);
    const pad = airport.helicopterPad;
    if (pad) for (let i = 0; i < 8; i++) add(pad.x + Math.cos(i * Math.PI / 4) * 9, pad.y + Math.sin(i * Math.PI / 4) * 9, 'helipad', '#6ae0aa', .65);
    this.cache.set(airport, lights);
    return lights;
  }
  static render(c, airport, scale = 1) {
    if (!Number.isFinite(scale) || scale < .12) return;
    c.save();
    for (const light of this.build(airport)) {
      const radius = Math.min(light.radius, 1.8 / scale);
      c.fillStyle = light.color; c.globalAlpha = .08;
      c.beginPath(); c.arc(light.x, light.y, radius * 2.5, 0, Math.PI * 2); c.fill();
      c.globalAlpha = .95;
      c.beginPath(); c.arc(light.x, light.y, radius, 0, Math.PI * 2); c.fill();
    }
    c.restore();
  }
}
globalThis.AirportLighting = AirportLighting;
