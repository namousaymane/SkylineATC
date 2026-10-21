/** Deterministic decorative landscape, not geographic survey data. Static tiles only. */
class SurroundingsRenderer {
  static cache = new Map();
  static coastMaskCache = new WeakMap();
  static seed(id, x, y, level) {
    let h = 2166136261; for (const ch of `${id}/${x}/${y}/${level}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    return h >>> 0;
  }
  static coastlineY(airport, worldX) {
    const lines = (airport.features ?? []).filter(f => f.properties?.natural === 'coastline').map(f => f.points).filter(points => points?.length > 1);
    let southernmost = null;
    for (const points of lines) for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1]; const b = points[i];
      if (worldX < Math.min(a.x, b.x) || worldX > Math.max(a.x, b.x)) continue;
      if (a.x === b.x) { if (worldX === a.x) southernmost = Math.max(southernmost ?? -Infinity, (a.y + b.y) / 2); continue; }
      const t = (worldX - a.x) / (b.x - a.x);
      southernmost = Math.max(southernmost ?? -Infinity, a.y + (b.y - a.y) * t);
    }
    return southernmost;
  }
  static tile(airport, x, y, level, worldSize = 256) {
    const key = `${airport.id}/${x}/${y}/${level}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
    const c = canvas.getContext('2d'); const r = new SeededRandom(this.seed(airport.id, x, y, level));
    const desert = airport.surfaceTheme === 'desert';
    c.fillStyle = desert ? '#b09c70' : '#71804f'; c.fillRect(0, 0, 256, 256);
    const palette = desert ? ['#b6a273', '#ab9567', '#bca87c', '#9e956a'] : ['#788957', '#89915d', '#647b49', '#9b9666', '#6c8151'];
    for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) {
      const px = col * 64; const py = row * 64; c.fillStyle = r.pick(palette); c.fillRect(px + 1, py + 1, 62, 62);
      c.strokeStyle = 'rgba(42,54,29,.12)'; c.lineWidth = 1;
      for (let k = 6; k < 64; k += 7) { c.beginPath(); c.moveTo(px + k, py + 2); c.lineTo(px + k, py + 62); c.stroke(); }
      if (r.next() < (desert ? .09 : .3)) {
        for (let j = 0; j < 35; j++) {
          const tx = px + r.between(4, 60); const ty = py + r.between(4, 60); const size = r.between(2, 5);
          c.fillStyle = 'rgba(21,38,25,.22)'; c.beginPath(); c.arc(tx + 2, ty + 2, size, 0, Math.PI * 2); c.fill();
          c.fillStyle = r.pick(['#405d38', '#4c6a3e', '#567347']); c.beginPath(); c.arc(tx, ty, size, 0, Math.PI * 2); c.fill();
        }
      }
    }
    // Shared edge endpoints make roads continuous between neighboring tiles.
    const edge = (a, b) => 80 + this.seed(airport.id, a, b, level) % 90;
    const road = (vertical, width) => {
      c.beginPath();
      if (vertical) { c.moveTo(edge(x, y), 0); c.bezierCurveTo(128, 80, 128, 176, edge(x, y + 1), 256); }
      else { c.moveTo(0, edge(y, x)); c.bezierCurveTo(80, 128, 176, 128, 256, edge(y, x + 1)); }
      c.strokeStyle = '#bab5a0'; c.lineWidth = width + 2; c.stroke(); c.strokeStyle = '#777b72'; c.lineWidth = width; c.stroke();
    };
    road(false, 3); road(true, 2);
    if (r.next() < .35) for (let j = 0; j < 45; j++) {
      const bx = r.between(100, 170); const by = r.between(95, 165); const w = r.between(3, 8);
      c.fillStyle = '#50564a'; c.fillRect(bx + 1, by + 2, w, w * .7); c.fillStyle = r.pick(['#c1b7a0', '#d0c6ae', '#a49d8b']); c.fillRect(bx, by, w, w * .7);
    }
    if (this.cache.size > 256) this.cache.delete(this.cache.keys().next().value);
    this.cache.set(key, canvas); return canvas;
  }
  static coastMask(airport, camera) {
    const key = [camera.width, camera.height, camera.scale.toFixed(6), camera.center.x.toFixed(2), camera.center.y.toFixed(2)].join(':');
    const cached = this.coastMaskCache.get(airport);
    if (cached?.key === key) return cached;
    const points = airport.features.filter(feature => feature.properties?.natural === 'coastline').flatMap(feature => feature.points ?? []);
    const eastEdge = Math.max(...points.map(point => point.x)); const westEdge = Math.min(...points.map(point => point.x));
    const eastScreen = camera.screen({ x: eastEdge, y: 0 }).x; const westernShore = this.coastlineY(airport, westEdge); const shorePath = [];
    for (let px = 0; px <= camera.width; px += 2) {
      const world = camera.world({ x: px, y: camera.height / 2 });
      if (world.x > eastEdge) continue;
      const shore = world.x < westEdge ? westernShore : this.coastlineY(airport, world.x);
      if (Number.isFinite(shore)) shorePath.push({ x: px, y: camera.screen({ x: world.x, y: shore }).y });
    }
    const result = { key, eastScreen, shorePath }; this.coastMaskCache.set(airport, result); return result;
  }
  static render(c, camera, airport) {
    const coastal = airport.landscape === 'coastal' && airport.features?.some(f => f.properties?.natural === 'coastline');
    if (coastal) {
      c.save(); c.fillStyle = '#56899a'; c.fillRect(0, 0, camera.width, camera.height);
      const mask = this.coastMask(airport, camera);
      c.beginPath(); c.moveTo(Math.max(0, Math.min(camera.width, mask.eastScreen)), 0); c.lineTo(0, 0);
      for (const point of mask.shorePath) c.lineTo(point.x, Math.max(-camera.height * 4, Math.min(camera.height * 5, point.y)));
      c.closePath(); c.clip(); this.renderLandTiles(c, camera, airport); c.restore(); return;
    }
    this.renderLandTiles(c, camera, airport);
  }
  static renderLandTiles(c, camera, airport) {
    const level = Math.max(0, Math.floor(Math.log2(Math.max(1, camera.rangeNm / 6))));
    const size = camera.unitsPerNm * 8 * 2 ** level;
    const a = camera.world({ x: 0, y: 0 }); const b = camera.world({ x: camera.width, y: camera.height });
    c.save();
    for (let x = Math.floor(a.x / size); x <= Math.floor(b.x / size); x++) for (let y = Math.floor(a.y / size); y <= Math.floor(b.y / size); y++) {
      const p = camera.screen({ x: x * size, y: y * size }); const screenSize = size * camera.scale;
      c.drawImage(this.tile(airport, x, y, level, size), p.x, p.y, screenSize + .5, screenSize + .5);
    }
    c.restore();
  }
}
globalThis.SurroundingsRenderer = SurroundingsRenderer;
