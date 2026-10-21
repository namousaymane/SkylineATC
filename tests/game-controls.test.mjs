import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const api = vm.createContext({});
for (const f of ['ui/gameInput.js', 'ui/tutorial.js', 'ui/gameHud.js']) vm.runInContext(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'), api);
const event = (key, options = {}) => ({ key, target: { tagName: 'CANVAS' }, ...options });
test('repoussage : appliquer la piste choisie et refuser le départ si son affectation échoue', () => {
  for (const accepted of [true, false]) {
    let pushed = false; let requested;
    api.selectedAirplane = { assignedRunway: '09' };
    api.session = { eventLog: [], lastMessage: '', assignRunway(a, id) { requested = id; if (accepted) a.assignedRunway = id; return accepted; } };
    api.byId = id => id === 'runway-select' ? { value: '27' } : { disabled: false, click() { pushed = true; api.session.eventLog.unshift({}); } };
    const hud = Object.create(api.GameHud.prototype); hud.menu = false; hud.help = false; hud.record = () => {}; hud.update = () => {};
    hud.dispatch('pushback'); assert.equal(requested, '27'); assert.equal(pushed, accepted);
    assert.equal(api.selectedAirplane.assignedRunway, accepted ? '27' : '09');
  }
});
test('raccourcis : clavier, saisie, répétition et modales', () => {
  assert.equal(api.GameInput.action(event('D')), 'debug'); assert.equal(api.GameInput.action(event(' ')), 'pause');
  assert.equal(api.GameInput.action(event('o')), 'airport');
  assert.equal(api.GameInput.action(event('i')), 'intercept');
  assert.equal(api.GameInput.action(event('q')), 'departureExit');
  assert.equal(api.GameInput.action(event('q', { target: { tagName: 'SELECT' } })), 'departureExit');
  api.selectedAirplane = { state: 'TAKEOFF_ABORTED' };
  assert.equal(api.GameInput.action(event('p')), 'returnToStand');
  api.selectedAirplane = { state: 'PARKED' };
  assert.equal(api.GameInput.action(event('p')), 'pushback');
  assert.equal(api.GameInput.action(event('Tab')), 'next'); assert.equal(api.GameInput.action(event('Enter')), 'direct');
  for (const tagName of ['INPUT', 'SELECT', 'TEXTAREA']) assert.equal(api.GameInput.action(event('d', { target: { tagName } })), null);
  assert.equal(api.GameInput.action(event('d', { repeat: true })), null);
  assert.equal(api.GameInput.action(event('d', { ctrlKey: true })), null);
  assert.equal(api.GameInput.action(event('a'), true), null);
  assert.equal(api.GameInput.action(event('Escape'), true), 'menu');
  assert.equal(api.GameInput.action(event('d', { target: { tagName: 'BUTTON' } })), 'debug');
});
test('action contextuelle : pas de décollage avant alignement, rejet en course et clairance d’atterrissage conditionnelle', () => {
  const primary = state => api.GameInput.primary({ state, operation: 'DEPARTURE' });
  assert.equal(primary('PARKED').action, 'pushback'); assert.equal(primary('HOLD_SHORT').action, 'lineup');
  assert.equal(primary('LINE_UP_WAIT').action, 'takeoff'); assert.equal(primary('TAKEOFF_ROLL').action, 'cancelTakeoff');
  assert.equal(primary('TAKEOFF_ABORTED').action, 'returnToStand');
  assert.equal(primary('ROLL_OUT').action, 'expediteExit');
  assert.equal(primary('VECTORING').action, 'land');
  assert.equal(api.GameInput.primary({ state: 'APPROACH' }, false), null);
  assert.equal(api.GameInput.primary({ state: 'FINAL', landingCleared: true }).action, 'goaround');
});
test('tutoriel : progression sur actions réussies uniquement, relance et abandon', () => {
  const tutorial = new api.Tutorial(); tutorial.start();
  assert.equal(tutorial.record('heading'), false); assert.equal(tutorial.index, 0);
  assert.equal(tutorial.record('select', false), false); assert.equal(tutorial.index, 0);
  for (const step of api.Tutorial.steps) assert.equal(tutorial.record(step.event), true);
  assert.equal(tutorial.active, false); assert.equal(tutorial.step, null);
  tutorial.start(); assert.equal(tutorial.index, 0); tutorial.skip(); assert.equal(tutorial.record('select'), false);
});
test('menu : pause conservée à la fermeture, y compris après une réouverture', () => {
  api.session = { simulation: { paused: false } };
  api.document = { activeElement: { blur() {} } }; api.byId = () => ({ focus() {} });
  const hud = Object.create(api.GameHud.prototype); hud.menu = false; hud.wasPaused = false; hud.update = () => {};
  hud.toggleMenu(true); assert.equal(api.session.simulation.paused, true);
  hud.toggleMenu(true); hud.toggleMenu(false); assert.equal(api.session.simulation.paused, false);
  api.session.simulation.paused = true;
  hud.toggleMenu(true); hud.toggleMenu(false); assert.equal(api.session.simulation.paused, true);
});
test('aide clavier : pause temporaire et restauration sans ordre de vol', () => {
  api.session = { simulation: { paused: false } };
  const hud = Object.create(api.GameHud.prototype); hud.help = false; hud.update = () => {};
  hud.toggleHelp(true); assert.equal(api.session.simulation.paused, true);
  hud.toggleHelp(false); assert.equal(api.session.simulation.paused, false);
  api.session.simulation.paused = true; hud.toggleHelp(true); hud.toggleHelp(false);
  assert.equal(api.session.simulation.paused, true);
});

test('flight bars : B et l’action de la barre alternent leur visibilité', () => {
  let visible = true;
  api.document = { body: { classList: { toggle(name) { assert.equal(name, 'show-traffic'); visible = !visible; } } } };
  api.session = { eventLog: [], lastMessage: '' };
  const hud = Object.create(api.GameHud.prototype); hud.menu = false; hud.help = false;
  hud.record = () => {}; hud.update = () => {};
  hud.dispatch('traffic'); assert.equal(visible, false);
  hud.dispatch('traffic'); assert.equal(visible, true);
});

test('menu de jeu : missions et urgences imposent un scénario adapté', () => {
  let mode = 'FREE'; const scenario = { value: 'GO_AROUND' };
  api.byId = id => id === 'game-mode' ? { value: mode } : scenario;
  const hud = Object.create(api.GameHud.prototype); hud.updateModeDescription = () => {};
  hud.applyGameMode(); assert.equal(scenario.value, 'GO_AROUND');
  mode = 'MISSIONS'; scenario.value = 'CALM'; hud.applyGameMode(); assert.equal(scenario.value, 'PEAK_HOUR');
  mode = 'EMERGENCY'; scenario.value = 'PEAK_HOUR'; hud.applyGameMode(); assert.equal(scenario.value, 'ENGINE_FAILURE');
  scenario.value = 'RADIO_FAILURE'; hud.applyGameMode(); assert.equal(scenario.value, 'RADIO_FAILURE');
});

test('la sortie de secteur est une commande de jeu, pas une commande du panneau opérations', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /class="play-card"[\s\S]*?id="play-exit-select"[\s\S]*?id="play-assign-exit"/);
  assert.doesNotMatch(html, /id="departure-fix-select"|id="assign-departure-fix-button"/);
  assert.match(html, /data-mode-choice="MISSIONS"/); assert.match(html, /id="mission-result"/);
  assert.match(html, /class="play-modal lobby"/);
  assert.match(html, /id="lobby-scenario-slot"/);
});

test('lobby : les scénarios et options correspondent au mode choisi', () => {
  const scenarioOptions = ['CALM', 'RUNWAY_CONFLICT', 'PEAK_HOUR', 'GO_AROUND', 'ENGINE_FAILURE', 'RADIO_FAILURE', 'HIJACK', 'RANDOM_EMERGENCY']
    .map(value => ({ value, textContent: value, hidden: false, disabled: false }));
  const fields = new Map();
  const field = id => { if (!fields.has(id)) fields.set(id, { value: '', hidden: false, textContent: '', focus() {} }); return fields.get(id); };
  const scenario = field('scenario-select'); scenario.value = 'CALM'; scenario.options = scenarioOptions;
  Object.defineProperty(scenario, 'selectedOptions', { get: () => scenarioOptions.filter(option => option.value === scenario.value) });
  scenario.querySelector = () => scenarioOptions[0];
  const timerLabel = {}; field('emergency-time-limit').closest = () => timerLabel;
  const cards = ['FREE', 'MISSIONS', 'EMERGENCY', 'AIRPORT'].map(mode => ({ dataset: { modeChoice: mode }, setAttribute() {} }));
  api.byId = field; api.document = { querySelectorAll: () => cards };
  const hud = Object.create(api.GameHud.prototype);
  field('game-mode').value = 'MISSIONS'; hud.updateModeDescription();
  assert.equal(scenario.value, 'PEAK_HOUR');
  assert.deepEqual(scenarioOptions.filter(option => !option.disabled).map(option => option.value), ['RUNWAY_CONFLICT', 'PEAK_HOUR', 'GO_AROUND']);
  assert.equal(field('lobby-traffic-slot').hidden, true);
  field('game-mode').value = 'EMERGENCY'; hud.updateModeDescription();
  assert.equal(scenario.value, 'RANDOM_EMERGENCY'); assert.equal(timerLabel.hidden, false);
  assert.ok(scenarioOptions.find(option => option.value === 'RANDOM_EMERGENCY').disabled === false);
  field('game-mode').value = 'FREE'; hud.updateModeDescription();
  assert.equal(scenario.value, 'CALM'); assert.equal(field('random-traffic').checked, true);
  assert.equal(field('lobby-scenario-slot').hidden, true); assert.equal(timerLabel.hidden, true);
  field('game-mode').value = 'AIRPORT'; hud.updateModeDescription();
  assert.equal(field('lobby-traffic-toggle-slot').hidden, false);
  assert.equal(field('random-traffic').disabled, false);
});

test('le premier écran attend le lancement ; modifier le lobby ne lance aucune partie', () => {
  api.session = { simulation: { paused: true } }; api.document = { activeElement: { blur() {} } };
  const hud = Object.create(api.GameHud.prototype); hud.hasStarted = false; hud.menu = true;
  hud.update = () => {}; let launched = false;
  api.resetTraining = replay => { launched = replay; }; hud.applyGameMode = () => {};
  hud.tutorial = { skip() {} };
  hud.toggleMenu(false); assert.equal(hud.menu, true);
  hud.launchGame(true);
  assert.equal(launched, true); assert.equal(hud.hasStarted, true);
  assert.equal(hud.menu, false); assert.equal(api.session.simulation.paused, false);
});

test('assigner la sortie depuis la carte n’installe pas de clic récursif', () => {
  const source = readFileSync(new URL('../ui/gameHud.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /byId\('play-assign-exit'\)\.onclick\s*=\s*\(\)\s*=>\s*this\.dispatch\('departureExit'\)/);
  let clicks = 0;
  api.session = { eventLog: [], lastMessage: '', aiAtc: { enabled: false } };
  api.byId = () => ({ disabled: false, click() { clicks++; api.session.eventLog.unshift({ type: 'EXIT_ASSIGNED' }); } });
  const hud = Object.create(api.GameHud.prototype); hud.menu = false; hud.help = false;
  hud.record = () => {}; hud.update = () => {};
  hud.dispatch('departureExit');
  assert.equal(clicks, 1);
});
