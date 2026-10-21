/** Pure input routing, shared by the browser and node:test. */
class GameInput {
  static bindings = Object.freeze({ ' ': 'pause', d: 'debug', Escape: 'menu', F1: 'tutorial', '?': 'help', Tab: 'next', a: 'approach', l: 'land', g: 'goaround', p: 'pushback', t: 'taxi', c: 'cross', u: 'lineup', k: 'takeoff', h: 'hold', m: 'helicopter', i: 'intercept', Enter: 'direct', r: 'runway', f: 'follow', v: 'view', b: 'traffic', n: 'arrival', w: 'storm', e: 'emergency', q: 'departureExit', x: 'runwayAction', PageUp: 'climb', PageDown: 'descend', '+': 'zoomIn', '=': 'zoomIn', '-': 'zoomOut' });
  static action(event, modal = false) {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return null;
    const tag = event.target?.tagName?.toLowerCase();
    if (event.target?.isContentEditable || ['input', 'select', 'textarea'].includes(tag)) {
      if (event.key === 'Escape') return 'menu';
      if (tag === 'select' && event.key.toLowerCase() === 'q') return 'departureExit';
      return null;
    }
    if (tag === 'button' && ['Enter', ' '].includes(event.key)) return null;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    const action = key === 'o' ? 'airport' : key === 'p' && globalThis.selectedAirplane?.state === 'TAKEOFF_ABORTED' ? 'returnToStand' : this.bindings[key];
    return modal && !['menu', 'help'].includes(action) ? null : action ?? null;
  }
  static primary(a, landingAllowed = true) {
    if (!a) return null;
    if (a.operation === 'HELICOPTER') return { action: 'helicopter', key: 'M', label: a.state === 'PARKED' ? 'Décoller de la station hélico' : 'Retourner à la station hélico' };
    if (['INBOUND', 'HOLDING', 'NAV_HEADING', 'NAV_DIRECT', 'NAV_HOLD_ENTRY', 'NAV_HOLD'].includes(a.state)) return { action: 'approach', key: 'A', label: 'Assigner l’approche' };
    if (['VECTORING', 'APPROACH', 'FINAL'].includes(a.state)) return a.landingCleared ? { action: 'goaround', key: 'G', label: 'Remise des gaz' } : landingAllowed ? { action: 'land', key: 'L', label: 'Autoriser l’atterrissage' } : null;
    if (a.state === 'TAKEOFF_ROLL') return { action: 'cancelTakeoff', key: 'X', label: 'Interrompre le décollage' };
    if (a.state === 'TAKEOFF_ABORTED') return { action: 'returnToStand', key: 'P', label: 'Retourner au parking' };
    if (a.state === 'ROLL_OUT') return { action: 'expediteExit', key: 'X', label: 'Dégagement prioritaire' };
    return ({ PARKED: a.operation === 'DEPARTURE' ? { action: 'pushback', key: 'P', label: 'Autoriser repoussage' } : null,
      READY_TAXI: { action: 'taxi', key: 'T', label: 'Autoriser taxi' }, WAITING_TAXI: { action: 'taxi', key: 'T', label: 'Taxi vers le stand' },
      WAITING_RUNWAY_CROSSING: { action: 'cross', key: 'C', label: 'Autoriser traversée' }, HOLD_SHORT: { action: 'lineup', key: 'U', label: 'Aligner et attendre' }, LINE_UP_WAIT: { action: 'takeoff', key: 'K', label: 'Autoriser décollage' }
    })[a.state] ?? null;
  }
}
globalThis.GameInput = GameInput;
