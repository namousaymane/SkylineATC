/** Small play HUD; legacy inspectors are kept exclusively behind D. */
class GameHud {
  constructor() {
    this.menu = true; this.help = false; this.debug = false; this.wasPaused = false; this.tutorial = new Tutorial();
    this.audio = new ATCAudio();
    document.body.classList.add('show-traffic');
    byId('play-menu').textContent = '☰ Skyline ATC'; byId('play-menu').title = 'Menu principal · Échap';
    byId('play-airport').textContent = '⌖ Aéroport'; byId('play-airport').title = 'Cadrer l’aéroport · O';
    byId('ai-lab-open').textContent = 'Laboratoire IA'; byId('play-help').textContent = '? Aide';
    byId('flight-bars-toggle').onclick = () => this.dispatch('traffic');
    byId('ai-atc-toggle').onclick = () => {
      const enabled = session.aiAtc?.toggle();
      byId('ai-atc-toggle').setAttribute('aria-pressed', String(Boolean(enabled)));
      byId('ai-atc-toggle').querySelector('.ai-atc-state').textContent = enabled ? 'ON' : 'OFF';
      byId('ai-atc-toggle').title = enabled ? 'Désactiver le contrôle IA et reprendre les clairances' : 'Transférer les clairances au contrôle IA';
    };
    byId('audio-toggle').onclick = () => this.setAudioEnabled(this.audio.toggle());
    KeyboardGuide.mount(byId('keyboard-diagram'), byId('keyboard-detail'));
    byId('play-airport').onclick = () => { this.dispatch('airport'); document.activeElement?.blur(); };
    byId('keyboard-close').onclick = () => this.toggleHelp(false);
    document.body.classList.add('play-mode');
    document.querySelector('#play-runway').append(byId('runway-select').closest('label'));
    document.querySelector('#menu-settings').append(document.querySelector('.session-controls'));
    document.querySelector('.session-controls').classList.remove('session-collapsed');
    SteeringDebug.mount();
    const orders = document.createElement('details'); orders.className = 'play-orders';
    orders.innerHTML = '<summary>Clairances et navigation</summary><div id="play-order-controls"></div>';
    document.querySelector('.play-card').append(orders);
    const controls = orders.querySelector('#play-order-controls');
    for (const id of ['heading-input', 'nav-fix-select', 'hold-course', 'hold-turn', 'altitude-input', 'parking-select']) controls.append(byId(id).closest('label'));
    for (const id of ['heading-button', 'direct-button', 'hold-button', 'altitude-button', 'assign-runway-button', 'assign-parking-button', 'landing-button', 'goaround-button', 'pushback-button', 'taxi-button', 'cross-button', 'lineup-button', 'takeoff-button', 'cancel-takeoff-button', 'expedite-exit-button', 'return-to-stand-button', 'retry-takeoff-button', 'intercept-button']) controls.append(byId(id));
    byId('game-mode').addEventListener('change', () => this.updateModeDescription());
    for (const card of document.querySelectorAll('[data-mode-choice]')) card.onclick = () => { byId('game-mode').value = card.dataset.modeChoice; this.updateModeDescription(); };
    byId('menu-settings-toggle').onclick = () => {
      const settings = byId('menu-settings'); settings.hidden = !settings.hidden;
      byId('menu-settings-toggle').setAttribute('aria-expanded', String(!settings.hidden));
      byId('menu-settings-toggle').textContent = settings.hidden ? 'RÉGLAGES DE SESSION' : 'MASQUER LES RÉGLAGES';
    };
    byId('result-again').onclick = () => { this.applyGameMode(); resetTraining(); this.wasPaused = false; this.toggleMenu(false); };
    byId('result-menu').onclick = () => { byId('mission-result').hidden = true; this.toggleMenu(true); };
    byId('play-resume').onclick = () => this.toggleMenu(false);
    byId('play-new').onclick = () => { this.applyGameMode(); resetTraining(); this.wasPaused = false; this.tutorial.skip(); this.toggleMenu(false); };
    byId('play-tutorial').onclick = () => this.startTutorial();
    byId('play-menu').onclick = () => this.toggleMenu();
    byId('play-help').onclick = () => { this.toggleHelp(); document.activeElement?.blur(); };
    byId('tutorial-close').onclick = () => { this.tutorial.skip(); this.update(); };
    byId('play-primary').onclick = () => { const primary = GameInput.primary(selectedAirplane); if (primary) this.dispatch(primary.action); document.activeElement?.blur(); };
    byId('runway-select').addEventListener('change', () => byId('runway-select').blur());
    document.addEventListener('keydown', event => {
      if (event.defaultPrevented) return;
      if (aiLabView?.isOpen) return;
      if ((this.menu || this.help) && event.key === 'Tab') {
        const controls = [...byId(this.help ? 'play-help-panel' : 'play-modal').querySelectorAll('button,select,input')].filter(el => !el.disabled && el.getClientRects().length > 0);
        const index = controls.indexOf(document.activeElement); const next = (index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length;
        event.preventDefault(); controls[next]?.focus(); return;
      }
      const action = GameInput.action(event, this.menu || this.help); if (!action) return;
      event.preventDefault(); this.dispatch(action);
    });
    this.toggleMenu(true);
    this.updateModeDescription();
  }
  updateModeDescription() {
    const descriptions = {
      FREE: 'Partie sans fin : trafic continu selon les réglages. Aucun écran de défaite ; entraînez-vous à votre rythme.',
      MISSIONS: 'Scénario limité : traitez tous les vols pour terminer. Départ 1 000 pts, vol traité +250, collision −500.',
      EMERGENCY: 'Scénario d’urgence limité : résolvez la panne, la panne radio ou le détournement, puis gérez l’arrivée. Fin à la résolution des objectifs.',
      AIRPORT: 'Bac à sable sans fin : choisissez un aéroport et gérez son trafic, sans objectif ni fin de partie.'
    };
    byId('game-mode-description').textContent = descriptions[byId('game-mode').value] ?? descriptions.FREE;
    const scenario = byId('scenario-select'); const mode = byId('game-mode').value;
    byId('random-traffic').disabled = ['MISSIONS', 'EMERGENCY'].includes(mode);
    byId('random-traffic').title = byId('random-traffic').disabled ? 'Le trafic est limité aux objectifs du scénario dans ce mode.' : 'Génère de nouveaux vols en continu.';
    for (const option of scenario.options) {
      option.hidden = mode === 'MISSIONS' ? ['CALM', 'ENGINE_FAILURE', 'RADIO_FAILURE'].includes(option.value)
        : mode === 'EMERGENCY' ? !['ENGINE_FAILURE', 'RADIO_FAILURE', 'HIJACK'].includes(option.value)
          : false;
    }
    if (scenario.selectedOptions[0]?.hidden) scenario.value = mode === 'MISSIONS' ? 'PEAK_HOUR' : mode === 'EMERGENCY' ? 'ENGINE_FAILURE' : 'CALM';
    for (const card of document.querySelectorAll('[data-mode-choice]')) card.setAttribute('aria-pressed', String(card.dataset.modeChoice === mode));
  }
  applyGameMode() {
    this.updateModeDescription();
    const mode = byId('game-mode').value;
    if (mode === 'MISSIONS' && ['CALM', 'ENGINE_FAILURE', 'RADIO_FAILURE'].includes(byId('scenario-select').value)) byId('scenario-select').value = 'PEAK_HOUR';
    if (mode === 'EMERGENCY' && !['ENGINE_FAILURE', 'RADIO_FAILURE', 'HIJACK'].includes(byId('scenario-select').value)) byId('scenario-select').value = 'ENGINE_FAILURE';
  }
  toggleMenu(open = !this.menu) {
    if (open && !this.menu) this.wasPaused = session.simulation.paused;
    this.menu = open; session.simulation.paused = open ? true : this.wasPaused;
    this.update(); if (!open) document.activeElement?.blur(); else byId('play-resume').focus();
  }
  startTutorial() {
    byId('game-mode').value = 'FREE'; this.updateModeDescription();
    byId('airport-select').value = 'SKY1'; byId('scenario-select').value = 'CALM'; byId('random-traffic').checked = false;
    resetTraining(); this.tutorial.start(); this.wasPaused = false; this.toggleMenu(false);
  }
  toggleHelp(open = !this.help) {
    if (open && !this.help) this.helpWasPaused = session.simulation.paused;
    this.help = open; session.simulation.paused = open ? true : this.helpWasPaused;
    this.update();
  }
  dispatch(action) {
    if (this.help) { if (['menu', 'help'].includes(action)) this.toggleHelp(false); return; }
    if (action === 'menu') { this.toggleMenu(); return; }
    if (action === 'help') { this.toggleHelp(); return; }
    if (this.menu) return;
    if (session.aiAtc?.enabled && ['approach', 'land', 'goaround', 'pushback', 'taxi', 'cross', 'lineup', 'takeoff', 'hold', 'direct', 'intercept', 'climb', 'descend', 'emergency', 'runwayAction', 'cancelTakeoff', 'expediteExit', 'returnToStand', 'retryTakeoff', 'departureExit'].includes(action)) {
      session.lastMessage = 'Contrôle IA actif : désactivez IA ATC pour reprendre les clairances.';
      this.update(); return;
    }
    if (action === 'runwayAction') action = selectedAirplane?.state === 'TAKEOFF_ROLL' ? 'cancelTakeoff' : 'expediteExit';
    const buttons = { pause: 'pause-button', approach: 'assign-runway-button', land: 'landing-button', goaround: 'goaround-button', pushback: 'pushback-button', taxi: 'taxi-button', cross: 'cross-button', lineup: 'lineup-button', takeoff: 'takeoff-button', hold: 'hold-button', direct: 'direct-button', intercept: 'intercept-button', follow: 'follow-aircraft', arrival: 'new-arrival-button', newHelicopter: 'new-helicopter-button', storm: 'storm-button', emergency: 'emergency-button', cancelTakeoff: 'cancel-takeoff-button', expediteExit: 'expedite-exit-button', returnToStand: 'return-to-stand-button', retryTakeoff: 'retry-takeoff-button', zoomIn: 'zoom-in', zoomOut: 'zoom-out', departureExit: 'play-assign-exit' };
    let success = true;
    if (buttons[action]) {
      const button = byId(buttons[action]); success = !button.disabled;
      if (success && action === 'pushback' && selectedAirplane?.assignedRunway !== byId('runway-select').value) {
        success = session.assignRunway(selectedAirplane, byId('runway-select').value);
      }
      if (success) { const before = session.eventLog[0]; button.click(); if (!['pause', 'follow', 'zoomIn', 'zoomOut'].includes(action)) success = session.eventLog[0] !== before; }
    } else if (action === 'debug') { this.debug = !this.debug; document.body.classList.toggle('debug-mode', this.debug); windowResized(); }
    else if (action === 'helicopter') success = selectedAirplane?.state === 'PARKED'
      ? session.launchHelicopter(selectedAirplane) : session.returnHelicopter(selectedAirplane);
    else if (action === 'tutorial') { this.startTutorial(); return; }
    else if (action === 'traffic') document.body.classList.toggle('show-traffic');
    else if (action === 'airport') { view.airport(); this.airportView = true; }
    else if (action === 'next') {
      const list = sectorAircraft(); const index = list.indexOf(selectedAirplane);
      if (list.length) { selectAircraft(list[(index + 1) % list.length]); this.record('select'); }
    } else if (action === 'runway') {
      const select = byId('runway-select'); const options = [...select.options].filter(o => !o.disabled); const index = options.findIndex(o => o.value === select.value);
      if (options.length) select.value = options[(index + 1) % options.length].value;
    } else if (action === 'view') { this.airportView = !this.airportView; this.airportView ? view.airport() : view.airspace(); }
    else if (['climb', 'descend'].includes(action)) success = session.airNavigation.setAltitude(selectedAirplane, (selectedAirplane?.assignedAltitude ?? 2000) + (action === 'climb' ? 500 : -500));
    this.record(action, success); this.previousMessage = session.lastMessage; this.update();
  }
  record(event, success = true) { this.tutorial.record(event, success); }
  setAudioEnabled(enabled) {
    const button = byId('audio-toggle');
    button.setAttribute('aria-pressed', String(enabled));
    button.querySelector('.audio-state').textContent = enabled ? 'ON' : 'OFF';
    button.setAttribute('aria-label', `Communications ATC ${enabled ? 'activées' : 'désactivées'}`);
    button.title = enabled ? 'Couper les communications vocales ATC' : 'Activer les communications vocales ATC';
  }
  update() {
    if (this.menu || this.help) session.simulation.paused = true;
    this.audio?.consume(session.eventLog);
    this.audio?.observeTCAS(session.simulation.entities.filter(entity => entity instanceof ModelAircraft));
    byId('play-modal').hidden = !this.menu; byId('play-help-panel').hidden = !this.help;
    byId('play-resume').hidden = scenario.mission.snapshot().status !== 'RUNNING';
    byId('tutorial-card').hidden = !this.tutorial.active;
    if (this.tutorial.active) { byId('tutorial-title').textContent = `${this.tutorial.index + 1}/${Tutorial.steps.length} · ${this.tutorial.step.title}`; byId('tutorial-text').textContent = this.tutorial.step.text; }
    const a = selectedAirplane; const live = Boolean(a && session.owns(a));
    const primary = live ? GameInput.primary(a, session.canAuthorizeLanding(a)) : null;
    byId('play-flight').textContent = live
      ? `${a.callsign} · ${a.modelId} · ${Math.round(a.altitude)} ft${view.visible(a.pos, 12) ? '' : ' · HORS VUE (F : suivre)'}`
      : 'Sélectionnez un avion visible · Tab';
    byId('play-state').textContent = live ? `${a.state}${a.altitude > 0 && a.telemetry?.behaviors?.includes('separation') ? ' · ⚠ TCAS' : ''}` : '—';
    const button = byId('play-primary'); button.hidden = !primary; button.textContent = primary ? `[${primary.key}] ${primary.label}` : '';
    if (byId('play-message').textContent !== session.lastMessage) byId('play-message').textContent = session.lastMessage;
    byId('play-fix').textContent = `Point : ${byId('nav-fix-select').value} · Entrée direct · H attente`;
    byId('play-score').textContent = `${scenario.demo ? 'DÉMO · ' : ''}${scenario.mission.snapshot().score} PTS · ${session.simulation.paused ? 'PAUSE' : 'EN JEU'}`;
    const mission = scenario.mission.snapshot();
    if (['COMPLETED', 'FAILED'].includes(mission.status) && !this.resultShown) {
      this.resultShown = true; this.wasPaused = true; session.simulation.paused = true;
      byId('result-summary').textContent = `${mission.label} · ${mission.completed.arrivals} arrivée(s) et ${mission.completed.departures} départ(s) traités.`;
      byId('result-title').textContent = mission.status === 'FAILED' ? 'MISSION ÉCHOUÉE · COLLISION' : 'MISSION TERMINÉE';
      byId('result-score').textContent = `${mission.score} PTS · +${mission.scoreBreakdown.arrivals * 250 + mission.scoreBreakdown.departures * 250} · −${mission.scoreBreakdown.collisions * 500}`;
      byId('mission-result').hidden = false;
    }
    byId('pause-button').textContent = session.simulation.paused ? 'Reprendre' : 'Pause';
    const aiButton = byId('ai-atc-toggle');
    if (aiButton && Boolean(session.aiAtc?.enabled) !== (aiButton.getAttribute('aria-pressed') === 'true')) {
      aiButton.setAttribute('aria-pressed', String(Boolean(session.aiAtc?.enabled)));
      aiButton.querySelector('.ai-atc-state').textContent = session.aiAtc?.enabled ? 'ON' : 'OFF';
    }
    const stripsVisible = document.body.classList.contains('show-traffic');
    if (aiButton) { aiButton.querySelector('.ai-atc-state').textContent = session.aiAtc?.enabled ? (session.aiAtc.brain ? 'ON · RÉSEAU' : 'ON · RÈGLES') : 'OFF'; aiButton.title = session.aiAtc?.brain ? 'Contrôleur neuronal installé · désactiver pour reprendre les clairances' : 'Contrôleur de référence à règles'; }
    const stripsButton = byId('flight-bars-toggle');
    stripsButton.setAttribute('aria-pressed', String(stripsVisible));
    stripsButton.textContent = stripsVisible ? '✈ Vols' : '✈ Vols masqués';
  }
}
globalThis.GameHud = GameHud;
