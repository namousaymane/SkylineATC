class AircraftRenderer {
  /** Top-view planform ratios, independent of the aircraft's actual dimensions. */
  static profile(model) {
    if (model.id === 'B788') return { wing: [[.09,.09],[-.05,.25],[-.17,.43],[-.28,.51],[-.34,.49],[-.22,.28],[-.20,.09]], tail: .24, engineX: -.035, engineY: [.19], wingtip: 'RAKED' };
    if (model.id === 'A388') return { wing: [[.11,.09],[.015,.27],[-.09,.43],[-.16,.50],[-.23,.50],[-.27,.29],[-.22,.09]], tail: .23, engineX: -.025, engineY: [.20,.33], wingtip: 'FENCE' };
    return { wing: [[.11,.09],[.015,.26],[-.14,.44],[-.20,.49],[-.25,.49],[-.24,.30],[-.19,.09]], tail: .21, engineX: -.015, engineY: [.22], wingtip: 'WINGLET' };
  }
  static render(aircraft, c = drawingContext, renderScale = aircraft.renderScale ?? 1) {
    const m = aircraft.model;
    const unit = m.helicopter ? .72 : .37; const length = m.length * unit; const span = m.span * unit;
    const fuselage = m.fuselage * unit;
    c.save();
    if (aircraft.destroyed) {
      const age = Math.max(0, 1 - aircraft.explosionTimer / 90);
      c.translate(aircraft.explosionOrigin?.x ?? aircraft.pos.x, aircraft.explosionOrigin?.y ?? aircraft.pos.y);
      c.scale(renderScale, renderScale);
      c.globalAlpha = 1 - age;
      c.fillStyle = '#ffd45c'; c.beginPath(); c.arc(0, 0, length * (.25 + age * .5), 0, Math.PI * 2); c.fill();
      c.fillStyle = '#ed5b2f'; c.beginPath(); c.arc(0, 0, length * (.14 + age * .32), 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#fff0ae'; c.lineWidth = 1.4;
      for (let i = 0; i < 8; i += 1) { const angle = i * Math.PI / 4; c.beginPath(); c.moveTo(Math.cos(angle) * length * .18, Math.sin(angle) * length * .18); c.lineTo(Math.cos(angle) * length * (.5 + age * .55), Math.sin(angle) * length * (.5 + age * .55)); c.stroke(); }
      c.restore(); return;
    }
    if (aircraft.smokeTimer > 0 && aircraft.smokeOrigin) {
      const alpha = Math.min(.45, aircraft.smokeTimer / 100);
      c.fillStyle = `rgba(250,250,245,${alpha})`;
      for (let i = 0; i < 3; i++) { c.beginPath(); c.ellipse(aircraft.smokeOrigin.x - i * 2, aircraft.smokeOrigin.y, 2 + i, 2, 0, 0, Math.PI * 2); c.fill(); }
    }
    c.translate(aircraft.pos.x, aircraft.pos.y);
    c.scale(renderScale, renderScale);
    const angle = aircraft.headingLocked ? aircraft.heading * Math.PI / 180 : aircraft.vel.magSq() > .0001 ? aircraft.vel.heading() : aircraft.heading * Math.PI / 180;
    c.rotate(angle);
    if (m.helicopter) {
      c.fillStyle = 'rgba(14,22,20,.25)'; c.beginPath(); c.ellipse(-1, 2, length * .48, span * .36, 0, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#263a3c'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(-length * .22, 0); c.lineTo(-length * .55, 0); c.stroke();
      c.fillStyle = m.color; c.beginPath(); c.ellipse(0, 0, length * .25, span * .32, 0, 0, Math.PI * 2); c.fill(); c.strokeStyle = '#33484a'; c.stroke();
      c.fillStyle = '#506b74'; c.beginPath(); c.ellipse(length * .17, 0, length * .08, span * .2, 0, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#283a3e'; c.lineWidth = .7; c.beginPath(); c.moveTo(-length * .58, -span * .18); c.lineTo(-length * .58, span * .18); c.stroke();
      c.beginPath(); c.moveTo(-length * .08, -span * .5); c.lineTo(-length * .08, span * .5); c.stroke();
      if (aircraft.emergency) { c.strokeStyle = '#f0645e'; c.lineWidth = 1; c.beginPath(); c.arc(0, 0, length * .58, 0, Math.PI * 2); c.stroke(); }
      c.restore(); return;
    }
    c.save(); c.translate(-1, 1 + Math.min(6, aircraft.altitude / 1000)); c.fillStyle = 'rgba(14,22,20,.27)'; c.beginPath(); c.ellipse(0, 0, length * .52, span * .18, 0, 0, Math.PI * 2); c.fill(); c.restore();
    const polygon = (points, color) => { c.fillStyle = color; c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); c.fill(); c.strokeStyle = '#59686a'; c.lineWidth = .28; c.stroke(); };
    const profile = this.profile(m);
    for (const side of [-1, 1]) {
      polygon(profile.wing.map(([x, y]) => [x * length, side * y * span]), '#e1e6e4');
      polygon([[-length * .30, side * fuselage * .33],[-length * .46, side * span * profile.tail],[-length * .49, side * span * profile.tail],[-length * .44, side * fuselage * .28]], m.color);
      if (profile.wingtip === 'WINGLET') { c.strokeStyle = m.color; c.lineWidth = .85; c.beginPath(); c.moveTo(-length * .20, side * span * .49); c.lineTo(-length * .17, side * span * .52); c.stroke(); }
      if (profile.wingtip === 'FENCE') { c.strokeStyle = m.color; c.lineWidth = .6; c.beginPath(); c.moveTo(-length * .16, side * span * .50); c.lineTo(-length * .14, side * span * .52); c.stroke(); }
      for (const offset of profile.engineY) {
        const y = side * span * offset; const x = length * profile.engineX - (offset - profile.engineY[0]) * length * .55;
        c.fillStyle = '#d7dddd'; c.beginPath(); c.ellipse(x, y, length * (m.id === 'B738' ? .065 : .075), fuselage * .34, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#35484e'; c.beginPath(); c.ellipse(x + length * .045, y, length * .014, fuselage * .25, 0, 0, Math.PI * 2); c.fill();
      }
    }
    c.fillStyle = '#f0f2ee'; c.beginPath(); c.ellipse(0, 0, length / 2, fuselage / 2, 0, 0, Math.PI * 2); c.fill(); c.strokeStyle = '#59696a'; c.lineWidth = .3; c.stroke();
    c.fillStyle = '#263b43'; c.beginPath(); c.ellipse(length * .415, 0, length * .055, fuselage * .32, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = m.color; c.fillRect(-length * .44, -fuselage * .3, length * .16, fuselage * .6);
    if (m.doubleDeck) { c.strokeStyle = '#9ba8a7'; c.lineWidth = .38; c.beginPath(); c.moveTo(length * .26, -fuselage * .18); c.lineTo(length * .36, -fuselage * .18); c.moveTo(length * .26, fuselage * .18); c.lineTo(length * .36, fuselage * .18); c.stroke(); }
    c.fillStyle = '#5b747b';
    for (let x = -length * .25; x < length * .27; x += .95) { c.fillRect(x, -fuselage * .35, .3, .23); c.fillRect(x, fuselage * .18, .3, .23); if (m.doubleDeck) c.fillRect(x, -.12, .3, .2); }
    for (const [side, color] of [[-1, '#ee514c'], [1, '#62d77d']]) { c.fillStyle = color; c.beginPath(); c.arc(-length * .27, side * span * .5, .45, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = '#f3f3e8'; c.fillRect(-length * .42, -fuselage * .18, length * .58, .38);
    if (aircraft.emergency) { c.strokeStyle = '#f0645e'; c.lineWidth = .8; c.strokeRect(-length / 2 - 2, -span / 2 - 2, length + 4, span + 4); }
    c.restore();
  }
}
globalThis.AircraftRenderer = AircraftRenderer;
