/** Geographic geometry and ground graph, shared by drawing and steering routes. */
class AirportGeometry {
  static projectCollection(collection) {
    const surface = collection.features.filter(f => ['runway', 'taxiway', 'apron', 'terminal', 'parking_position', 'hangar'].includes(f.properties.aeroway));
    const coordinates = surface.flatMap(f => f.geometry.type === 'Polygon' ? f.geometry.coordinates.flat() : f.geometry.coordinates);
    const lon0 = coordinates.reduce((sum, p) => sum + p[0], 0) / coordinates.length;
    const lat0 = coordinates.reduce((sum, p) => sum + p[1], 0) / coordinates.length;
    const geographic = ([lon, lat]) => ({ x: (lon - lon0) * Math.cos(lat0 * Math.PI / 180) * 111320, y: -(lat - lat0) * 111320 });
    // Fixed true-north-up projection: east = +x, north = -y. Never rotate by runway.
    const raw = geographic;
    const points = coordinates.map(raw);
    const minX = Math.min(...points.map(p => p.x)); const maxX = Math.max(...points.map(p => p.x));
    const minY = Math.min(...points.map(p => p.y)); const maxY = Math.max(...points.map(p => p.y));
    const scale = Math.min(900 / (maxX - minX), 440 / (maxY - minY));
    const project = coordinate => { const p = raw(coordinate); return { x: 550 + (p.x - (minX + maxX) / 2) * scale, y: 310 + (p.y - (minY + maxY) / 2) * scale }; };
    const features = collection.features.map(f => ({ ...f, points: f.geometry.type === 'Polygon' ? f.geometry.coordinates[0].map(project) : f.geometry.coordinates.map(project) }));
    const groups = new Map();
    for (const f of features.filter(f => f.properties.aeroway === 'runway' && f.geometry.type === 'LineString' && f.properties.ref)) {
      const group = groups.get(f.properties.ref);
      if (group) group.points.push(...f.points); else groups.set(f.properties.ref, { ...f, points: [...f.points] });
    }
    const runways = [...groups.values()].map(f => {
      let best = [f.points[0], f.points.at(-1)]; let distance = 0;
      for (const a of f.points) for (const b of f.points) { const d = Math.hypot(a.x - b.x, a.y - b.y); if (d > distance) { distance = d; best = [a, b]; } }
      f.points = best;
      let first = f.points[0]; let last = f.points.at(-1);
      const id = f.properties.ref ?? 'RWY';
      const bearing = Number.parseInt(id.split('/')[0], 10) * 10 * Math.PI / 180;
      const bx = Math.sin(bearing);
      const by = -Math.cos(bearing);
      if ((last.x - first.x) * bx + (last.y - first.y) * by < 0) [first, last] = [last, first];
      return { id, x1: first.x, y1: first.y, x2: last.x, y2: last.y, width: Math.max(9, Number.parseFloat(f.properties.width ?? 45) * scale), sourceId: f.id };
    });
    const taxiways = features.filter(f => ['taxiway', 'taxilane'].includes(f.properties.aeroway) && f.geometry.type === 'LineString');
    const stands = features.filter(f => f.properties.aeroway === 'parking_position' && f.geometry.type === 'LineString').map((f, i) => ({ id: f.properties.ref ?? `S${i + 1}`, ...f.points.at(-1), points: f.points, ...(String(f.properties.ref ?? '').includes('A380') ? { maxWingspan: 85 } : {}) }));
    return { features, runways, taxiways, parking: stands, metersToPixels: scale, project, northAngle: 0, northUp: true, source: collection.metadata };
  }

  static distanceToSegment(point, a, b) {
    const dx = b.x - a.x; const dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
  }

  static graph(airport) {
    const nodes = new Map(); const edges = [];
    const key = p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
    const node = p => { const id = key(p); if (!nodes.has(id)) nodes.set(id, { ...p, id, edges: [] }); return nodes.get(id); };
    for (const way of [...airport.taxiways, ...airport.parking.filter(p => p.points)]) {
      for (let i = 1; i < way.points.length; i++) {
        const a = node(way.points[i - 1]); const b = node(way.points[i]);
        const cost = Math.hypot(a.x - b.x, a.y - b.y);
        a.edges.push({ node: b, cost }); b.edges.push({ node: a, cost }); edges.push([a, b]);
      }
    }
    const list = [...nodes.values()];
    // OSM ways can meet in the middle of a segment without sharing a node.
    // Snap endpoints to nearby real segment projections, never to a remote strip.
    for (const a of list.filter(n => n.edges.length === 1)) {
      let best = null; let distance = 1.4;
      for (const [b, d] of edges) {
        if (a === b || a === d) continue;
        const dx = d.x - b.x; const dy = d.y - b.y;
        const t = Math.max(0, Math.min(1, ((a.x - b.x) * dx + (a.y - b.y) * dy) / (dx * dx + dy * dy || 1)));
        const p = { x: b.x + t * dx, y: b.y + t * dy };
        const current = Math.hypot(a.x - p.x, a.y - p.y);
        if (current < distance) { distance = current; best = { b, d, p }; }
      }
      if (best) for (const b of [best.b, best.d]) { const cost = Math.hypot(a.x - b.x, a.y - b.y); a.edges.push({ node: b, cost }); b.edges.push({ node: a, cost }); }
    }
    return { nodes: list, edges };
  }

  static thinParking(stands, { maxStands = 18, minSpacing = 20 } = {}) {
    if (!Array.isArray(stands) || stands.length === 0) return stands ?? [];
    const chosen = [];
    const center = stands.reduce((sum, p) => ({ x: sum.x + p.x / stands.length, y: sum.y + p.y / stands.length }), { x: 0, y: 0 });
    const first = stands.reduce((best, p) => Math.hypot(p.x - center.x, p.y - center.y) < Math.hypot(best.x - center.x, best.y - center.y) ? p : best);
    chosen.push(first);
    while (chosen.length < maxStands) {
      let candidate = null; let greatestGap = minSpacing;
      for (const stand of stands) {
        if (chosen.includes(stand)) continue;
        const gap = Math.min(...chosen.map(p => Math.hypot(stand.x - p.x, stand.y - p.y)));
        if (gap > greatestGap) { greatestGap = gap; candidate = stand; }
      }
      if (!candidate) break;
      chosen.push(candidate);
    }
    return stands.filter(stand => chosen.includes(stand));
  }

  static route(airport, from, to) {
    const graph = airport.groundGraph ??= this.graph(airport);
    if (!graph.nodes.length) return null;
    const nearest = p => graph.nodes.reduce((a, b) => Math.hypot(a.x - p.x, a.y - p.y) < Math.hypot(b.x - p.x, b.y - p.y) ? a : b);
    const start = nearest(from);
    const connected = new Set([start]); const pending = [start];
    while (pending.length) for (const edge of pending.pop().edges) if (!connected.has(edge.node)) { connected.add(edge.node); pending.push(edge.node); }
    const end = [...connected].reduce((a, b) => Math.hypot(a.x - to.x, a.y - to.y) < Math.hypot(b.x - to.x, b.y - to.y) ? a : b);
    if (Math.hypot(end.x - to.x, end.y - to.y) > 45) return null;
    const costs = new Map([[start, 0]]); const previous = new Map(); const queue = new Set([start]);
    while (queue.size) {
      const current = [...queue].reduce((a, b) => costs.get(a) < costs.get(b) ? a : b); queue.delete(current);
      if (current === end) break;
      for (const edge of current.edges) {
        const cost = costs.get(current) + edge.cost;
        if (cost < (costs.get(edge.node) ?? Infinity)) { costs.set(edge.node, cost); previous.set(edge.node, current); queue.add(edge.node); }
      }
    }
    if (!costs.has(end)) return null;
    const path = []; for (let node = end; node; node = previous.get(node)) path.unshift({ x: node.x, y: node.y });
    return [{ x: from.x, y: from.y }, ...path, { x: to.x, y: to.y }];
  }
}
globalThis.AirportGeometry = AirportGeometry;
