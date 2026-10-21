/** Optional radio readback and synthesized TCAS-style alert tones (no cockpit recording). */
class ATCAudio {
  constructor() { this.enabled = false; this.lastKey = ''; this.context = null; this.advisories = new Map(); }
  toggle(enabled = !this.enabled) {
    this.enabled = Boolean(enabled);
    if (!this.enabled) globalThis.speechSynthesis?.cancel?.();
    else {
      const AudioContextClass = globalThis.AudioContext ?? globalThis.webkitAudioContext;
      if (AudioContextClass && !this.context) this.context = new AudioContextClass();
      this.context?.resume?.()?.catch?.(() => {});
    }
    return this.enabled;
  }
  observeTCAS(aircraft = []) {
    const active = new Set();
    for (const plane of aircraft) {
      const alert = plane?.tcasAdvisory;
      if (!plane?.callsign || !alert) continue;
      active.add(plane.callsign);
      if (this.advisories.get(plane.callsign) === alert.level) continue;
      this.advisories.set(plane.callsign, alert.level);
      if (!this.enabled) continue;
      this.playAlert(alert.level);
      this.speak(alert.level === 'RA' ? `${plane.callsign}. Traffic, traffic. Resolution advisory.` : `${plane.callsign}. Traffic, traffic.`);
    }
    for (const callsign of this.advisories.keys()) if (!active.has(callsign)) this.advisories.delete(callsign);
  }
  playAlert(level) {
    if (!this.context) return;
    const now = this.context.currentTime;
    const pattern = level === 'RA' ? [0, .16, .34, .5, .68, .84] : [0, .32];
    for (const offset of pattern) {
      const oscillator = this.context.createOscillator(); const gain = this.context.createGain();
      oscillator.type = 'square'; oscillator.frequency.value = level === 'RA' ? 1050 : 760;
      gain.gain.setValueAtTime(.0001, now + offset); gain.gain.exponentialRampToValueAtTime(level === 'RA' ? .055 : .035, now + offset + .012);
      gain.gain.exponentialRampToValueAtTime(.0001, now + offset + .11);
      oscillator.connect(gain); gain.connect(this.context.destination); oscillator.start(now + offset); oscillator.stop(now + offset + .12);
    }
  }
  speak(text) {
    if (!globalThis.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') return;
    const utterance = new SpeechSynthesisUtterance(text); utterance.lang = 'en-US'; utterance.rate = 1.08; utterance.pitch = .92;
    globalThis.speechSynthesis.speak(utterance);
  }
  consume(events = []) {
    const event = events[0];
    if (!event) return;
    const key = `${event.step}:${event.message}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    if (!this.enabled || !globalThis.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') return;
    const utterance = new SpeechSynthesisUtterance(String(event.message));
    utterance.lang = 'fr-FR'; utterance.rate = .94; utterance.pitch = .88;
    globalThis.speechSynthesis.speak(utterance);
  }
}
globalThis.ATCAudio = ATCAudio;
