// Geometry is projected directly from locally bundled WGS84 OpenStreetMap data.
const AirportCatalog = {};
const airportNames = {
  CMN: ['GMMN', 'Casablanca Mohammed V', 'grass'],
  RAK: ['GMMX', 'Marrakech Menara', 'desert'],
  NCE: ['LFMN', 'Nice Côte d’Azur', 'coastal'],
  JFK: ['KJFK', 'John F. Kennedy International', 'coastal']
};
const trainingRunway = { id: '09/27', x1: 150, y1: 350, x2: 950, y2: 350, width: 24 };
const trainingWays = [
  { points: [{ x: 180, y: 260 }, { x: 920, y: 260 }] },
  ...[180, 400, 690, 920].map(x => ({ points: [{ x, y: 260 }, { x, y: 350 }] })),
  ...[380, 550, 720].map(x => ({ points: [{ x, y: 185 }, { x, y: 260 }] }))
];
function serviceSites(airport, terminals) {
  const anchor = terminals[0] ?? { x: 550, y: 310 };
  const candidates = [];
  for (let radius = 22; radius <= 130; radius += 8) for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
    const point = { x: anchor.x + Math.cos(angle) * radius, y: anchor.y + Math.sin(angle) * radius };
    const clear = airport.runways.every(runway => AirportGeometry.distanceToSegment(point, { x: runway.x1, y: runway.y1 }, { x: runway.x2, y: runway.y2 }) > runway.width / 2 + 14);
    if (clear) candidates.push({ ...point, radius });
  }
  const pad = candidates.sort((a, b) => a.radius - b.radius)[0] ?? { x: anchor.x + 60, y: anchor.y + 60 };
  return { helicopterPad: { id: 'H1', x: pad.x, y: pad.y }, rescueStation: { id: 'SRES', x: pad.x + 12, y: pad.y + 12 } };
}
AirportCatalog.SKY1 = { id: 'SKY1', name: 'Skyline Training Airport', surfaceTheme: 'grass', landscape: 'inland',
  center: { x: 550, y: 310 }, northAngle: 0, northUp: true, runway: trainingRunway, runways: [trainingRunway],
  taxiway: { x1: 180, y1: 260, x2: 920, y2: 260 }, taxiways: trainingWays,
  aprons: [{ x: 550, y: 210, w: 440, h: 100 }], terminals: [{ id: 'T1', x: 550, y: 150, w: 360, h: 35 }],
  parking: [380, 550, 720].map((x, i) => ({ id: `P${i + 1}`, x, y: 185 })), helicopterPad: { id: 'H1', x: 790, y: 205 }, rescueStation: { id: 'SRES', x: 810, y: 225 } };
AirportCatalog.SKY1.groundGraph = AirportGeometry.graph(AirportCatalog.SKY1);
for (const [iata, [icao, name, theme]] of Object.entries(airportNames)) {
  const geometry = AirportGeometry.projectCollection(AirportGeoData[icao]);
  const terminals = geometry.features.filter(f => f.properties.aeroway === 'terminal').map((f, i) => {
    const xs = f.points.map(p => p.x); const ys = f.points.map(p => p.y);
    return { id: f.properties.ref ?? `T${i + 1}`, name: f.properties.name ?? 'Terminal', x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2, w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  });
  const airport = { ...geometry, id: icao, iata, name, surfaceTheme: theme, landscape: theme === 'coastal' ? 'coastal' : 'inland', center: { x: 550, y: 310 },
    runway: geometry.runways[0], taxiway: geometry.taxiways[0], terminals, aprons: [] };
  // Bridge missing apron lead-ins only. Existing taxiways remain geographically intact.
  const originalWays = [...airport.taxiways];
  for (const stand of airport.parking.filter(p => p.points)) {
    let best = null; let distance = 35;
    for (const p of [stand.points[0], stand.points.at(-1)]) for (const way of originalWays) for (let j = 1; j < way.points.length; j++) {
      const a = way.points[j - 1]; const b = way.points[j]; const dx = b.x - a.x; const dy = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
      const q = { x: a.x + t * dx, y: a.y + t * dy }; const d = Math.hypot(p.x - q.x, p.y - q.y);
      if (d < distance) { distance = d; best = [p, q]; }
    }
    if (best && distance > .02) airport.taxiways.push({ points: best, properties: { aeroway: 'taxilane', simulated: true, width: 15 } });
  }
  airport.groundGraph = AirportGeometry.graph(airport);
  // A few maps do not contain stand centerlines; use apron-adjacent graph nodes.
  if (airport.parking.length < 3) {
    const nodes = [...airport.groundGraph.nodes].sort((a, b) => Math.hypot(a.x - (terminals[0]?.x ?? 550), a.y - (terminals[0]?.y ?? 310)) - Math.hypot(b.x - (terminals[0]?.x ?? 550), b.y - (terminals[0]?.y ?? 310)));
    for (const node of nodes) {
      if (airport.parking.every(p => Math.hypot(p.x - node.x, p.y - node.y) > 18)) airport.parking.push({ id: `S${airport.parking.length + 1}`, x: node.x, y: node.y, simulated: true });
      if (airport.parking.length >= 4) break;
    }
  }
  // Keep the operational stand set readable at sector zoom; preserve real stand geometry and spread.
  airport.parking = AirportGeometry.thinParking(airport.parking, { maxStands: 18, minSpacing: 20 });
  airport.groundGraph = AirportGeometry.graph(airport);
  Object.assign(airport, serviceSites(airport, terminals));
  AirportCatalog[iata] = airport;
}
globalThis.AirportCatalog = AirportCatalog;
