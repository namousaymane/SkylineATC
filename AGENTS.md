# Consignes pour les agents IA — SkylineATC

Ce document s'applique à l'intégralité du projet **SkylineATC : Vector Approach** situé dans `SkylineATC`. L'objectif est de développer un simulateur de contrôle aérien complet, immersif et rigoureux en JavaScript ES2022 et p5.js, fondé sur les *Steering Behaviors* de Craig W. Reynolds et un réseau de neurones entraîné par neuroévolution.

---

## 1. Règles Fondamentales & Respect de l'Architecture

### 1.1. Règle impérative : protection absolue de `vehicle.js`
**Ne modifier sous aucun prétexte le fichier `vehicle.js` de base fourni dans le projet.**
Cette protection couvre l'intégralité du fichier : ses propriétés, ses méthodes, ses commentaires et sa mise en forme.
- Ne pas corriger, reformater, renommer, déplacer, écraser ou monkey-patcher le prototype de `Vehicle`.
- Ajouter ou spécialiser les comportements **exclusivement dans des sous-classes** (`Airplane extends Vehicle`, `FighterJet extends Airplane`, `EmergencyVehicle extends Vehicle`, etc.), dans des fichiers dédiés.
- Réutiliser la locomotion héritée (`applyForce()`, `update()`) et les comportements existants (`super.seek()`, `super.arrive()`, `super.flee()`) via l'héritage propre et `super`.

### 1.2. Règle impérative : toute entité graphique mobile est un `Vehicle`
Tout objet visible qui se déplace dans l'espace aérien ou au sol doit être une instance de `Vehicle` ou d'une de ses sous-classes :
- Avions de ligne, jets régionaux, turboprops et hélicoptères (`Airplane`, `Airliner`, `Helicopter`).
- Chasseurs militaires d'interception (`FighterJet extends Airplane`).
- Véhicules d'intervention au sol (`EmergencyVehicle extends Vehicle`).
- Cellules orageuses mobiles dérivant sous l'effet du vent (`StormCell extends Vehicle`).
- Faisceau radar de balayage ou particules de traînée / fumée.

**Aucune entité mobile n'est téléportée ou déplacée manuellement par assignation directe de ses coordonnées `pos.x` ou `pos.y`** (hors réapparition / initialisation explicite documentée). Tout mouvement est le résultat exclusif de l'application de forces Newtoniennes :
$$\vec{a} = \frac{\sum \vec{F}}{m}, \quad \vec{v} = \text{limite}(\vec{v} + \vec{a}, \, \text{maxSpeed}), \quad \vec{p} = \vec{p} + \vec{v}$$

---

## 2. Steering Behaviors selon Craig W. Reynolds

Le modèle suit rigoureusement Craig W. Reynolds, *Steering Behaviors for Autonomous Characters* (GDC 1999) :
1. **Sélection d'action** : L'aéronef ou le contrôleur choisit l'objectif (interception ILS, maintien de cap, évitement d'urgence TCAS, déviation météo, circuit d'attente).
2. **Steering** : La sous-classe calcule chaque composante vectorielle de force :
   $$\vec{F}_{\text{steering}} = \text{limite}(\vec{v}_{\text{désirée}} - \vec{v}_{\text{actuelle}}, \, \text{maxForce})$$
3. **Locomotion** : Les forces pondérées sont sommées, limitées par `maxForce`, puis transmises à `super.applyForce(F)` et intégrées par un appel unique à `super.update()` par image.

### Comportements exigés et leurs contrats :
- **`Path Following` & `Scalar Projection`** : Suivi de l'axe de piste ILS (*Localizer*) et des taxiways au sol par projection orthogonale de la position future sur les segments directeurs.
- **`Arrival`** : Ralentissement progressif sur le plan de descente (*Glide Slope*) avec décélération jusqu'à la vitesse de contact ($130\text{ kts}$), puis freinage jusqu'à l'arrêt complet au point de stationnement.
- **`Separation` (TCAS)** : Surveillance permanente du voisinage. Si deux aéronefs partagent la même tranche d'altitude et s'approchent sous le seuil de sécurité, une force répulsive en $1/d^2$ est appliquée pour forcer l'évitement latéral d'urgence.
- **`Obstacle Avoidance`** : Cône de collision projeté vers l'avant scannant les cellules orageuses (`StormCell`) et reliefs, générant une force latérale de contournement.
- **`Pursue`** : Utilisé par les chasseurs militaires d'interception (`FighterJet`) en cas d'alerte `Squawk 7700 / 7600`, prédisant la position future de l'avion civil en détresse pour lui couper la route.
- **`Wander`** : Dérive progressive et organique des cellules orageuses et des turbulences de vent sur un cercle virtuel.
- **`Leader Following / Chaining`** : File indienne de roulage au sol et avion civil escorté derrière le chasseur d'interception.

---

## 3. Intelligence Artificielle & Neuroévolution

- **Technologie** : Réseau de neurones feedforward sur-mesure en **pur JavaScript ES2022** (algèbre matricielle légère, synchrone). Ne pas utiliser TensorFlow.js ni de frameworks externes lourds.
- **Rôle du réseau (orientation ATC demandée par l'utilisateur)** : Le réseau classe les clairances candidates via 26 entrées et 1 sortie de priorité. Il contrôle l'aéroport par les mêmes commandes que le joueur ; il ne manipule jamais les coordonnées, vitesses ou coefficients de steering des avions. L'ancien pilote neuronal est retiré. Les steering behaviors restent responsables de tous les mouvements.
- **Évaluation** : Sessions isolées à trafic identique, sécurité avant débit, comparaison au contrôleur à règles et validation sur graines inédites. Un score d'entraînement ne vaut pas une validation.
- **Transparence et interaction** : L'interface doit permettre d'observer les activations neuronales, de modifier les hyperparamètres (population, mutation, élitisme), d'entraîner en mode accéléré x20, et d'exporter/importer les cerveaux au format JSON.

---

## 4. Organisation du Code & Bonnes Pratiques

- **Modularité stricte** : Une classe majeure = un fichier dans le sous-dossier adéquat (`core/`, `entities/`, `airspaces/`, `ai/`, `ui/`, `tests/`).
- **Autonomie** : Le projet doit tourner directement dans un navigateur moderne sans build, sans bundler (Webpack/Vite) et sans installation `npm` obligatoire pour jouer.
- **Styles p5.js** : Isoler chaque nouveau rendu avec `push()` et `pop()`. Ne jamais laisser de transformation (`translate`, `rotate`, `scale`), de `colorMode` ou de style altérer les autres éléments graphiques.
- **Modèle temporel** : Conserver le pas d'intégration par image conforme à la base `Vehicle`. Ne pas multiplier arbitrairement par `deltaTime` une force déjà intégrée par la base.
- **Gestion Audio** : Respecter les politiques de lecture automatique des navigateurs (initialisation de l'AudioContext lors de la première interaction utilisateur) et prévoir un nettoyage systématique des sources et timers.

---

## 5. Tests Automatisés & Critères de Livraison

**Aucune fonctionnalité ne doit être proposée à l'utilisateur sans qu'une suite de tests unitaires automatisés (`node:test`) ait été exécutée et soit passée avec 100% de succès.**
- Les tests s'exécutent avec `node --test tests/*.test.mjs` sans dépendance externe.
- Ils couvrent :
  1. La validité des forces et les bornes physiques (`maxForce`, `maxSpeed`),
  2. L'absence de division par zéro (avions superposés, distances nulles),
  3. L'exactitude des calculs géométriques (projection scalaire, détection d'obstacles, angles),
  4. Les seuils de déclenchement du TCAS et le respect de l'altitude,
  5. L'intégrité matricielle du réseau de neurones et la reproductibilité des prédictions,
  6. La vérification que le fichier de base `vehicle.js` est resté strictement identique à l'original.
- En cas d'échec d'un test, corriger le code avant de déclarer la tâche terminée.
