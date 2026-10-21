class KeyboardGuide {
  static labels = { Escape: 'Menu / fermer', F1: 'Tutoriel', Tab: 'Vol suivant', A: 'Assigner approche', L: 'Autoriser atterrissage (finale proche uniquement)', G: 'Remise des gaz', P: 'Repoussage / retour parking après rejet', T: 'Taxi', C: 'Traversée', U: 'Alignement', K: 'Décollage', H: 'Attente au point', M: 'Décollage ou retour hélicoptère', I: 'Autoriser une interception militaire', Enter: 'Direct au point', R: 'Piste suivante', F: 'Suivre le vol', V: 'Changer de vue', O: 'Zoom aéroport', B: 'Afficher/masquer flight bars', D: 'Debug / forces', N: 'Créer arrivée', W: 'Ajouter orage', E: 'Urgence', Q: 'Assigner la sortie de secteur au départ sélectionné', X: 'Interrompre le décollage / dégagement prioritaire', PageUp: 'Monter de 500 ft', PageDown: 'Descendre de 500 ft', '+': 'Zoomer', '-': 'Dézoomer', Space: 'Pause / reprise', '?': 'Aide clavier' };
  static rows = [['Escape', 'F1', 'PageUp', 'PageDown'], ['Tab', 'A', 'Z', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'], ['Q', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'Enter'], ['Shift', 'W', 'X', 'C', 'V', 'B', 'N', '?', '-', '+'], ['Space']];
  static mount(host, detail) {
    host.replaceChildren();
    for (const row of this.rows) {
      const line = document.createElement('div'); line.className = 'keyboard-row';
      for (const key of row) {
        const label = key === 'Shift' ? 'Maj + clic point : attente' : this.labels[key]; const button = document.createElement('button');
        button.type = 'button'; button.className = `keyboard-key ${label ? 'mapped' : ''} ${key === 'Space' ? 'space-key' : ''}`;
        button.textContent = ({ Escape: 'Échap', Space: 'Espace', PageUp: 'Pg ↑', PageDown: 'Pg ↓', Enter: 'Entrée', Shift: 'Maj' })[key] ?? key;
        button.title = label ?? (key === 'Shift' ? 'Maj + clic point : attente' : 'Non assignée');
        button.setAttribute('aria-label', `${button.textContent} : ${button.title}`);
        const explain = () => { detail.textContent = `${button.textContent} — ${button.title}`; };
        button.onmouseenter = explain; button.onfocus = explain; button.onclick = explain;
        line.append(button);
      }
      host.append(line);
    }
  }
}
globalThis.KeyboardGuide = KeyboardGuide;
