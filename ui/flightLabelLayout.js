/** Screen-space placement for radar labels; never moves the aircraft. */
class FlightLabelLayout {
  static intersects(a, b, margin = 3) {
    return a.x < b.x + b.width + margin && a.x + a.width + margin > b.x &&
      a.y < b.y + b.height + margin && a.y + a.height + margin > b.y;
  }

  static place(aircraft, camera, selected = null, reserved = []) {
    const labels = new Map(); const occupied = [...reserved];
    const ordered = [...aircraft].filter(a => camera.visible(a.pos, 12) &&
      (a.altitude > 0 || camera.rangeNm <= 8 || a === selected));
    ordered.sort((a, b) => Number(b === selected) - Number(a === selected) ||
      Number(Boolean(b.emergency)) - Number(Boolean(a.emergency)) ||
      Number(b.altitude > 0) - Number(a.altitude > 0));
    for (const a of ordered) {
      const compact = camera.rangeNm > 15 && a !== selected && !a.emergency;
      const width = compact ? 118 : 200; const height = compact ? 38 : 62;
      const point = camera.screen(a.pos);
      const candidates = [
        { x: point.x + 14, y: point.y - height - 8 },
        { x: point.x - width - 14, y: point.y - height - 8 },
        { x: point.x + 14, y: point.y + 10 },
        { x: point.x - width - 14, y: point.y + 10 }
      ];
      const box = candidates.find(rect => rect.x >= 4 && rect.y >= 4 &&
        rect.x + width <= camera.width - 4 && rect.y + height <= camera.height - 4 &&
        occupied.every(other => !this.intersects({ ...rect, width, height }, other)));
      if (!box) continue;
      const placement = { ...box, width, height, compact };
      labels.set(a, placement); occupied.push(placement);
    }
    return labels;
  }
}
globalThis.FlightLabelLayout = FlightLabelLayout;
