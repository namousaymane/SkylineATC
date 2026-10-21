/** Screen-space navigation annotations stay readable at every zoom level. */
class AirspaceRenderer {
  static render(ctx, camera, fixes, selectedFixId, airportName) {
    const c = ctx; c.save();
    const center = camera.screen({ x: 550, y: 310 });
    const stepNm = camera.rangeNm > 45 ? 20 : camera.rangeNm > 12 ? 5 : camera.rangeNm > 3 ? 1 : .25;
    c.lineWidth = .7; c.strokeStyle = 'rgba(222,235,207,.25)';
    for (let nm = stepNm; nm <= camera.rangeNm * 2; nm += stepNm) {
      const radius = nm * camera.unitsPerNm * camera.scale;
      c.beginPath(); c.arc(center.x, center.y, radius, 0, Math.PI * 2); c.stroke();
      c.fillStyle = '#d9e6c9'; c.font = '9px monospace'; c.fillText(`${nm} NM`, center.x + 5, center.y - radius - 3);
    }
    c.strokeStyle = 'rgba(222,235,207,.10)'; c.setLineDash([3, 8]);
    c.beginPath(); c.moveTo(center.x, 0); c.lineTo(center.x, camera.height); c.moveTo(0, center.y); c.lineTo(camera.width, center.y); c.stroke(); c.setLineDash([]);
    if (camera.rangeNm > 5 && center.x > 0 && center.x < camera.width && center.y > 0 && center.y < camera.height) {
      c.strokeStyle = '#f3e9ba'; c.strokeRect(center.x - 4, center.y - 4, 8, 8); c.fillStyle = '#edf2df'; c.font = '10px sans-serif'; c.fillText(airportName, center.x + 9, center.y - 8);
    }
    for (const fix of fixes) {
      const p = camera.screen(fix);
      if (p.x < -50 || p.x > camera.width + 50 || p.y < -20 || p.y > camera.height + 20) continue;
      const selected = fix.id === selectedFixId;
      if (fix.threshold) {
        const end = camera.screen(fix.threshold); c.strokeStyle = selected ? '#ffe38a' : 'rgba(236,225,167,.5)'; c.lineWidth = 1; c.setLineDash([4, 5]);
        c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(end.x, end.y); c.stroke(); c.setLineDash([]);
      }
      c.strokeStyle = selected ? '#ffe38a' : '#d1ece0'; c.fillStyle = selected ? '#f2cf65' : '#152d29'; c.lineWidth = selected ? 1.8 : 1;
      c.beginPath();
      if (fix.type === 'VOR/DME') { c.arc(p.x, p.y, 5, 0, Math.PI * 2); }
      else { c.moveTo(p.x, p.y - 6); c.lineTo(p.x + 5, p.y + 4); c.lineTo(p.x - 5, p.y + 4); c.closePath(); }
      c.fill(); c.stroke();
      c.font = 'bold 10px monospace'; const label = `${fix.id}${fix.training ? ' · EX' : ''}`;
      const w = c.measureText(label).width + 6;
      c.fillStyle = 'rgba(10,28,24,.82)'; c.fillRect(p.x + 8, p.y - 10, w, 15);
      c.fillStyle = selected ? '#ffe38a' : '#e4f2e8'; c.fillText(label, p.x + 11, p.y + 1);
    }
    c.fillStyle = '#112a24'; c.fillRect(camera.width - 43, 12, 30, 48);
    c.fillStyle = '#e3eddb'; c.font = 'bold 11px monospace'; c.fillText('N', camera.width - 32, 26);
    c.strokeStyle = '#e3eddb'; c.lineWidth = 1; c.beginPath(); c.moveTo(camera.width - 28, 52); c.lineTo(camera.width - 28, 32); c.lineTo(camera.width - 32, 39); c.moveTo(camera.width - 28, 32); c.lineTo(camera.width - 24, 39); c.stroke();
    c.restore();
  }

  static headingArrow(ctx, camera, aircraft, pointer, valid) {
    const from = camera.screen(aircraft.pos); const dx = pointer.x - from.x; const dy = pointer.y - from.y;
    const length = Math.hypot(dx, dy); if (length < 6) return;
    const heading = AirNavigation.heading(from, pointer); const angle = Math.atan2(dy, dx); const c = ctx;
    c.save(); c.strokeStyle = valid ? '#ffe38a' : '#fa8473'; c.fillStyle = c.strokeStyle; c.lineWidth = 2;
    c.setLineDash([7, 4]); c.beginPath(); c.moveTo(from.x, from.y); c.lineTo(pointer.x, pointer.y); c.stroke(); c.setLineDash([]);
    c.beginPath(); c.moveTo(pointer.x, pointer.y); c.lineTo(pointer.x - Math.cos(angle - .45) * 12, pointer.y - Math.sin(angle - .45) * 12); c.lineTo(pointer.x - Math.cos(angle + .45) * 12, pointer.y - Math.sin(angle + .45) * 12); c.closePath(); c.fill();
    const text = valid ? `CAP VRAI ${Math.round(heading).toString().padStart(3, '0')}° · relâchez` : 'Cap indisponible au sol / pendant la montée initiale';
    c.font = 'bold 11px monospace'; const width = c.measureText(text).width + 14;
    const x = Math.max(3, Math.min(camera.width - width - 3, pointer.x + 12)); const y = Math.max(20, pointer.y - 12);
    c.fillStyle = '#0f2723'; c.fillRect(x, y - 15, width, 23); c.fillStyle = valid ? '#ffe38a' : '#fa8473'; c.fillText(text, x + 7, y);
    c.restore();
  }
}
globalThis.AirspaceRenderer = AirspaceRenderer;
