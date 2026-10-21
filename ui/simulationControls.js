/** Shared time control: slider zero pauses without losing the selected running speed. */
class SimulationControls {
  static speeds = Object.freeze([0, .25, .5, 1, 2, 4, 8]);
  static apply(simulation, index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.speeds.length) throw new RangeError('Invalid speed position');
    const speed = this.speeds[index]; simulation.paused = speed === 0;
    if (speed > 0) simulation.speed = speed;
    return speed;
  }
  static bind() {
    if (![...byId('speed-select').options].some(option => option.value === '.5' || option.value === '0.5')) {
      const option = document.createElement('option'); option.value = '0.5'; option.textContent = '0.50×'; byId('speed-select').append(option);
    }
    byId('sim-speed-slider').oninput = event => {
      SimulationControls.apply(session.simulation, Number(event.target.value));
      if (!session.simulation.paused) byId('speed-select').value = String(session.simulation.speed);
      SimulationControls.sync();
    };
    byId('sim-pause-toggle').onclick = () => { gameHud.dispatch('pause'); SimulationControls.sync(); };
    SimulationControls.sync();
  }
  static sync() {
    const slider = byId('sim-speed-slider'); if (!slider) return;
    const { paused, speed } = session.simulation;
    slider.value = String(paused ? 0 : Math.max(1, this.speeds.indexOf(speed)));
    slider.setAttribute('aria-valuetext', paused ? 'Simulation en pause' : `Vitesse ${speed} fois`);
    byId('sim-speed-value').textContent = paused ? 'PAUSE' : `${String(speed).replace('.', ',')}×`;
    const button = byId('sim-pause-toggle'); button.textContent = paused ? '▶' : 'Ⅱ';
    button.setAttribute('aria-label', paused ? 'Reprendre la simulation' : 'Mettre la simulation en pause');
    button.setAttribute('aria-pressed', String(paused));
    const locked = Boolean(gameHud?.menu || gameHud?.help || aiLabView?.isOpen);
    slider.disabled = locked; button.disabled = locked;
  }
}
globalThis.SimulationControls = SimulationControls;
