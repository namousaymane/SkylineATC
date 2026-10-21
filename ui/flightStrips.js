/** Stable DOM identities keep clicks and keyboard focus valid as telemetry changes. */
class FlightStrips {
  static lists = new WeakMap();
  static render(container, aircraft, selected) {
    let state = this.lists.get(container);
    if (!state) { container.replaceChildren(); state = { rows: new Map(), empty: null }; this.lists.set(container, state); }
    const active = new Set(aircraft.map(a => a.callsign));
    for (const [id, item] of state.rows) if (!active.has(id)) { item.row.remove(); state.rows.delete(id); }
    if (aircraft.length && state.empty) { state.empty.remove(); state.empty = null; }
    for (const a of aircraft) {
      let item = state.rows.get(a.callsign);
      if (!item) {
        const row = document.createElement('div'); row.dataset.callsign = a.callsign; row.setAttribute('role', 'button'); row.tabIndex = 0;
        const marker = document.createElement('span'); marker.className = 'row-line';
        const info = document.createElement('div'); const name = document.createElement('strong'); const detail = document.createElement('small');
        const status = document.createElement('span'); status.className = 'row-state';
        info.append(name, detail); row.append(marker, info, status); container.append(row);
        item = { row, name, detail, status }; state.rows.set(a.callsign, item);
      }
      item.row.className = `traffic-row${a.altitude === 0 ? ' ground' : ''}${a === selected ? ' selected' : ''}${a.emergency ? ' emergency' : ''}`;
      item.row.setAttribute('aria-label', `Sélectionner ${a.callsign}, ${a.modelId}, ${a.state}`);
      item.name.textContent = a.callsign;
      const flight = a.altitude > 0 ? `${Math.round(a.altitude)} / ${a.assignedAltitude} ft · HDG ${String(Math.round(a.heading + 450) % 360).padStart(3, '0')}°` : 'SOL';
      item.detail.textContent = `${a.modelId} · ${flight} · RWY ${a.assignedRunway ?? '?'}`;
      item.status.textContent = `${a.tcasAdvisory ? `TCAS ${a.tcasAdvisory.level} · ` : ''}${a.state.replaceAll('_', ' ')}`;
    }
    if (!aircraft.length && !state.empty) {
      state.empty = document.createElement('p'); state.empty.className = 'traffic-empty'; state.empty.textContent = 'Aucun vol dans le secteur.'; container.append(state.empty);
    }
  }
}
globalThis.FlightStrips = FlightStrips;
