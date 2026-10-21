/** WGS84 positions transcribed from the official publications linked per point. */
class NavigationCatalog {
  static sources = Object.freeze({
    MA: 'https://siamaroc.onda.ma/eaip/ENR/ENR4.4.pdf',
    FR: 'https://www.sia.aviation-civile.gouv.fr/media/dvd/eAIP_16_APR_2026/FRANCE/AIRAC-2026-04-16/pdf/FR-ENR-4.4-fr-FR.pdf',
    FAA: 'https://www.faa.gov/air_traffic/publications/atpubs/lid/L_PC.htm',
    ZACHS: 'https://aeronav.faa.gov/acifp/0D6FBBCBF6AB44E88AE89DB504B94305-JFK/NY_KJFK_RNAV%20GPS%20Z%20RWY%2013R_ORIG_8260-2.pdf',
    JFK: 'https://www.govinfo.gov/content/pkg/FR-2020-07-06/pdf/FR-2020-07-06.pdf'
  });
  static points = Object.freeze({
    GMMN: [
      ['BODNI', '332054N', '0075015W', 'MA'],
      ['BIRVO', '331711.57N', '0081130.00W', 'MA'],
      ['EVDOL', '333352.82N', '0072514.26W', 'MA'],
      ['DEVNO', '330237.36N', '0074341.65W', 'MA'],
      ['GODPO', '331058.24N', '0070436.26W', 'MA'],
      ['KOTAG', '330909.01N', '0071619.14W', 'MA']
    ],
    GMMX: [
      ['LANBA', '315009.45N', '0082337.76W', 'MA'],
      ['BENOV', '320538.77N', '0082716.64W', 'MA'],
      ['GOSNO', '311905N', '0083432W', 'MA'],
      ['KUDAX', '314830.86N', '0074018.96W', 'MA']
    ],
    LFMN: [
      ['BADPO', '433933.1N', '0073407.7E', 'FR'],
      ['AMGEL', '434955.4N', '0072228.7E', 'FR'],
      ['AMIRO', '435627.7N', '0064452.9E', 'FR'],
      ['AMFOU', '433545.0N', '0060604.0E', 'FR'],
      ['LANKO', '431338.0N', '0060052.0E', 'FR']
    ],
    KJFK: [
      ['CAMRN', '400102.2900N', '0735139.8100W', 'FAA'],
      ['ZACHS', '403143.69N', '0733313.91W', 'ZACHS'],
      ['HNNAH', '402812.73N', '0740236.62W', 'JFK'],
      ['DPK', '404730.30N', '0731813.17W', 'JFK', 'VOR/DME'],
      ['JFK', '403758.40N', '0734617.00W', 'JFK', 'VOR/DME']
    ]
  });

  static dms(input) {
    const match = String(input).match(/^(\d+(?:\.\d+)?)([NSEW])$/);
    if (!match) throw new Error('Invalid DMS coordinate');
    const width = /[NS]/.test(match[2]) ? 2 : 3;
    const degrees = Number(match[1].slice(0, width));
    const minutes = Number(match[1].slice(width, width + 2));
    const seconds = Number(match[1].slice(width + 2));
    if (minutes >= 60 || seconds >= 60 || degrees > (width === 2 ? 90 : 180)) throw new Error('DMS coordinate out of range');
    return (degrees + minutes / 60 + seconds / 3600) * (/[SW]/.test(match[2]) ? -1 : 1);
  }

  static forAirport(airport) {
    const units = (airport.metersToPixels ?? .2) * 1852;
    const center = airport.center ?? { x: 550, y: 310 };
    const exits = Array.from({ length: 8 }, (_, index) => {
      const bearing = index * 45; const angle = (bearing - 90) * Math.PI / 180;
      return { id: `EXIT-${String(bearing).padStart(3, '0')}`, x: center.x + Math.cos(angle) * units * 72,
        y: center.y + Math.sin(angle) * units * 72, type: 'EXIT', training: true, source: null, sectorBearing: bearing };
    });
    if (!airport.project) {
      const u = (airport.metersToPixels ?? .2) * 1852;
      const exercise = [['TRN-N', 0, -8], ['TRN-E', 10, 0], ['TRN-S', 0, 8], ['TRN-W', -10, 0]].map(([id, x, y]) => ({ id, x: 550 + x * u, y: 310 + y * u, type: 'TRAINING', training: true, source: null }));
      return [...exercise, ...exits];
    }
    const published = (this.points[airport.id] ?? []).map(([id, latitude, longitude, source, type = 'FIX']) => {
      const lat = this.dms(latitude); const lon = this.dms(longitude);
      return { id, lat, lon, ...airport.project([lon, lat]), type, training: false, source: this.sources[source],
        ...(id === 'ZACHS' ? { publishedHold: true, publishedInboundMagnetic: 134.16, holdNote: 'FAA 8260-2, circuit publié ; géométrie de jeu simplifiée.' } : {}) };
    });
    return [...published, ...exits];
  }
}
globalThis.NavigationCatalog = NavigationCatalog;
