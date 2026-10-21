class RunwayDirections {
  static fromAirport(airport) {
    return airport.runways.flatMap(r => {
      const refs = r.id.split('/');
      const length = Math.hypot(r.x2 - r.x1, r.y2 - r.y1);
      return [
        { ...r, id: refs[0], physicalId: r.id, length, lengthMeters: length / (airport.metersToPixels ?? .2) },
        { ...r, id: refs[1] ?? `${refs[0]}R`, physicalId: r.id, x1: r.x2, y1: r.y2, x2: r.x1, y2: r.y1, length, lengthMeters: length / (airport.metersToPixels ?? .2) }
      ];
    });
  }
  static point(r, distance, lateral = 0) {
    const length = Math.hypot(r.x2 - r.x1, r.y2 - r.y1);
    const ux = (r.x2 - r.x1) / length; const uy = (r.y2 - r.y1) / length;
    return { x: r.x1 + ux * distance - uy * lateral, y: r.y1 + uy * distance + ux * lateral };
  }
}
globalThis.RunwayDirections = RunwayDirections;
