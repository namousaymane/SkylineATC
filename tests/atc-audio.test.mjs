import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

test('communications ATC : annonce seulement les nouveaux événements lorsque l’audio est activé', () => {
  const spoken = [];
  const context = vm.createContext({ SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } },
    speechSynthesis: { speak(item) { spoken.push(item); }, cancel() {} } });
  vm.runInContext(readFileSync(new URL('../ui/atcAudio.js', import.meta.url), 'utf8'), context);
  const audio = new context.ATCAudio(); const events = [{ step: 10, message: 'ARR01 : approche autorisée.' }];
  audio.consume(events); assert.equal(spoken.length, 0);
  audio.toggle(true); const nextEvent = [{ step: 11, message: 'ARR01 : descendez 3000 pieds.' }]; audio.consume(nextEvent); audio.consume(nextEvent);
  assert.equal(spoken.length, 1); assert.equal(spoken[0].lang, 'fr-FR');
  audio.toggle(false); assert.equal(audio.enabled, false);
});

test('TCAS : déclenche une annonce et des impulsions distinctes lors d’un nouvel advisory', () => {
  const spoken = []; const frequencies = [];
  const context = vm.createContext({ SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } },
    speechSynthesis: { speak(item) { spoken.push(item.text); }, cancel() {} },
    AudioContext: class {
      currentTime = 0; destination = {};
      createOscillator() { return { frequency: {}, connect() {}, start() {}, stop() {}, set type(value) { this.wave = value; } }; }
      createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
    } });
  const original = context.AudioContext;
  context.AudioContext = class extends original { createOscillator() { const oscillator = super.createOscillator(); Object.defineProperty(oscillator.frequency, 'value', { set(value) { frequencies.push(value); } }); return oscillator; } };
  vm.runInContext(readFileSync(new URL('../ui/atcAudio.js', import.meta.url), 'utf8'), context);
  const audio = new context.ATCAudio(); audio.toggle(true);
  const aircraft = [{ callsign: 'AFR42', tcasAdvisory: { level: 'TA' } }];
  audio.observeTCAS(aircraft); audio.observeTCAS(aircraft);
  assert.equal(spoken.length, 1); assert.match(spoken[0], /Traffic, traffic/); assert.deepEqual(frequencies, [760, 760]);
  aircraft[0].tcasAdvisory = { level: 'RA' }; audio.observeTCAS(aircraft);
  assert.equal(spoken.length, 2); assert.equal(frequencies.length, 8);
});

test('le contrôle audio est accessible dans la barre du mode jeu', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /<div class="play-top">[\s\S]*?<button id="audio-toggle"[^>]*>[\s\S]*?class="audio-light"[\s\S]*?class="audio-state">OFF<\/span>[\s\S]*?<\/button>/);
  assert.doesNotMatch(html, /<div class="game-bar">[\s\S]*?<button id="audio-toggle"/);
  const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  assert.match(css, /\.audio-toggle\[aria-pressed="true"\] \.audio-light[^}]*background: #39e58a/);
  assert.match(css, /\.audio-light[^}]*background: #ff5c62/);
});
