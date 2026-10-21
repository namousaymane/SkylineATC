const SkylineTrainingAirport = Object.freeze({
  id: 'SKY1',
  name: 'Skyline Training Airport',
  center: Object.freeze({ x: 600, y: 360 }),
  runway: Object.freeze({ x1: 170, y1: 360, x2: 1030, y2: 360, width: 46, id: '09/27' }),
  taxiway: Object.freeze({ x1: 210, y1: 230, x2: 990, y2: 230 }),
  parking: Object.freeze([
    Object.freeze({ id: 'P1', x: 300, y: 150 }),
    Object.freeze({ id: 'P2', x: 600, y: 150 }),
    Object.freeze({ id: 'P3', x: 900, y: 150 })
  ])
});

if (typeof globalThis !== 'undefined') globalThis.SkylineTrainingAirport = SkylineTrainingAirport;
