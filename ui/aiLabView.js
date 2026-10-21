/** Train, evaluate and install high-level neural ATC controllers. */
class AILabView {
  constructor() {
    this.root = document.getElementById('ai-lab-modal'); this.isOpen = false; this.previousPause = false; this.lastPaint = 0;
    this.hiddenDraft = [12]; this.dirty = false; this.previewAirports = new WeakMap();
    this.lab = new AITrainingLab({ airport: AirportCatalog[document.getElementById('ai-airport').value] });
    this.renderArchitectureFields();
    for (const id of ['ai-start', 'ai-pause', 'ai-restart']) document.getElementById('ai-run-controls').append(document.getElementById(id));
    const speedSlot = document.createElement('div'); speedSlot.className = 'ai-speed-slot';
    speedSlot.append(document.getElementById('ai-speed').closest('label')); document.querySelector('.ai-workbench-bar').append(speedSlot);
    const tabs = document.createElement('nav'); tabs.className = 'ai-mobile-tabs'; tabs.setAttribute('aria-label', 'Pages du laboratoire');
    tabs.innerHTML = '<button type="button" data-ai-page="observe" aria-pressed="true">Observer les vols</button><button type="button" data-ai-page="configure" aria-pressed="false">Réseau et réglages</button>';
    document.querySelector('.ai-lab-layout').before(tabs); this.root.dataset.page = 'observe';
    for (const button of tabs.querySelectorAll('button')) button.onclick = () => {
      this.root.dataset.page = button.dataset.aiPage;
      for (const tab of tabs.querySelectorAll('button')) tab.setAttribute('aria-pressed', String(tab === button));
      this.render();
    };
    document.getElementById('ai-lab-open').onclick = () => this.open();
    document.getElementById('ai-lab-close').onclick = () => this.close();
    document.getElementById('ai-start').onclick = () => { this.lab.start(); this.message('Chaque réseau contrôle sa propre session, avec un trafic initial identique.'); this.renderControls(); };
    document.getElementById('ai-pause').onclick = () => { this.lab.pause(); this.lab.cancelValidation(); this.message('Calcul en pause.'); this.renderControls(); };
    document.getElementById('ai-validate').onclick = () => { try { this.lab.startValidation(); this.message('Validation : trois graines inédites, comparées au contrôleur à règles.'); this.renderControls(); } catch (error) { this.message(error.message); } };
    document.getElementById('ai-speed').onchange = event => this.lab.setSpeed(Number(event.target.value));
    document.getElementById('ai-airport').onchange = () => this.markDirty();
    document.getElementById('ai-restart').onclick = () => this.resetLab('Nouvelle population générée.');
    document.getElementById('ai-population').oninput = event => { document.getElementById('ai-population-value').value = event.target.value; this.markDirty(); };
    document.getElementById('ai-mutation').oninput = event => { document.getElementById('ai-mutation-value').value = `${event.target.value}%`; this.markDirty(); };
    document.getElementById('ai-elitism').oninput = event => { document.getElementById('ai-elitism-value').value = `${event.target.value}%`; this.markDirty(); };
    document.getElementById('ai-strength').oninput = event => { document.getElementById('ai-strength-value').value = Number(event.target.value).toFixed(2); this.markDirty(); };
    for (const id of ['ai-seed', 'ai-training-weather', 'ai-traffic-level', 'ai-horizon']) document.getElementById(id).onchange = () => this.markDirty();
    document.getElementById('ai-config-apply').onclick = () => this.applySettings();
    document.getElementById('ai-layer-count').onchange = event => {
      this.hiddenDraft = Array.from({ length: Number(event.target.value) }, (_, i) => this.hiddenDraft[i] ?? 12);
      this.renderArchitectureFields(); this.markDirty();
    };
    for (const button of document.querySelectorAll('[data-ai-layers]')) button.onclick = () => {
      this.hiddenDraft = button.dataset.aiLayers.split(',').map(Number); this.renderArchitectureFields(); this.markDirty();
    };
    document.getElementById('ai-apply').onclick = () => this.installController();
    document.getElementById('ai-reference').onclick = () => { this.installedBrain = null; if (session.aiAtc) session.aiAtc.brain = null; try { localStorage.removeItem('skyline-atc-controller-v1'); } catch (_) {} this.message('Contrôleur à règles rétabli. Le bouton IA ATC permet de rendre la main au joueur.'); this.renderControls(); };
    document.getElementById('ai-export').onclick = () => this.exportBrain();
    document.getElementById('ai-import').onclick = () => document.getElementById('ai-file').click();
    document.getElementById('ai-file').onchange = event => this.importBrain(event.target.files?.[0]);
    document.addEventListener('keydown', event => {
      if (!this.isOpen) return;
      if (event.key === 'Escape') { event.stopImmediatePropagation(); event.preventDefault(); this.close(); }
      else if (event.key === 'Tab') {
        const controls = [...this.root.querySelectorAll('button,select,input,summary')].filter(el => !el.disabled && el.getClientRects().length > 0);
        const index = controls.indexOf(document.activeElement); event.preventDefault(); controls[(index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length]?.focus();
      }
    }, true);
    this.installedBrain = null;
    try { const saved = localStorage.getItem('skyline-atc-controller-v1'); if (saved) { const payload = JSON.parse(saved); if (payload.version === 1 && payload.schema === ATCPolicy.SCHEMA && payload.format === 'SkylineATC-Controller') this.installedBrain = ATCPolicy.validate(NeuralNetwork.deserialize(payload.network)); } } catch (_) {}
    this.attachToSession(); this.renderControls();
  }
  open() { if (this.isOpen) return; this.previousPause = session.simulation.paused; session.simulation.paused = true; this.isOpen = true; this.root.hidden = false; document.getElementById('ai-lab-close').focus(); this.render(); }
  close() { if (!this.isOpen) return; this.isOpen = false; this.root.hidden = true; session.simulation.paused = this.previousPause; document.getElementById('ai-lab-open').focus(); }
  message(text) { document.getElementById('ai-message').textContent = text; }
  renderArchitectureFields() {
    document.getElementById('ai-layer-count').value = String(this.hiddenDraft.length);
    const container = document.getElementById('ai-hidden-sizes');
    container.innerHTML = this.hiddenDraft.map((size, i) => `<label class="ai-neuron-field" for="ai-neurons-${i}">Couche ${i + 1}<input id="ai-neurons-${i}" type="number" min="1" max="64" step="1" value="${size}" aria-label="Neurones de la couche ${i + 1}"></label>`).join('');
    container.oninput = () => {
      const sizes = [...container.querySelectorAll('input')].map(input => Number(input.value));
      if (sizes.every(value => Number.isInteger(value) && value >= 1 && value <= 64)) { this.hiddenDraft = sizes; this.renderArchitectureSummary(); this.markDirty(); }
      else { this.dirty = true; document.getElementById('ai-config-apply').disabled = true; document.getElementById('ai-config-notice').textContent = 'Choisissez de 1 à 64 neurones pour chaque couche.'; }
    };
    this.renderArchitectureSummary();
  }
  renderArchitectureSummary() {
    const network = new NeuralNetwork({ inputs: ATCPolicy.INPUTS, outputs: ATCPolicy.OUTPUTS, hiddenLayers: this.hiddenDraft, random: () => .5 });
    document.getElementById('ai-architecture-summary').textContent = network.layerSizes.join(' → ');
    document.getElementById('ai-parameter-count').textContent = `${network.parameterCount.toLocaleString('fr-FR')} paramètres · tanh / sigmoid`;
  }
  markDirty() {
    this.dirty = true; document.getElementById('ai-config-apply').disabled = false;
    document.getElementById('ai-config-apply').textContent = 'Appliquer les réglages';
    document.getElementById('ai-config-notice').textContent = 'Modifications en attente. Appliquez-les pour préparer la prochaine expérience.';
  }
  settings() {
    const seed = Number(document.getElementById('ai-seed').value);
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError('Graine attendue entre 0 et 4294967295.');
    const hiddenLayers = [...document.getElementById('ai-hidden-sizes').querySelectorAll('input')].map(input => Number(input.value));
    new NeuralNetwork({ inputs: ATCPolicy.INPUTS, outputs: ATCPolicy.OUTPUTS, hiddenLayers, random: () => .5 });
    return { airport: AirportCatalog[document.getElementById('ai-airport').value], populationSize: Number(document.getElementById('ai-population').value), mutationRate: Number(document.getElementById('ai-mutation').value) / 100, mutationStrength: Number(document.getElementById('ai-strength').value), elitism: Number(document.getElementById('ai-elitism').value) / 100, hiddenLayers, seed, weatherMode: document.getElementById('ai-training-weather').value, trafficLevel: document.getElementById('ai-traffic-level').value, maxSteps: Number(document.getElementById('ai-horizon').value) };
  }
  applied() {
    this.dirty = false; document.getElementById('ai-config-apply').disabled = true;
    document.getElementById('ai-config-apply').textContent = 'Réglages appliqués';
    document.getElementById('ai-config-notice').textContent = 'Réglages actifs. Vous pouvez démarrer l’entraînement.';
    this.previewGeneration = null; this.renderControls(); this.render();
  }
  applySettings() {
    try {
      const settings = this.settings();
      if (settings.airport !== this.lab.airport || settings.seed !== this.lab.seed || settings.weatherMode !== this.lab.weatherMode || settings.trafficLevel !== this.lab.trafficLevel || settings.maxSteps !== this.lab.maxSteps) this.lab = new AITrainingLab(settings);
      else this.lab.configure(settings);
      this.lab.setSpeed(Number(document.getElementById('ai-speed').value)); this.applied(); this.message('Expérience prête. Démarrez pour évaluer la population.');
    } catch (error) { this.message(error.message); }
  }
  renderControls() {
    const running = this.lab.running; const validating = this.lab.validating;
    document.getElementById('ai-status').textContent = validating ? 'VALIDATION INÉDITE' : running ? `ENTRAÎNEMENT ATC · ${this.lab.speed}×` : 'EN PAUSE';
    document.getElementById('ai-start').disabled = running || validating; document.getElementById('ai-pause').disabled = !running && !validating;
    document.getElementById('ai-generation').textContent = String(this.lab.generation);
    document.getElementById('ai-apply').disabled = !this.lab.hasLearnedBrain;
    document.getElementById('ai-export').disabled = !this.lab.hasLearnedBrain;
    document.getElementById('ai-validate').disabled = !this.lab.hasLearnedBrain || running || validating;
    const report = this.lab.report;
    const scored = this.lab.agents.map(agent => agent.fitness);
    document.getElementById('ai-best-score').textContent = report ? Math.round(report.bestFitness) : Math.round(Math.max(...scored));
    document.getElementById('ai-average-score').textContent = report ? Math.round(report.averageFitness) : Math.round(scored.reduce((a, b) => a + b, 0) / Math.max(1, scored.length));
    document.getElementById('ai-landed').textContent = report ? `${report.safePolicies}/${report.population}` : '—';
    const observed = this.observedEpisode(); const m = observed.metrics;
    document.getElementById('ai-weather').textContent = `${observed.runway.id} · ${observed.weather} · ${validating ? 'validation' : 'sessions isolées'}`;
    const progress = Math.min(100, Math.round((validating ? observed.steps : this.lab.generationStep) / this.lab.maxSteps * 100));
    document.getElementById('ai-episode-progress').value = progress; document.getElementById('ai-episode-label').textContent = `${progress} % · ${validating ? `test ${this.lab.validation.seedIndex + 1}/3` : `${this.lab.population.length} contrôleurs`}`;
    document.getElementById('ai-session-metrics').textContent = `Session observée : ${m.arrivals} arrivée(s) au stand · ${m.departures} départ(s) · ${m.completed}/${m.requested} traités · ${m.throughput.toFixed(0)} mouvements/h équivalents · attente ${m.meanWaitSeconds.toFixed(1)} s · pertes de séparation ${m.separationLosses} · RA ${m.ra} · collisions ${m.collisions} · incursions ${m.incursions}`;
    document.getElementById('ai-decisions').textContent = observed.controller.decisions.slice(-4).map(d => `${d.callsign} : ${ATCPolicy.labels[d.type]}${d.accepted ? '' : ' (refusé)'}`).join(' · ') || 'En attente de la première clairance.';
    const v = this.lab.validation;
    document.getElementById('ai-validation-result').textContent = !v ? 'Non évalué sur les scénarios inédits.' : v.status === 'RUNNING' ? `Validation ${v.seedIndex + 1}/3 en cours…` : v.status === 'CANCELLED' ? 'Validation interrompue.' : `${v.passed ? 'VALIDÉ' : 'À AMÉLIORER'} : ${v.results.filter(r => r.metrics.success).length}/3 sessions sûres avec ≥ 80 % du trafic traité. ${v.results.filter(r => r.fitness >= r.baselineFitness).length}/3 scores au moins égaux à la référence.`;
    document.getElementById('ai-installed').textContent = this.installedBrain ? `Jeu : réseau ATC ${this.installedBrain.layerSizes.join(' → ')} installé · ${session.aiAtc?.enabled ? 'contrôle actif' : 'en veille, activer IA ATC'}.` : 'Jeu : contrôleur de référence à règles.';
  }
  resetLab(notice) {
    try {
      this.lab.pause(); this.lab = new AITrainingLab(this.settings());
      this.lab.setSpeed(Number(document.getElementById('ai-speed').value)); this.applied(); this.message(notice);
    } catch (error) { this.message(error.message); }
  }
  bestCandidate() { return this.lab.agents.reduce((best, item) => !best || item.fitness > best.fitness ? item : best, null); }
  observedEpisode() { return this.lab.validating ? this.lab.validationPair[0] : this.bestCandidate().episode; }
  attachToSession() { if (this.installedBrain && session?.aiAtc && !debugDemoReturn) session.aiAtc.setBrain(this.installedBrain); }
  installController() {
    try {
      const payload = this.lab.exportPayload(); session.aiAtc.setBrain(payload.network); this.installedBrain = session.aiAtc.brain.clone(); session.aiAtc.toggle(true);
      try { localStorage.setItem('skyline-atc-controller-v1', JSON.stringify(payload)); } catch (_) {}
      this.message('Contrôleur neuronal installé et activé. Fermez le laboratoire et reprenez la simulation pour observer ses clairances. Désactivez IA ATC pour reprendre la main.'); this.renderControls();
    } catch (error) { this.message(error.message); }
  }
  exportBrain() {
    try {
      const payload = this.lab.exportPayload();
      const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `skyline-atc-controller-${this.lab.airport.id}-gen${payload.generation}.json`; anchor.click(); URL.revokeObjectURL(url); this.message('Contrôleur ATC exporté au format JSON.');
    } catch (error) { this.message(error.message); }
  }
  async importBrain(file) {
    if (!file) return;
    try { const payload = JSON.parse(await file.text()); this.lab.importBrain(payload); this.lab.pause(); this.hiddenDraft = [...this.lab.hiddenLayers]; this.renderArchitectureFields(); this.applied(); this.message('Contrôleur ATC importé. Validez-le sur les scénarios inédits avant de l’installer.'); }
    catch (error) { this.message(`Import impossible : ${error.message}`); }
    finally { document.getElementById('ai-file').value = ''; }
  }
  update() {
    if (!this.isOpen) return;
    const start = performance.now();
    for (let i = 0; i < this.lab.speed && (this.lab.running || this.lab.validating); i++) { this.lab.tick(1); if (performance.now() - start > 12) break; }
    this.renderControls();
    const now = performance.now(); if (now - this.lastPaint > 65) { this.lastPaint = now; this.render(); }
  }
  render() { this.renderPreview(); this.renderFitness(); this.renderBrain(); }
  canvas(id) {
    const canvas = document.getElementById(id); const width = Math.max(240, Math.round(canvas.clientWidth || canvas.width)); const height = Math.max(120, Math.round(canvas.clientHeight || canvas.height));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    return canvas;
  }
  renderPreview() {
    const canvas = this.canvas('ai-preview'); const c = canvas.getContext('2d'); const w = canvas.width; const h = canvas.height;
    const episode = this.observedEpisode();
    if (this.previewGeneration !== episode) {
      this.previewGeneration = episode;
      const points = [{ x: 0, y: 0 }, { x: 1100, y: 620 }, ...episode.aircraft.map(a => a.pos)];
      const xs = points.map(p => p.x); const ys = points.map(p => p.y);
      this.previewBounds = { left: Math.min(...xs) - 150, right: Math.max(...xs) + 150, top: Math.min(...ys) - 200, bottom: Math.max(...ys) + 200 };
    }
    const b = this.previewBounds; const scale = Math.min(w / (b.right - b.left), h / (b.bottom - b.top)) * .9;
    const camera = new MapCamera(w, h, this.lab.unitsPerNm);
    camera.scale = scale; camera.center = { x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2 };
    SurroundingsRenderer.render(c, camera, this.lab.airport);
    let surface = RadarRenderer.cache.get(this.lab.airport) ?? this.previewAirports.get(this.lab.airport);
    if (!surface) { surface = document.createElement('canvas'); surface.width = 1100; surface.height = 620; RadarRenderer.paint(surface.getContext('2d'), this.lab.airport); this.previewAirports.set(this.lab.airport, surface); }
    const transform = camera.transform();
    c.save(); c.translate(transform.x, transform.y); c.scale(scale, scale); c.drawImage(surface, 0, 0, 1100, 620);
    for (const storm of episode.session.weather.storms) { c.fillStyle = '#8e6da955'; c.strokeStyle = '#deb4ff'; c.lineWidth = 1 / scale; c.beginPath(); c.arc(storm.pos.x, storm.pos.y, storm.hitboxRadius ?? storm.radius, 0, Math.PI * 2); c.fill(); c.stroke(); }
    for (const a of episode.aircraft) {
      if (a.destroyed) continue;
      AircraftRenderer.render(a, c, Math.max(1, .8 / scale));
      c.font = `${10 / scale}px monospace`; c.fillStyle = '#f0f6e6'; c.fillText(`${a.callsign} ${Math.round(a.altitude)}ft`, a.pos.x + 10 / scale, a.pos.y - 10 / scale);
    }
    c.restore(); c.fillStyle = '#0b171be8'; c.fillRect(10, 10, 220, 30); c.fillStyle = '#e8eadc'; c.font = '12px monospace'; c.fillText(`ATC · RWY ${episode.runway.id} · ${episode.steps}/ ${episode.maxSteps}`, 20, 30);
  }
  renderFitness() {
    const canvas = this.canvas('ai-fitness-chart'); const c = canvas.getContext('2d'); const w = canvas.width; const h = canvas.height; c.clearRect(0, 0, w, h); c.fillStyle = '#0e1c19'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#8fa69520'; c.lineWidth = 1; for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(0, h * i / 4); c.lineTo(w, h * i / 4); c.stroke(); }
    const history = this.lab.history; if (!history.length) { c.fillStyle = '#71857b'; c.font = '13px ui-monospace,monospace'; c.fillText('Les scores apparaîtront à la fin de la première génération.', 14, h / 2); return; }
    const all = history.flatMap(item => [item.bestFitness, item.averageFitness, item.baselineFitness]); const min = Math.min(...all, 0); const max = Math.max(...all, 1); const x = i => 10 + i * (w - 20) / Math.max(1, history.length - 1); const y = val => h - 12 - (val - min) / Math.max(1, max - min) * (h - 24);
    for (const [key, color, dash] of [['bestFitness', '#f2d27d', []], ['averageFitness', '#62dba4', []], ['baselineFitness', '#71b9d0', [5, 5]]]) { c.beginPath(); history.forEach((item, i) => i ? c.lineTo(x(i), y(item[key])) : c.moveTo(x(i), y(item[key]))); c.strokeStyle = color; c.lineWidth = 2; c.setLineDash(dash); c.stroke(); }
    c.setLineDash([]);
  }
  renderBrain() {
    const canvas = this.canvas('ai-brain-chart'); const c = canvas.getContext('2d'); const w = canvas.width; const h = canvas.height; c.clearRect(0, 0, w, h); c.fillStyle = '#0e1c19'; c.fillRect(0, 0, w, h);
    const episode = this.observedEpisode(); const brain = episode.controller.brain;
    const decision = episode.controller.lastDecision;
    const inputs = decision?.inputs ?? ATCPolicy.inputsFor(episode.controller, { type: 'WAIT', priority: 0 }); const outputs = brain.predict(inputs);
    const layers = [inputs, ...brain.lastHiddenLayers, outputs]; const xs = layers.map((_, i) => 25 + i * (w - 50) / (layers.length - 1)); const positions = layers.map((nodes, layer) => nodes.map((_, i) => ({ x: xs[layer], y: 30 + i * ((h - 70) / Math.max(1, nodes.length - 1)) })));
    const connections = brain.weights.reduce((total, matrix) => total + matrix.length * matrix[0].length, 0);
    const stride = Math.max(1, Math.ceil(connections / 1500));
    const drawLinks = (weights, from, to) => { for (let j = 0; j < weights.length; j++) for (let i = 0; i < weights[j].length; i++) { if ((j * weights[j].length + i) % stride) continue; const value = weights[j][i]; c.beginPath(); c.moveTo(positions[from][i].x, positions[from][i].y); c.lineTo(positions[to][j].x, positions[to][j].y); c.strokeStyle = value >= 0 ? `rgba(83,220,158,${Math.min(.55,.08+Math.abs(value)*.28)})` : `rgba(255,112,106,${Math.min(.5,.08+Math.abs(value)*.25)})`; c.lineWidth = Math.min(1.5, .35 + Math.abs(value) * .45); c.stroke(); } };
    brain.weights.forEach((matrix, i) => drawLinks(matrix, i, i + 1));
    const drawNodes = (values, layer) => values.forEach((value, i) => { const p = positions[layer][i]; c.beginPath(); c.arc(p.x, p.y, Math.min(5, (h - 70) / values.length * .34), 0, Math.PI * 2); c.fillStyle = value >= 0 ? `rgba(113,226,170,${.25 + Math.min(1,Math.abs(value))*.75})` : `rgba(112,171,240,${.25 + Math.min(1,Math.abs(value))*.75})`; c.fill(); c.strokeStyle = '#d9f2deaa'; c.lineWidth = .8; c.stroke(); });
    layers.forEach(drawNodes);
    c.font = '10px ui-monospace,monospace'; c.fillStyle = '#b0c4b5'; c.textAlign = 'center'; layers.forEach((values, i) => c.fillText(`${i === 0 ? 'IN' : i === layers.length - 1 ? 'OUT' : `H${i}`} · ${values.length}`, xs[i], h - 10)); c.textAlign = 'left';
    if (stride > 1) c.fillText('Connexions échantillonnées · toutes les activations affichées', 10, 14);
    document.getElementById('ai-output-readout').textContent = `${ATCPolicy.labels[decision?.type ?? 'WAIT']} · ${decision?.callsign ?? '—'} · priorité réseau ${outputs[0].toFixed(3)} (ce n’est pas une probabilité de sécurité)`;
  }
}
globalThis.AILabView = AILabView;
