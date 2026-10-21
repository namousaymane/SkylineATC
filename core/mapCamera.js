/** North-up camera. All input/output coordinates are logical CSS pixels. */
class MapCamera {
  static SECTOR_RADIUS_NM = 80;
  constructor(width, height, unitsPerNm = 370.4) {
    this.width = width; this.height = height; this.unitsPerNm = unitsPerNm;
    this.center = { x: 550, y: 310 }; this.scale = 1; this.follow = false;
    this.airspace();
  }
  get minScale() { return Math.min(this.width, this.height) / (2 * MapCamera.SECTOR_RADIUS_NM * this.unitsPerNm); }
  get maxScale() { return Math.max(.1, Math.min(this.width / 1100, this.height / 620)) * 12; }
  get rangeNm() { return this.height / (2 * this.scale * this.unitsPerNm); }
  resize(width, height) { const ratio = height / this.height; this.width = width; this.height = height; this.scale = Math.max(this.minScale, Math.min(this.maxScale, this.scale * ratio)); this.clampCenter(); }
  airspace(rangeNm = 35) { this.center = { x: 550, y: 310 }; this.scale = Math.max(this.minScale, Math.min(this.width, this.height) / (2 * rangeNm * this.unitsPerNm)); this.follow = false; }
  airport() { this.center = { x: 550, y: 310 }; this.scale = Math.min(this.width / 1100, this.height / 620); this.follow = false; }
  transform() { return { scale: this.scale, x: this.width / 2 - this.center.x * this.scale, y: this.height / 2 - this.center.y * this.scale }; }
  world(point) { const t = this.transform(); return { x: (point.x - t.x) / t.scale, y: (point.y - t.y) / t.scale }; }
  screen(point) { const t = this.transform(); return { x: point.x * t.scale + t.x, y: point.y * t.scale + t.y }; }
  visible(point, padding = 0) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
    const p = this.screen(point);
    return p.x >= -padding && p.x <= this.width + padding && p.y >= -padding && p.y <= this.height + padding;
  }
  inSector(point, center = { x: 550, y: 310 }) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
    return Math.hypot(point.x - center.x, point.y - center.y) <= MapCamera.SECTOR_RADIUS_NM * this.unitsPerNm;
  }
  zoom(factor, anchor = { x: this.width / 2, y: this.height / 2 }) {
    if (!Number.isFinite(factor) || factor <= 0) return;
    const p = this.world(anchor); this.scale = Math.max(this.minScale, Math.min(this.maxScale, this.scale * factor));
    this.center = { x: p.x - (anchor.x - this.width / 2) / this.scale, y: p.y - (anchor.y - this.height / 2) / this.scale }; this.clampCenter(); this.follow = false;
  }
  clampCenter() {
    const airport = { x: 550, y: 310 };
    const halfWidthNm = this.width / (2 * this.scale * this.unitsPerNm); const halfHeightNm = this.height / (2 * this.scale * this.unitsPerNm);
    const available = Math.max(0, MapCamera.SECTOR_RADIUS_NM - Math.max(halfWidthNm, halfHeightNm));
    const dx = this.center.x - airport.x; const dy = this.center.y - airport.y; const distance = Math.hypot(dx, dy); const limit = available * this.unitsPerNm;
    if (distance > limit && distance > 0) { this.center.x = airport.x + dx / distance * limit; this.center.y = airport.y + dy / distance * limit; }
  }
  pan(dx, dy) { this.center.x -= dx / this.scale; this.center.y -= dy / this.scale; this.clampCenter(); this.follow = false; }
  fit(points) {
    const xs = points.map(p => p.x); const ys = points.map(p => p.y);
    const w = Math.max(500, Math.max(...xs) - Math.min(...xs)); const h = Math.max(500, Math.max(...ys) - Math.min(...ys));
    this.scale = Math.max(this.minScale, Math.min(this.maxScale, Math.min(this.width / w, this.height / h) * .78));
    this.center = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 }; this.follow = false;
    this.clampCenter();
  }
}
globalThis.MapCamera = MapCamera;
