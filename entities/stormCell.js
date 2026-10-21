class StormCell extends Vehicle {
  constructor(x, y, options = {}) {
    super(x, y);
    this.callsign = options.callsign ?? `STORM-${Math.floor(x)}-${Math.floor(y)}`;
    this.kind = 'STORM_CELL';
    this.radius = options.radius ?? 120;
    // The weather sprite can be much larger than the collision volume. Keep a
    // separate invisible circular hitbox for deterministic obstacle avoidance.
    this.hitboxRadius = options.hitboxRadius ?? this.radius;
    this.r = this.hitboxRadius;
    this.maxSpeed = options.maxSpeed ?? 0.45;
    this.maxForce = options.maxForce ?? 0.025;
    this.altitude = options.altitude ?? 0;
    this.intensity = options.intensity ?? 1;
    this.baseIntensity = this.intensity;
    this.phase = options.phase ?? 0;
    this.bounds = options.bounds ?? null;
    this.wanderRandom = options.wanderRandom ?? null;
    this.vel.set(options.vx ?? this.maxSpeed, options.vy ?? 0);
    if (this.vel.magSq() === 0) this.vel.set(this.maxSpeed, 0);

    // Propriétés visuelles procédurales (nuages vaporeux, brume et éclairs)
    this.puffCount = 20;
    this.puffs = [];
    const seed = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    let s = Math.abs(seed);
    const pseudoRandom = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    for (let i = 0; i < this.puffCount; i += 1) {
      const angle = pseudoRandom() * Math.PI * 2;
      const distRatio = Math.sqrt(pseudoRandom()) * 0.85;
      const sizeRatio = 0.75 + pseudoRandom() * 0.75;
      const speed = 0.15 + pseudoRandom() * 0.35;
      const gray = 40 + Math.floor(pseudoRandom() * 35); // nuance de gris d'orage
      this.puffs.push({ angle, distRatio, sizeRatio, speed, gray, phaseOffset: pseudoRandom() * Math.PI * 2 });
    }

    // Gestion des éclairs (lightning flashes & branches)
    this.lightningIntensity = 0;
    this.lightningBolts = [];
    this.lightningCooldown = 60 + Math.floor(pseudoRandom() * 120);
  }

  simulateStep() {
    const displacement = this.displaceRange;
    if (this.wanderRandom) this.displaceRange = 0;
    const wander = super.wander();
    this.displaceRange = displacement;
    if (this.wanderRandom) this.wanderTheta += this.wanderRandom();
    super.applyForce(wander);
    if (this.bounds) {
      const margin = this.radius + 8;
      const boundary = super.boundaries(this.bounds.x, this.bounds.y,
        this.bounds.width, this.bounds.height, margin);
      if (boundary.magSq() > 0) {
        const force = p5.Vector.sub(boundary, this.vel);
        force.limit(this.maxForce * 2);
        super.applyForce(force);
      }
    }
    super.update();

    // Mise à jour de l'effet d'éclair
    this.updateLightning();
  }

  updateLightning() {
    if (this.lightningIntensity > 0) {
      this.lightningIntensity *= 0.82;
      if (this.lightningIntensity < 0.02) this.lightningIntensity = 0;
    }

    for (let i = this.lightningBolts.length - 1; i >= 0; i -= 1) {
      this.lightningBolts[i].life -= 1;
      if (this.lightningBolts[i].life <= 0) {
        this.lightningBolts.splice(i, 1);
      }
    }

    this.lightningCooldown -= 1;
    if (this.lightningCooldown <= 0) {
      this.triggerLightning();
      this.lightningCooldown = Math.floor(80 + Math.random() * 160);
    }
  }

  triggerLightning() {
    this.lightningIntensity = 1.0;
    const startAngle = Math.random() * Math.PI * 2;
    const startDist = Math.random() * this.radius * 0.4;
    const startX = Math.cos(startAngle) * startDist;
    const startY = Math.sin(startAngle) * startDist;

    const endAngle = startAngle + (Math.random() - 0.5) * 1.5;
    const endDist = this.radius * (0.85 + Math.random() * 0.45);
    const endX = Math.cos(endAngle) * endDist;
    const endY = Math.sin(endAngle) * endDist;

    const points = [{ x: startX, y: startY }];
    const steps = 6 + Math.floor(Math.random() * 4);
    for (let i = 1; i < steps; i += 1) {
      const t = i / steps;
      const mx = startX + (endX - startX) * t + (Math.random() - 0.5) * (this.radius * 0.45);
      const my = startY + (endY - startY) * t + (Math.random() - 0.5) * (this.radius * 0.45);
      points.push({ x: mx, y: my });
    }
    points.push({ x: endX, y: endY });

    this.lightningBolts.push({ points, life: 6, maxLife: 6 });
  }

  render() {
    if (typeof push !== 'function') return;
    push();
    translate(this.pos.x, this.pos.y);

    const time = (typeof millis === 'function' ? millis() : Date.now()) * 0.001;
    const flash = this.lightningIntensity;
    const weatherMode = typeof globalThis !== 'undefined' && globalThis.radarWeatherMode;

    if (weatherMode === 'DOPPLER') {
      // Mode Radar Météo Doppler / Réfléctivité (Vert -> Jaune -> Rouge)
      noStroke();
      fill(0, 180, 60, 50);
      circle(0, 0, this.radius * 2.5);
      fill(230, 200, 20, 90);
      circle(0, 0, this.radius * 1.7);
      fill(235, 45, 45, 140);
      circle(0, 0, this.radius * 0.95);
      if (flash > 0.1) {
        fill(255, 255, 255, flash * 180);
        circle(0, 0, this.radius * 1.5);
      }
    } else {
      // Texture réaliste de nuage d'orage / brume avec sprites Kenney Particle Pack (Option 2)
      const textures = (typeof stormCloudTextures !== 'undefined' && stormCloudTextures.length > 0)
        ? stormCloudTextures
        : null;

      if (textures && textures[0]?.width > 0) {
        // Rendu basé sur les sprites haute définition de brume / fumée Kenney
        push();
        imageMode(CENTER);

        // 1. Teinte atmosphérique diffuse périphérique
        tint(30, 36, 48, 45);
        image(textures[0], 0, 0, this.radius * 3.2, this.radius * 3.2);

        // 2. Bouffées de textures superposées avec rotation lente et illumination flash
        for (let i = 0; i < this.puffs.length; i += 1) {
          const p = this.puffs[i];
          const img = textures[i % textures.length];
          const drift = Math.sin(time * p.speed + p.phaseOffset) * (this.radius * 0.15);
          const curDist = this.radius * p.distRatio + drift;
          const curAngle = p.angle + time * 0.06 * p.speed;
          const px = Math.cos(curAngle) * curDist;
          const py = Math.sin(curAngle) * curDist;
          const size = this.radius * p.sizeRatio * 1.9;

          // Calcul de la teinte : sombre par défaut, éclat blanc électrique lors du flash
          const baseG = p.gray;
          const r = Math.min(255, baseG + flash * (245 - baseG));
          const g = Math.min(255, baseG + 4 + flash * (248 - baseG));
          const b = Math.min(255, baseG + 16 + flash * (255 - baseG));
          const alpha = 85 + flash * 120;

          push();
          translate(px, py);
          rotate(curAngle + p.phaseOffset);
          tint(r, g, b, alpha);
          image(img, 0, 0, size, size);
          pop();
        }

        // 3. Cœur sombre et dense
        tint(Math.min(255, 18 + flash * 220), Math.min(255, 20 + flash * 220), Math.min(255, 28 + flash * 240), 160);
        image(textures[1] || textures[0], 0, 0, this.radius * 1.6, this.radius * 1.6);
        pop();
      } else {
        // Fallback vectoriel fluide si les images sont en cours de chargement
        noStroke();
        fill(35, 42, 54, 25);
        circle(0, 0, this.radius * 2.85);
        fill(28, 35, 46, 40);
        circle(0, 0, this.radius * 2.3);

        for (const p of this.puffs) {
          const drift = Math.sin(time * p.speed + p.phaseOffset) * (this.radius * 0.15);
          const curDist = this.radius * p.distRatio + drift;
          const curAngle = p.angle + time * 0.07 * p.speed;
          const px = Math.cos(curAngle) * curDist;
          const py = Math.sin(curAngle) * curDist;
          const puffSize = this.radius * p.sizeRatio * 1.45;

          const baseG = p.gray;
          const r = Math.min(255, baseG + flash * (240 - baseG));
          const g = Math.min(255, baseG + 4 + flash * (245 - baseG));
          const b = Math.min(255, baseG + 16 + flash * (255 - baseG));
          const alpha = 75 + flash * 110;

          fill(r, g, b, alpha);
          circle(px, py, puffSize);
        }

        const coreGray = Math.min(255, 22 + flash * 215);
        fill(coreGray, coreGray + 3, coreGray + 10, 160);
        circle(0, 0, this.radius * 1.2);
      }

      // 4. Éclairs ramifiés (lightning forks)
      for (const bolt of this.lightningBolts) {
        const boltAlpha = (bolt.life / bolt.maxLife) * 255;
        // Lueur ionisée externe
        stroke(165, 215, 255, boltAlpha * 0.6);
        strokeWeight(4.5);
        noFill();
        beginShape();
        for (const pt of bolt.points) vertex(pt.x, pt.y);
        endShape();

        // Cœur électrique blanc
        stroke(255, 255, 255, boltAlpha);
        strokeWeight(1.8);
        beginShape();
        for (const pt of bolt.points) vertex(pt.x, pt.y);
        endShape();
      }
    }

    pop();
  }
}

if (typeof globalThis !== 'undefined') globalThis.StormCell = StormCell;
if (typeof module !== 'undefined' && module.exports) module.exports = StormCell;
