/** Small play HUD; legacy inspectors are kept exclusively behind D. */
class GameHud {
  constructor() {
    this.menu = true; this.help = false; this.debug = false; this.debugMenu = false; this.wasPaused = false; this.tutorial = new Tutorial();
    this.hasStarted = false;
    this.sky = typeof LobbySky !== 'undefined' ? new LobbySky(byId('lobby-sky')) : null;
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
    byId('debug-menu-toggle').onclick = () => this.dispatch('debugMenu');
    byId('keyboard-close').onclick = () => this.toggleHelp(false);
    document.body.classList.add('play-mode');
    const dock = document.createElement('div'); dock.className = 'flight-dock';
    dock.append(document.querySelector('.traffic-panel'), document.querySelector('.play-card'));
    document.body.append(dock);
    const placeDock = () => {
      document.documentElement.style.setProperty('--flight-dock-top', `${Math.ceil(document.querySelector('.play-top').getBoundingClientRect().bottom) + 12}px`);
    };
    this.layoutObserver = new ResizeObserver(placeDock);
    this.layoutObserver.observe(document.querySelector('.play-top')); placeDock();
    document.querySelector('#play-runway').append(byId('runway-select').closest('label'));
    for (const [id, slot] of Object.entries({
      'airport-select': 'lobby-airport-slot', 'scenario-select': 'lobby-scenario-slot',
      'traffic-intensity': 'lobby-traffic-slot', 'random-traffic': 'lobby-traffic-toggle-slot',
      'speed-select': 'lobby-speed-slot', 'traffic-seed': 'lobby-seed-slot'
    })) {
      byId(slot).append(byId(id).closest('label'));
    }
    byId('lobby-replay-slot').append(byId('replay-button'));
    SteeringDebug.mount();
    const orders = document.createElement('details'); orders.className = 'play-orders';
    orders.innerHTML = '<summary>Clairances et navigation</summary><div id="play-order-controls"></div>';
    document.querySelector('.play-card').append(orders);
    const controls = orders.querySelector('#play-order-controls');
    for (const id of ['heading-input', 'nav-fix-select', 'hold-course', 'hold-turn', 'altitude-input', 'parking-select']) controls.append(byId(id).closest('label'));
    for (const id of ['heading-button', 'direct-button', 'hold-button', 'altitude-button', 'assign-runway-button', 'assign-parking-button', 'landing-button', 'goaround-button', 'pushback-button', 'taxi-button', 'cross-button', 'lineup-button', 'takeoff-button', 'cancel-takeoff-button', 'expedite-exit-button', 'return-to-stand-button', 'retry-takeoff-button', 'intercept-button']) controls.append(byId(id));
    byId('game-mode').addEventListener('change', () => this.updateModeDescription());
    for (const card of document.querySelectorAll('[data-mode-choice]')) card.onclick = () => { byId('game-mode').value = card.dataset.modeChoice; this.updateModeDescription(); };
    for (const id of ['airport-select', 'scenario-select', 'traffic-intensity', 'random-traffic', 'weather-profile', 'time-of-day', 'emergency-time-limit']) {
      byId(id).addEventListener('change', () => this.updateLobbySummary());
    }
    byId('result-again').onclick = () => this.launchGame();
    byId('result-menu').onclick = () => { byId('mission-result').hidden = true; this.toggleMenu(true); };
    byId('play-resume').onclick = () => this.toggleMenu(false);
    byId('play-new').onclick = () => this.launchGame();
    byId('play-tutorial').onclick = () => this.startTutorial();
    byId('play-menu').onclick = () => this.toggleMenu();
    byId('play-help').onclick = () => { this.toggleHelp(); document.activeElement?.blur(); };
    byId('tutorial-close').onclick = () => { this.tutorial.skip(); this.update(); };
    byId('play-primary').onclick = () => { const primary = GameInput.primary(selectedAirplane); if (primary) this.dispatch(primary.action); document.activeElement?.blur(); };
    byId('runway-select').addEventListener('change', () => byId('runway-select').blur());
    document.addEventListener('keydown', event => {
      if (event.defaultPrevented) return;
      if (aiLabView?.isOpen) return;
      const resultOpen = !byId('mission-result').hidden;
      if ((this.menu || this.help || resultOpen) && event.key === 'Tab') {
        const controls = [...byId(resultOpen ? 'mission-result' : this.help ? 'play-help-panel' : 'play-modal').querySelectorAll('button,select,input,summary')].filter(el => !el.disabled && el.getClientRects().length > 0);
        const index = controls.indexOf(document.activeElement); const next = (index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length;
        event.preventDefault(); controls[next]?.focus(); return;
      }
      if (resultOpen) { if (event.key === 'Escape') byId('result-menu').click(); event.preventDefault(); return; }
      const action = GameInput.action(event, this.menu || this.help); if (!action) return;
      event.preventDefault(); this.dispatch(action);
    });
    this.toggleMenu(true);
    this.updateModeDescription();
  }
  updateModeDescription() {
    const descriptions = {
      FREE: 'Le trafic arrive en continu. Entraînez-vous sans limite de temps ni écran de défaite.',
      MISSIONS: 'Un exercice, un trafic fixé. Terminez tous les vols pour réussir ; une collision termine la mission.',
      EMERGENCY: 'Ramenez le vol en difficulté au stand avant la fin du chrono. Choisissez une urgence ou laissez le hasard décider.',
      AIRPORT: 'Explorez la plateforme choisie. Activez ou coupez le trafic automatique pour vos essais, sans fin de partie.'
    };
    const mode = byId('game-mode').value;
    byId('game-mode-description').textContent = descriptions[mode] ?? descriptions.FREE;
    byId('game-score-rules').textContent = mode === 'MISSIONS'
      ? '1 000 pts au départ · +250 par vol terminé · −500 par collision.'
      : mode === 'EMERGENCY'
        ? '1 000 pts au départ · +250 au stand · échec en cas de collision ou de temps écoulé.'
        : 'Départ : 0 pt · arrivée au stand ou sortie sûre : +100 · collision : −500.';
    const scenario = byId('scenario-select');
    const emergencyScenarios = ['ENGINE_FAILURE', 'RADIO_FAILURE', 'HIJACK', 'RANDOM_EMERGENCY'];
    const scenarioMode = ['MISSIONS', 'EMERGENCY'].includes(mode);
    if (mode === 'FREE') byId('random-traffic').checked = true;
    byId('random-traffic').disabled = scenarioMode;
    byId('random-traffic').title = scenarioMode ? 'Le trafic est limité aux objectifs du scénario dans ce mode.' : 'Génère de nouveaux vols en continu.';
    byId('lobby-scenario-slot').hidden = !scenarioMode;
    byId('lobby-traffic-slot').hidden = scenarioMode;
    byId('lobby-traffic-toggle-slot').hidden = mode !== 'AIRPORT';
    byId('traffic-intensity').disabled = scenarioMode;
    for (const option of scenario.options) {
      option.hidden = mode === 'MISSIONS' ? !['RUNWAY_CONFLICT', 'PEAK_HOUR', 'GO_AROUND'].includes(option.value)
        : mode === 'EMERGENCY' ? !emergencyScenarios.includes(option.value)
          : true;
      option.disabled = option.hidden;
    }
    if (!scenarioMode) { scenario.value = 'CALM'; scenario.querySelector('[value="CALM"]').disabled = false; }
    else if (scenario.selectedOptions[0]?.hidden) scenario.value = mode === 'MISSIONS' ? 'PEAK_HOUR' : 'RANDOM_EMERGENCY';
    const emergencyTimer = byId('emergency-time-limit')?.closest('label');
    if (emergencyTimer) emergencyTimer.hidden = mode !== 'EMERGENCY';
    for (const card of document.querySelectorAll('[data-mode-choice]')) card.setAttribute('aria-pressed', String(card.dataset.modeChoice === mode));
    this.updateLobbySummary();
  }
  updateLobbySummary() {
    const name = id => byId(id)?.selectedOptions?.[0]?.textContent ?? '';
    byId('lobby-summary').textContent = `${name('game-mode')} · ${name('airport-select')} · ${name('time-of-day')}`;
    const mode = byId('game-mode').value;
    byId('play-new').textContent = mode === 'EMERGENCY' ? 'Lancer l’urgence →' : mode === 'MISSIONS' ? 'Lancer la mission →' : 'Jouer →';
  }
  launchGame(replay = false) {
    this.applyGameMode(); resetTraining(replay); this.hasStarted = true;
    this.wasPaused = false; this.tutorial.skip(); this.toggleMenu(false);
  }
  applyGameMode() {
    this.updateModeDescription();
    const mode = byId('game-mode').value;
    if (mode === 'MISSIONS' && !['RUNWAY_CONFLICT', 'PEAK_HOUR', 'GO_AROUND'].includes(byId('scenario-select').value)) byId('scenario-select').value = 'PEAK_HOUR';
    if (mode === 'EMERGENCY' && !['ENGINE_FAILURE', 'RADIO_FAILURE', 'HIJACK', 'RANDOM_EMERGENCY'].includes(byId('scenario-select').value)) byId('scenario-select').value = 'ENGINE_FAILURE';
  }
  toggleMenu(open = !this.menu) {
    if (!open && this.hasStarted === false) return;
    if (open && !this.menu) this.wasPaused = session.simulation.paused;
    this.menu = open; session.simulation.paused = open ? true : this.wasPaused;
    this.update();
    if (!open) document.activeElement?.blur();
    else byId(this.hasStarted === false || byId('play-resume').hidden ? 'play-new' : 'play-resume').focus();
  }
  startTutorial() {
    byId('game-mode').value = 'FREE'; this.updateModeDescription();
    byId('airport-select').value = 'SKY1'; byId('scenario-select').value = 'CALM'; byId('random-traffic').checked = false;
    if (byId('weather-profile')) byId('weather-profile').value = 'CLEAR';
    if (byId('time-of-day')) byId('time-of-day').value = 'DAY';
    resetTraining(); this.hasStarted = true; this.tutorial.start(); this.wasPaused = false; this.toggleMenu(false);
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
    // The visible transport must not depend on dispatching a synthetic click
    // to the retired, hidden header control.
    if (action === 'pause') { session.simulation.togglePause(); this.record('pause'); this.update(); return; }
    if (session.aiAtc?.enabled && ['approach', 'land', 'goaround', 'pushback', 'taxi', 'cross', 'lineup', 'takeoff', 'hold', 'direct', 'intercept', 'climb', 'descend', 'emergency', 'runwayAction', 'cancelTakeoff', 'expediteExit', 'returnToStand', 'retryTakeoff', 'departureExit'].includes(action)) {
      session.lastMessage = 'Contrôle IA actif : désactivez IA ATC pour reprendre les clairances.';
      this.update(); return;
    }
    if (action === 'runwayAction') action = selectedAirplane?.state === 'TAKEOFF_ROLL' ? 'cancelTakeoff' : 'expediteExit';
    const buttons = { pause: 'pause-button', approach: 'assign-runway-button', land: 'landing-button', goaround: 'goaround-button', pushback: 'pushback-button', taxi: 'taxi-button', cross: 'cross-button', lineup: 'lineup-button', takeoff: 'takeoff-button', hold: 'hold-button', direct: 'direct-button', intercept: 'intercept-button', follow: 'follow-aircraft', arrival: 'new-arrival-button', newHelicopter: 'new-helicopter-button', emergency: 'emergency-button', cancelTakeoff: 'cancel-takeoff-button', expediteExit: 'expedite-exit-button', returnToStand: 'return-to-stand-button', retryTakeoff: 'retry-takeoff-button', zoomIn: 'zoom-in', zoomOut: 'zoom-out', departureExit: 'play-assign-exit' };
    let success = true;
    if (buttons[action]) {
      const button = byId(buttons[action]); success = !button.disabled;
      if (success && action === 'pushback' && selectedAirplane?.assignedRunway !== byId('runway-select').value) {
        success = session.assignRunway(selectedAirplane, byId('runway-select').value);
      }
      if (success) { const before = session.eventLog[0]; button.click(); if (!['pause', 'follow', 'zoomIn', 'zoomOut'].includes(action)) success = session.eventLog[0] !== before; }
    } else if (action === 'debug') {
      this.debug = !this.debug;
      if (!this.debug) this.debugMenu = false;
      document.body.classList.toggle('debug-mode', this.debug);
      document.body.classList.toggle('debug-menu-open', this.debug && this.debugMenu);
      byId('debug-menu-toggle')?.setAttribute('aria-expanded', String(this.debug && this.debugMenu));
      const debugButton = byId('debug-menu-toggle');
      if (debugButton) debugButton.hidden = !this.debug;
      windowResized();
    } else if (action === 'debugMenu') {
      if (!this.debug) return;
      this.debugMenu = !this.debugMenu;
      document.body.classList.toggle('debug-menu-open', this.debugMenu);
      byId('debug-menu-toggle')?.setAttribute('aria-expanded', String(this.debugMenu));
    }
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
    this.sky?.update(this.menu && !aiLabView?.isOpen);
    if (this.menu || this.help) session.simulation.paused = true;
    this.audio?.consume(session.eventLog);
    this.audio?.observeTCAS(session.simulation.entities.filter(entity => entity instanceof ModelAircraft));
    byId('play-modal').hidden = !this.menu; byId('play-help-panel').hidden = !this.help;
    byId('play-resume').hidden = this.hasStarted === false || scenario.mission.snapshot().status !== 'RUNNING';
    byId('tutorial-card').hidden = !this.tutorial.active;
    if (this.tutorial.active) { byId('tutorial-title').textContent = `${this.tutorial.index + 1}/${Tutorial.steps.length} · ${this.tutorial.step.title}`; byId('tutorial-text').textContent = this.tutorial.step.text; }
    const mission = scenario.mission.snapshot();
    const a = selectedAirplane; const live = Boolean(a && session.owns(a));
    const primary = live ? GameInput.primary(a, session.canAuthorizeLanding(a)) : null;
    byId('play-flight').textContent = live
      ? `${a.callsign} · ${a.modelId} · ${Math.round(a.altitude)} ft${view.visible(a.pos, 12) ? '' : ' · HORS VUE (F : suivre)'}`
      : 'Sélectionnez un avion visible · Tab';
    byId('play-state').textContent = live ? `${a.state}${a.altitude > 0 && a.telemetry?.behaviors?.includes('separation') ? ' · ⚠ TCAS' : ''}` : '—';
    byId('play-score-detail').textContent = `Vols terminés +${mission.scoreBreakdown.arrivals * mission.points.arrival + mission.scoreBreakdown.departures * mission.points.departure} · Crash −${mission.scoreBreakdown.collisions * mission.points.collision}`;
    const button = byId('play-primary'); button.hidden = !primary; button.textContent = primary ? `[${primary.key}] ${primary.label}` : '';
    if (byId('play-message').textContent !== session.lastMessage) byId('play-message').textContent = session.lastMessage;
    byId('play-fix').textContent = `Point : ${byId('nav-fix-select').value} · Entrée direct · H attente`;
    byId('play-score').textContent = `${scenario.demo ? 'DÉMO · ' : ''}${mission.score} PTS · ${session.simulation.paused ? 'PAUSE' : 'EN JEU'}`;
    const timer = byId('play-timer');
    if (timer) {
      const seconds = Math.ceil(mission.timeRemainingSeconds ?? 0);
      timer.hidden = mission.timeRemainingSeconds === null;
      timer.textContent = `⏱ ${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
      timer.classList.toggle('urgent', mission.timeRemainingSeconds !== null && seconds <= 30);
      timer.setAttribute('aria-label', `Temps restant : ${seconds} secondes`);
    }
    if (['COMPLETED', 'FAILED'].includes(mission.status) && !this.resultShown) {
      this.resultShown = true; this.wasPaused = true; session.simulation.paused = true;
      byId('result-summary').textContent = `${mission.label} · ${mission.completed.arrivals} arrivée(s) et ${mission.completed.departures} départ(s) traités.`;
      const timedOut = mission.events.some(event => event.type === 'TIME_LIMIT');
      byId('mission-result').dataset.outcome = mission.status;
      byId('result-kicker').textContent = mission.status === 'FAILED' ? (timedOut ? 'TEMPS ÉCOULÉ' : 'COLLISION') : 'OBJECTIFS ATTEINTS';
      byId('result-title').textContent = mission.status === 'FAILED' ? 'GAME OVER' : 'MISSION RÉUSSIE';
      byId('result-score').textContent = `${mission.score} PTS · +${(mission.scoreBreakdown.arrivals * mission.points.arrival) + (mission.scoreBreakdown.departures * mission.points.departure)} · −${mission.scoreBreakdown.collisions * mission.points.collision}`;
      byId('result-rules').textContent = `Barème : départ ${mission.score - ((mission.scoreBreakdown.arrivals * mission.points.arrival) + (mission.scoreBreakdown.departures * mission.points.departure) - mission.scoreBreakdown.collisions * mission.points.collision)} · arrivée/sortie +${mission.points.arrival} · crash −${mission.points.collision}`;
      byId('mission-result').hidden = false;
      byId('result-again').focus();
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
