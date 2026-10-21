/** Action-based tutorial: no wall-clock timers, no automatic aircraft orders. */
class Tutorial {
  static steps = [
    { event: 'select', title: 'Prenez le contrôle', text: 'Cliquez un avion sur la carte ou pressez Tab pour sélectionner le prochain vol.' },
    { event: 'heading', title: 'Donnez un cap', text: 'Glissez depuis l’avion en vol : la flèche indique le cap. Relâchez pour valider.' },
    { event: 'direct', title: 'Rejoignez un point', text: 'Cliquez un triangle de navigation, puis Entrée. Un double-clic sur le point donne aussi un direct.' },
    { event: 'hold', title: 'Faites patienter', text: 'Pressez H : l’avion rejoint le point choisi puis suit un hippodrome. Maj + clic sur un point donne le même ordre.' },
    { event: 'approach', title: 'Préparez l’approche', text: 'Choisissez une piste avec R ou le sélecteur, puis A. L’avion rejoint sa base et sa finale par steering, sans téléportation.' },
    { event: 'land', title: 'Autorisez l’atterrissage', text: 'Pressez L. Sans clairance, l’avion remet les gaz. G permet aussi de demander une remise des gaz.' },
    { event: 'debug', title: 'Regardez les behaviors', text: 'Pressez D pour observer les forces et behaviors. Pour un départ, assignez aussi une sortie EXIT au bord du secteur avant K. Au sol : P repoussage, T taxi, C traversée, U alignement, K décollage.' }
  ];
  constructor() { this.index = 0; this.active = false; }
  start() { this.index = 0; this.active = true; }
  get step() { return Tutorial.steps[this.index] ?? null; }
  record(event, success = true) { if (this.active && success && this.step?.event === event) { this.index++; if (!this.step) this.active = false; return true; } return false; }
  skip() { this.active = false; }
}
globalThis.Tutorial = Tutorial;
