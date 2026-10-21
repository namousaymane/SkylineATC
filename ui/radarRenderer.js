/** Daylight airport surface renderer; static geometry is cached offscreen. */
class RadarRenderer {
  static cache = new WeakMap();
  static renderAirport(airport) {
    let canvas = this.cache.get(airport);
    if (!canvas) {
      canvas = document.createElement('canvas'); canvas.width = 2200; canvas.height = 1240;
      const ctx = canvas.getContext('2d'); ctx.scale(2, 2); this.paint(ctx, airport); this.cache.set(airport, canvas);
    }
    push(); drawingContext.drawImage(canvas, 0, 0, 1100, 620); pop();
  }
  static renderNightLights(airport, scale = 1) {
    AirportLighting.render(drawingContext, airport, scale);
  }
  static rng(seed = 4871) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 4294967296; }; }
  static path(c, points, close = false) { c.beginPath(); points.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); if (close) c.closePath(); }
  static line(c, points, color, width) { this.path(c, points); c.strokeStyle = color; c.lineWidth = width; c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke(); }
  static area(c, points, color) { this.path(c, points, true); c.fillStyle = color; c.fill(); }
  static coastWater(airport, width = 1100, height = 620, cell = 4) {
    const points = (airport.features ?? []).filter(f => f.properties?.natural === 'coastline').flatMap(f => f.points ?? []);
    const water = new Set(); if (points.length < 2) return water;
    const west = Math.min(...points.map(p => p.x)); const east = Math.max(...points.map(p => p.x));
    const westernShore = SurroundingsRenderer.coastlineY(airport, west);
    // Same north-up shore envelope as the surrounding terrain. Extending the
    // side of the nearest finite segment creates diagonal land wedges at its
    // endpoints; never extrapolate that orientation into the sea.
    for (let x = 0; x < width; x += cell) {
      const worldX = x + cell / 2;
      const shore = worldX < west ? westernShore : SurroundingsRenderer.coastlineY(airport, worldX);
      for (let y = 0; y < height; y += cell) {
        if (worldX > east || (Number.isFinite(shore) ? y + cell / 2 > shore : worldX >= west)) water.add(`${x / cell},${y / cell}`);
      }
    }
    return water;
  }
  static paint(c, airport) {
    const desert = airport.surfaceTheme === 'desert'; const rand = this.rng(); const features = airport.features ?? [];
    c.fillStyle = desert ? '#b09c70' : '#71804f'; c.fillRect(0, 0, 1100, 620);
    const water = this.coastWater(airport);
    for (let i = 0; i < 22000; i++) { c.fillStyle = i % 2 ? 'rgba(236,224,174,.08)' : 'rgba(27,44,24,.07)'; c.fillRect(rand() * 1100, rand() * 620, 1 + rand() * 3, 1 + rand() * 2); }
    for (let i = 0; i < 50; i++) { c.fillStyle = desert ? 'rgba(220,188,128,.18)' : 'rgba(181,160,94,.13)'; c.beginPath(); c.ellipse(rand() * 1100, rand() * 620, 20 + rand() * 65, 5 + rand() * 25, rand() * 3, 0, Math.PI * 2); c.fill(); }
    for (const cell of water) { const [x, y] = cell.split(',').map(Number); c.fillStyle = '#4a8490'; c.fillRect(x * 4, y * 4, 4, 4); }
    const polygons = features.filter(f => f.geometry.type === 'Polygon');
    for (const f of polygons) {
      const t = f.properties;
      if (t.natural === 'water' || t.water) this.area(c, f.points, '#4b8590');
      else if (['forest', 'wood'].includes(t.landuse ?? t.natural)) this.area(c, f.points, '#48613c');
      else if (t.landuse === 'farmland') this.area(c, f.points, '#959361');
      else if (t.landuse === 'grass' || t.natural === 'grassland') this.area(c, f.points, '#778759');
    }
    // Geographic coastline is rendered from the imported OSM ways.
    for (const f of features.filter(f => f.properties.natural === 'coastline')) {
      this.line(c, f.points, '#b6b39b', 5);
    }
    for (const f of features.filter(f => f.geometry.type === 'LineString' && f.properties.highway)) this.line(c, f.points, '#85857a', 2);
    const aprons = polygons.filter(f => f.properties.aeroway === 'apron');
    for (const f of aprons) this.concrete(c, f.points);
    if (!features.length) for (const a of airport.aprons) this.concrete(c, [{ x: a.x - a.w / 2, y: a.y - a.h / 2 }, { x: a.x + a.w / 2, y: a.y - a.h / 2 }, { x: a.x + a.w / 2, y: a.y + a.h / 2 }, { x: a.x - a.w / 2, y: a.y + a.h / 2 }]);
    const ways = airport.taxiways.map(t => t.points ? t : { points: [{ x: t.x1, y: t.y1 }, { x: t.x2, y: t.y2 }] });
    for (const t of ways) { const w = airport.metersToPixels ? Math.max(4, parseFloat(t.properties?.width ?? 23) * airport.metersToPixels) : 14; this.line(c, t.points, '#8b897b', w + 2); this.line(c, t.points, '#b9b6a8', w); }
    for (const r of airport.runways) this.runway(c, r);
    for (const t of ways) this.line(c, t.points, '#f1cd56', .7);
    this.taxiwaySigns(c, airport, ways);
    const buildings = polygons.filter(f => f.properties.building || ['terminal', 'hangar'].includes(f.properties.aeroway));
    for (const f of buildings) this.building(c, f);
    if (!features.length) for (const t of airport.terminals) this.building(c, { properties: { aeroway: 'terminal', ref: t.id }, points: [{ x: t.x - t.w / 2, y: t.y - t.h / 2 }, { x: t.x + t.w / 2, y: t.y - t.h / 2 }, { x: t.x + t.w / 2, y: t.y + t.h / 2 }, { x: t.x - t.w / 2, y: t.y + t.h / 2 }] });
    for (const stand of airport.parking) { if (stand.points) this.line(c, stand.points, '#f0cc56', .65); c.strokeStyle = '#f0cc56'; c.lineWidth = .7; c.strokeRect(stand.x - 4, stand.y - 3, 8, 6); c.fillStyle = '#293a31'; c.font = '5px monospace'; c.fillText(stand.id, stand.x + 6, stand.y + 2); }
    if (airport.helicopterPad) {
      const pad = airport.helicopterPad; c.fillStyle = '#c8c9b9'; c.beginPath(); c.arc(pad.x, pad.y, 9, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#263a32'; c.lineWidth = 1; c.beginPath(); c.arc(pad.x, pad.y, 9, 0, Math.PI * 2); c.stroke();
      c.fillStyle = '#24382e'; c.font = 'bold 8px sans-serif'; c.textAlign = 'center'; c.fillText('H', pad.x, pad.y + 3); c.textAlign = 'start';
    }
    for (let i = 0; i < (desert ? 90 : 450); i++) {
      const p = { x: rand() * 1100, y: rand() * 620 };
      if (!features.length && [...airport.aprons, ...airport.terminals].some(a => p.x > a.x - a.w / 2 - 4 && p.x < a.x + a.w / 2 + 4 && p.y > a.y - a.h / 2 - 4 && p.y < a.y + a.h / 2 + 4)) continue;
      if (water.has(`${Math.floor(p.x / 4)},${Math.floor(p.y / 4)}`)) continue;
      if (airport.runways.some(r => AirportGeometry.distanceToSegment(p, { x: r.x1, y: r.y1 }, { x: r.x2, y: r.y2 }) < r.width / 2 + 22)) continue;
      if (ways.some(t => t.points.some((a, j) => j && AirportGeometry.distanceToSegment(p, t.points[j - 1], a) < 10))) continue;
      if (polygons.some(f => this.inside(p, f.points) && (f.properties.aeroway || f.properties.building || f.properties.natural === 'water'))) continue;
      const radius = 1.6 + rand() * 2.7;
      c.fillStyle = 'rgba(24,32,19,.25)'; c.beginPath(); c.arc(p.x + 2, p.y + 2, radius * 1.1, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#476139'; c.beginPath(); c.arc(p.x, p.y, radius, 0, Math.PI * 2); c.fill(); c.fillStyle = '#829459'; c.beginPath(); c.arc(p.x - .6, p.y - .6, radius * .55, 0, Math.PI * 2); c.fill();
    }
    c.fillStyle = '#1d3029'; c.font = '600 12px sans-serif'; c.fillText(airport.name.toUpperCase(), 24, 27); c.font = '8px monospace'; c.fillText(`${airport.id}  /  VUE SOL`, 24, 42);
    const m = airport.metersToPixels ?? .2; this.line(c, [{ x: 24, y: 593 }, { x: 24 + 500 * m, y: 593 }], '#f7edd4', 2); c.fillStyle = '#fff4da'; c.font = '8px monospace'; c.fillText('500 m', 24, 585);
  }
  static taxiwaySigns(c, airport, ways) {
    const names = new Set(); const drawn = new Set();
    for (const way of ways) {
      const name = way.properties?.ref;
      if (name && !names.has(name)) {
        names.add(name); const p = way.points[Math.floor(way.points.length / 2)];
        c.fillStyle = '#252c25'; c.fillRect(p.x + 5, p.y + 5, 9 + name.length * 2, 7); c.fillStyle = '#eed16b'; c.font = '5px monospace'; c.fillText(name, p.x + 7, p.y + 10);
      }
      for (let j = 1; j < way.points.length; j++) {
        const a = way.points[j - 1]; const b = way.points[j];
        for (const r of airport.runways) {
          const start = { x: r.x1, y: r.y1 }; const end = { x: r.x2, y: r.y2 };
          const da = AirportGeometry.distanceToSegment(a, start, end); const db = AirportGeometry.distanceToSegment(b, start, end); const boundary = r.width / 2 + 3;
          if (!((da < boundary && db >= boundary) || (db < boundary && da >= boundary))) continue;
          const ratio = (boundary - da) / (db - da); const p = { x: a.x + ratio * (b.x - a.x), y: a.y + ratio * (b.y - a.y) };
          const key = `${Math.round(p.x / 5)},${Math.round(p.y / 5)}`; if (drawn.has(key)) continue; drawn.add(key);
          c.save(); c.translate(p.x, p.y); c.rotate(Math.atan2(b.y - a.y, b.x - a.x)); c.strokeStyle = '#f3cf55'; c.lineWidth = .5;
          for (const x of [-1.4, -.5, .5, 1.4]) { c.setLineDash(x > 0 ? [1, 1] : []); c.beginPath(); c.moveTo(x, -3.5); c.lineTo(x, 3.5); c.stroke(); } c.restore();
        }
      }
    }
  }
  static concrete(c, points) {
    c.save(); this.path(c, points, true); c.fillStyle = '#aaa99b'; c.fill(); c.clip(); c.strokeStyle = 'rgba(53,53,44,.22)'; c.lineWidth = .35;
    const xs = points.map(p => p.x); const ys = points.map(p => p.y);
    const x0 = Math.max(0, Math.min(...xs)); const x1 = Math.min(1100, Math.max(...xs)); const y0 = Math.max(0, Math.min(...ys)); const y1 = Math.min(620, Math.max(...ys));
    for (let x = x0; x < x1; x += 7) for (let y = y0; y < y1; y += 7) c.strokeRect(x, y, 7, 7); c.restore();
  }
  static runway(c, r) {
    const length = Math.hypot(r.x2 - r.x1, r.y2 - r.y1); const w = r.width;
    if (!length) return;
    c.save(); c.translate(r.x1, r.y1); c.rotate(Math.atan2(r.y2 - r.y1, r.x2 - r.x1));
    c.fillStyle = '#8b897b'; c.fillRect(-3, -w / 2 - 2, length + 6, w + 4);
    const grad = c.createLinearGradient(0, -w / 2, 0, w / 2); grad.addColorStop(0, '#4c4f4b'); grad.addColorStop(.5, '#303533'); grad.addColorStop(1, '#4c4f4b'); c.fillStyle = grad; c.fillRect(0, -w / 2, length, w);
    const rand = this.rng(91); for (let i = 0; i < length * 12; i++) { c.fillStyle = i % 2 ? 'rgba(3,10,9,.19)' : 'rgba(227,226,207,.14)'; c.fillRect(rand() * length, (rand() - .5) * w, .3 + rand() * .8, .4); }
    c.strokeStyle = '#eae9dc'; c.lineWidth = .5; c.strokeRect(.5, -w / 2 + .8, length - 1, w - 1.6);
    c.setLineDash([5, 7]); this.line(c, [{ x: w * 1.7, y: 0 }, { x: length - w * 1.7, y: 0 }], '#eae9dc', .6); c.setLineDash([]);
    const ids = r.id.split('/');
    for (let end = 0; end < 2; end++) {
      c.save(); if (end) { c.translate(length, 0); c.rotate(Math.PI); }
      c.fillStyle = '#eeeeE1'; for (let j = -3; j <= 3; j++) if (j) c.fillRect(2, j * w / 9 - w / 32, w * .5, w / 16);
      c.save(); c.translate(w * 1.05, 0); c.rotate(Math.PI / 2); c.font = `bold ${Math.max(5, w * .36)}px monospace`; c.textAlign = 'center'; c.fillText(ids[end] ?? '', 0, 2); c.restore();
      for (const side of [-1, 1]) { c.fillRect(length * .12, side * w * .25 - w * .06, Math.max(6, length * .027), w * .12); for (let k = 0; k < 3; k++) c.fillRect(length * (.18 + k * .055), side * w * .28, 6, Math.max(.65, w * .04)); }
      c.strokeStyle = 'rgba(5,10,10,.26)'; c.lineWidth = .5; for (let k = 0; k < 28; k++) { const y = (rand() - .5) * w * .4; c.beginPath(); c.moveTo(w + rand() * 20, y); c.lineTo(length * .29 + rand() * 12, y); c.stroke(); } c.restore();
    }
    for (let x = 3; x < length; x += 12) { c.fillStyle = x > length * .8 ? '#eac762' : '#f5efcf'; c.fillRect(x, -w / 2 - 1.5, 1, 1); c.fillRect(x, w / 2 + .5, 1, 1); } c.restore();
  }
  static building(c, f) {
    const xs = f.points.map(p => p.x); const ys = f.points.map(p => p.y); const minX = Math.min(...xs); const maxX = Math.max(...xs); const minY = Math.min(...ys); const maxY = Math.max(...ys);
    if (maxX < 0 || minX > 1100 || maxY < 0 || minY > 620) return;
    const terminal = f.properties.aeroway === 'terminal'; c.save(); c.translate(2, 3); this.area(c, f.points, 'rgba(21,26,23,.28)'); c.restore(); this.area(c, f.points, terminal ? '#c9ccbf' : '#9da69b');
    c.save(); this.path(c, f.points, true); c.clip(); for (let x = minX + 3; x < maxX; x += 6) { c.fillStyle = '#87958b'; c.fillRect(x, minY, .7, maxY - minY); } if (terminal) for (let x = minX + 3; x < maxX; x += 12) { c.fillStyle = '#657d78'; c.fillRect(x, minY + 3, 5, 3); } c.restore();
    this.path(c, f.points, true); c.strokeStyle = '#6d7a70'; c.lineWidth = .65; c.stroke();
    if (terminal) { c.fillStyle = '#2b403c'; c.font = 'bold 6px sans-serif'; c.textAlign = 'center'; c.fillText(f.properties.ref ?? 'TERMINAL', (minX + maxX) / 2, (minY + maxY) / 2); c.textAlign = 'left'; }
  }
  static inside(p, polygon) { let inside = false; for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) { const a = polygon[i]; const b = polygon[j]; if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside; } return inside; }
}
globalThis.RadarRenderer = RadarRenderer;
