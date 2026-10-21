# SkylineATC — Cahier des charges pragmatique

Version de travail : 4.7
Objectif immédiat : obtenir une démo jouable et fiable avant d’ajouter les extensions avancées.

## 1. Vision

SkylineATC est un jeu solo de contrôle aérien dans lequel le joueur gère des avions autour d’un aéroport :

- les arrivées et les approches ILS ;
- les départs depuis les parkings ;
- le roulage et les autorisations de piste ;
- les conflits de circulation ;
- la météo et les situations d’urgence.

Le projet doit privilégier un gameplay clair et testable. Les futures fonctionnalités doivent enrichir le jeu sans contourner le moteur de mouvement ni rendre les opérations incompréhensibles.

Le multijoueur est hors périmètre pour le moment.
Les véritables procédures STAR/SID ne seront pas implémentées : priorité aux
steering behaviors, aux mécaniques de jeu et aux approches simplifiées lisibles.

### Interface de jeu et apprentissage

- Menu initial et pause Échap, choix d’aéroport/scénario/vitesse, nouvelle session.
- Vue de jeu légère : carte inchangée, fiche de sélection, piste, action contextuelle,
  dernier message et score. Les commandes sont prioritairement clavier/souris.
- D affiche/masque le panneau debug avec télémétrie, forces et réglages ; B affiche
  la liste des vols. Aucun détail technique permanent sur la vue normale.
- Tutoriel interactif F1 en sept étapes, validées uniquement par une action réussie.
- Clic avion / Tab : sélection ; glisser avion : cap ; double-clic point / Entrée :
  direct ; Maj-clic point / H : attente ; R : piste ; A : approche ; L : atterrissage ;
  G : remise des gaz ; P/T/C/U/K : repoussage, taxi, traversée, alignement, décollage.
- Espace : pause ; PageUp/PageDown : altitude ±500 ft ; F : suivi ; V : cadrage ;
  +/− : zoom ; ? : aide. Les raccourcis ne détournent pas une saisie dans un champ.
- Suivi de leader longitudinal sur les segments taxi et en file vers un checkpoint
  commun, même lorsque l’avion de tête est arrêté au hold short. Une marge de
  sécurité conserve le suivant en amont du point d’attente ; aucune force latérale
  ne fait quitter le pavement.
- Changement de cap/direct : virage borné par modèle, conservation de vitesse en
  virage libre, accélération progressive ; intégration exclusivement par Vehicle.
- O : cadrage direct de l’aéroport ; aide ? sous forme de clavier interactif
  surligné, avec pause temporaire et accès souris/clavier aux descriptions.
- L : clairance d’atterrissage uniquement après établissement en approche finale et
  à moins de 3 NM du seuil ; la piste doit rester libre et réservée au vol.
- Un départ arrêté au point d’attente peut recevoir une nouvelle piste ; le nouvel
  itinéraire sol est recalculé et les traversées restent soumises à clairance.
- X pendant la course au décollage déclenche un rejet avec freinage par force ; après
  arrêt, la piste reste réservée jusqu’à une sortie physique. X à faible vitesse en
  roulement ou après rejet demande le dégagement prioritaire par taxiway.
- Après un rejet arrêté, le contrôleur peut soit autoriser un retour taxi-in vers un
  parking (sans repoussage sur ce trajet), soit demander une nouvelle tentative sur
  la piste choisie. Dans les deux cas l'avion dégage d'abord physiquement l'ancienne
  piste ; elle n'est libérée qu'après dégagement. La nouvelle tentative rejoint le
  point d'attente par le réseau taxiway, avec les traversées soumises à clairance.
- Les postes de parking utilisés par le jeu sont échantillonnés et espacés afin de
  limiter les symboles superposés ; les points sélectionnés gardent leurs coordonnées
  et leurs routes sol issues de la géométrie aéroportuaire.

Le menu solo expose les modes suivants :

- **Libre** : partie sans fin, avec génération continue de trafic réglable ; aucun écran
  de défaite. Le score personnel reste visible pendant la session.
- **Missions** : scénarios finis à objectifs (conflit de piste, pointe, approche
  instable). La partie se termine au traitement de tous les vols et ouvre un bilan.
- **Urgences** : scénarios finis autour d’une panne moteur (7700), panne radio (7600)
  ou d’un détournement (7500), puis traitement des objectifs associés.
  Les véhicules incendie/médicaux répondent aux urgences à l’atterrissage ; le
  contrôleur décide explicitement s’il autorise une interception. Le FighterJet
  entre alors depuis le bord du secteur et poursuit sa cible par steering.
- **Aéroport** : bac à sable sans fin sur la plateforme sélectionnée.
- **Score** : base de 1 000 points, +250 par arrivée/départ achevé, −500 par collision.
  Les missions et urgences s’achèvent quand leurs objectifs initiaux sont résolus ;
  les nouveaux vols créés en cours de partie étendent les objectifs.
- **Communications ATC** : annonces optionnelles en français via la synthèse vocale
  du navigateur. Les alertes TCAS TA/RA ajoutent une tonalité Web Audio et « Traffic,
  traffic » ; aucune captation sonore de cockpit n’est embarquée.
- **Tutoriel** : parcours pédagogique interactif accessible depuis le menu.

Le laboratoire IA est une entrée séparée prévue après la stabilisation des modes
joueur : observation, entraînement neuroévolutif et gestion/import-export des réseaux.

### Navigation aérienne jouable

- Carte zoomable à la molette et aux boutons, déplacement par glisser du fond,
  nord vrai toujours en haut ; limites cartographiques à 80 NM autour de l’aéroport.
- Sélection d’un avion par clic ; glisser depuis un avion en vol pour prévisualiser
  une flèche de cap puis valider au relâchement. Échap annule sans nouvel ordre.
- Cap vrai numérique, direct vers un point et attente au point, avec choix de
  branche entrante et de virages droite/gauche. Un nouvel ordre remplace le précédent.
- Points réels projetés depuis WGS84 : documents ONDA ENR 4.4, SIA ENR 4.4 et FAA,
  avec lien source affiché par point ; points d’entraînement clairement fictifs.
- Attentes simplifiées en hippodrome, suivies par steering/path following ;
  aucune prétention de reproduire les entrées et contraintes réglementaires des
  procédures publiées. Pas de conversion magnétique ni d’usage aéronautique réel.
- Raccourcis de cadrage aéroport/espace aérien/points et suivi optionnel de l’avion.
- Repère FINAL fictif à 3 NM de chaque seuil, axe prolongé affiché ; arrivée du
  côté opposé via décalage latéral, vent arrière et base avant capture de finale.
  La descente débute seulement après vérification du cap et de l’écart latéral.
- Consigne d’altitude 1000–12000 ft hors approche/montée initiale, variation
  verticale bornée par pas ; modèle vertical de jeu, pas une performance réelle.
- Ajout manuel d’orages devant le vol sélectionné, limité à cinq par session,
  pour observer wander, évitement et turbulences dans la démo.
- Campagne procédurale en tuiles mises en cache (champs, bois, routes, bâtiments)
  au-delà de l’emprise OSM de l’aéroport ; ces alentours ne sont pas géographiques.

## 2. Règles techniques non négociables

### 2.1. `vehicle.js`

Le fichier [`vehicle.js`](./vehicle.js) est une base canonique protégée.

- Il ne doit jamais être modifié.
- Toutes les entités mobiles doivent hériter de `Vehicle` ou d’une sous-classe.
- Les spécialisations se font dans des fichiers dédiés.

### 2.2. Mouvement

Le déplacement normal doit toujours suivre le modèle :

```text
force(s) → applyForce() → update()
```

Les positions ne sont pas modifiées directement pendant la simulation. Les seules exceptions sont l’initialisation, le spawn et la réinitialisation d’une partie.

Les avions au sol restent des véhicules physiques. Ils roulent, ralentissent et s’arrêtent au moyen de forces.

### 2.3. Tests

Chaque fonctionnalité importante doit être testée avec :

```text
node --test tests/*.test.mjs
```

La suite doit rester entièrement verte avant de poursuivre une nouvelle brique.

## 3. Version jouable actuelle — V1

La V1 doit permettre de lancer une partie directement depuis `index.html`.

### 3.1. Scène

La scène minimale affiche :

- une piste ;
- un taxiway ;
- des parkings ;
- les avions ;
- les cellules orageuses éventuelles ;
- les points `HOLD SHORT` ;
- les informations essentielles de vol.

### 3.2. Interaction

Le joueur peut :

- sélectionner un avion en cliquant dessus ;
- sélectionner un scénario ;
- sélectionner un aéroport ;
- mettre la simulation en pause ;
- accélérer ou ralentir le temps ;
- créer un nouveau départ depuis un parking libre ;
- autoriser le repoussage et le taxi ;
- autoriser une traversée ;
- donner `LINE UP AND WAIT` ;
- donner `CLEARED FOR TAKEOFF` ;
- déclarer une urgence `7700` ou `7600` ;
- observer les événements et le score.

### 3.3. États d’un départ

Les transitions principales sont :

```text
PARKED
→ PUSHBACK
→ READY_TAXI
→ TAXIING
→ WAITING_RUNWAY_CROSSING
→ HOLD_SHORT
→ LINING_UP
→ LINE_UP_WAIT
→ TAKEOFF_ROLL
→ CLIMB_OUT
→ AIRBORNE
```

Un départ ne doit jamais être téléporté directement sur la piste ou au décollage.

### 3.4. États d’une arrivée

```text
INBOUND / HOLDING
→ VECTORING
→ APPROACH
→ FINAL
→ TOUCHDOWN
→ ROLL_OUT
→ VACATING
→ WAITING_TAXI
→ TAXI_IN
→ PARKED
```

Une approche non sûre peut déclencher :

```text
APPROACH / FINAL → GO_AROUND
```

### 3.5. Clairances de la démo tour

L'interface jouable utilise `TowerSession extends GameSession`. Les petites configurations `GameSession` restent disponibles pour les exercices et tests du moteur de base.

- Le joueur choisit une **direction** par avion : par exemple 17L ou 35R. Les deux directions utilisent une seule ressource de piste physique. Les pistes qui se croisent se protègent également pendant une occupation.
- L'affectation d'une approche ne vaut pas autorisation d'atterrir. La clairance est possible seulement une fois établi sur la finale, dans la fenêtre proche du seuil (≤3 NM), et la piste doit être libre. Sans clairance avant le point de décision, l'avion remet les gaz puis revient en attente. Un changement de piste en finale demande d'abord une remise des gaz.
- Le repoussage déplace réellement l'avion en marche arrière par forces sur son axe de stand. Le taxi exige ensuite une autorisation distincte.
- Toute traversée insérée dans l'itinéraire exige une autorisation et conserve l'occupation jusqu'au dégagement.
- `LINING_UP` décrit le mouvement d'alignement ; `LINE_UP_WAIT` n'est atteint qu'après contrôle de position sur l'axe, de cap et de vitesse. Le bouton décollage reste indisponible avant cela.
- Une piste peut être réassignée depuis `HOLD_SHORT` à l’arrêt ; l’avion reprend le roulage par l’itinéraire calculé, sans téléportation.
- Le rejet au décollage freine par steering et conserve la réservation jusqu’à l’arrêt et au dégagement. Le dégagement prioritaire emprunte le taxiway le plus proche disponible et garde le taxi vers le parking distinct.
- Une arrivée garde la piste pendant le freinage et le dégagement. Le taxi vers un stand est autorisé après confirmation de piste dégagée. Le joueur peut réserver un stand avant ou après l'approche.
- Les commandes impossibles sont désactivées. Les refus de disponibilité ou de compatibilité sont expliqués. Un départ ne peut pas traverser une piste réservée par une arrivée.

### 3.6. Trafic et modèles

Le trafic entrant et sortant est généré dans le temps de simulation, avec variations d'indicatif unique, modèle, altitude, point d'entrée, piste attendue et intervalle. Il est plafonné, désactivable et réglable en densité. Une graine permet de rejouer la même séquence avec les mêmes commandes ; une partie normale choisit une nouvelle graine. La pause interrompt le trafic et aucune minuterie murale n'est utilisée.

Trois modèles sont proposés : B737-800 (`B738`), B787-8 (`B788`) et A380-800 (`A388`). Leurs silhouettes utilisent leurs proportions, leur envergure et deux ou quatre moteurs, ainsi que des winglets/extrémités de voilure distinctes. Les vitesses sol, vitesses de rotation, phases d'accélération et de freinage sont différenciées. Le gabarit est pris en compte pour le stationnement ; les dimensions de stands non publiées utilisent une capacité de jeu estimée d'après l'espacement et sont identifiées comme telles.

Les longueurs minimales de piste et performances sont des paramètres de gameplay, pas des calculs de certification. La montée et la descente restent des consignes verticales simplifiées. Les vitesses du moteur sont exprimées en unités par pas ; l'interface ne les présente pas comme des nœuds réels. Le mode découverte démarre à 0.25× et le joueur peut accélérer la simulation.

Les onglets Opérations, Télémétrie et Réglages sont fonctionnels. La télémétrie montre les forces, leurs limites, les behaviors actifs, l'écart ILS et l'avancement de route. Les trajectoires et forces peuvent être affichées sur la carte.

## 4. Steering behaviors obligatoires

Les comportements sont le cœur du projet. Ils doivent rester observables dans la télémétrie de chaque avion.

### 4.1. Navigation

- `seek` pour rejoindre une cible ;
- `arrive` pour ralentir à l’approche ;
- suivi de trajectoire par projection scalaire ;
- suivi d’axe d’approche simplifié ;
- freinage progressif au sol.

### 4.2. Sécurité

- séparation TCAS ;
- protection contre les superpositions et divisions par zéro ;
- évitement des obstacles dans un corridor futur ;
- mémorisation du côté de contournement ;
- conflits de roulage détectés avant intégration.

### 4.3. Behaviors avancés

- `Pursue` pour l’interception ;
- `Evade` pour l’évitement d’une menace ;
- `Leader Following` pour des files ou escortes ;
- `Wander` pour la dérive météo.

Les forces sont composées, pondérées puis limitées par `maxForce` avant l’appel à `Vehicle`.

## 5. Météo et urgences

Les cellules orageuses sont des `StormCell extends Vehicle`.

Elles possèdent :

- une position et une vitesse ;
- un rayon d’influence ;
- une intensité variable ;
- un déplacement par `wander` ;
- une force de turbulence ;
- une zone d’évitement.

Les urgences disponibles dans la V1 étendue sont :

- `7700` : urgence générale ;
- `7600` : panne radio ;
- `7500` : détournement ;
- panne moteur ;
- réduction de vitesse ;
- autorisation manuelle d’un `FighterJet` pour interception/escorte depuis le bord
  du secteur (touche `I` ou bouton contextuel).

## 6. Scénarios et scoring

La partie doit proposer des situations facilement testables :

- trafic calme ;
- conflit de piste ;
- heure de pointe ;
- remise des gaz ;
- météo ;
- urgence.

Chaque mission possède :

- des objectifs ;
- un score de départ ;
- des récompenses pour les arrivées et départs réussis ;
- une pénalité de 500 points par collision détectée ;
- un journal d’événements ;
- un état `RUNNING` ou `COMPLETED` ; aucun état d’échec n’est actuellement attribué.
- un écran de résultat permettant de rejouer ou de revenir au menu.

## 7. Aéroports

Les aéroports actuels sont des configurations de jeu légères et cohérentes, pas encore des reproductions aéronautiques certifiées.

Le catalogue V1 contient :

- SKY1 — Skyline Training Airport ;
- CMN — Casablanca ;
- RAK — Marrakech ;
- NCE — Nice ;
- JFK — New York Kennedy.

Les quatre plateformes réelles utilisent des extraits OpenStreetMap GeoJSON WGS84 locaux : pistes, réseau de taxiways, aprons, positions de stationnement, bâtiments et routes. Le catalogue de jeu et le rendu sont construits depuis cette source commune. Les références aéronautiques et les limites de vérification sont documentées dans `data/airports/README.md`.

Le nord vrai reste **toujours en haut**, indépendamment de la piste active, du zoom et de l'avion sélectionné. L'échelle géographique conserve les proportions. Les pistes ont un rendu bitumineux avec grain, bords, seuils, numéros, points de visée, zone de toucher et traces de gomme ; les taxiways et aprons ont un aspect béton avec lignes jaunes et panneaux. Les détails graphiques restent procéduraux.

Les routes de roulage utilisent le graphe des taxiways. Les raccords de stands non renseignés sont identifiés comme adaptations de jeu. Les bâtiments suivent les empreintes importées. Les panneaux d'opérations laissent la carte dégagée ; le zoom permet d'inspecter l'avion sélectionné sans tourner la scène.

## 8. Ordre de développement

### Étape A — Démo jouable

- scène visible ;
- avions cliquables ;
- départ manuel ;
- workflow sol complet ;
- arrivée ILS ;
- contrôles pause et vitesse ;
- journal d’événements.

### Étape B — Gameplay robuste

- plus d’avions simultanés ;
- conflits plus lisibles ;
- priorités opérationnelles ;
- missions et scoring améliorés ;
- météo placée dans les scénarios ;
- urgences jouables depuis l’interface.

### Étape C — Contenu

- routes sol plus variées ;
- configurations d’aéroport enrichies ;
- nouveaux scénarios ;
- véhicules de secours ;
- avions spécialisés et escortes.

### Étape D — Présentation

- vraie UI/UX radar ;
- flight strips avancés ;
- alertes visuelles et sonores ;
- effets météo ;
- tutoriel ;
- progression et sauvegarde.

### Étape E — Laboratoire IA (solo)

- Le laboratoire entraîne le **contrôleur ATC**, et non les avions. L'ancien pilote neuronal et ses coefficients de forces sont retirés. Aucune STAR/SID publiée n'est requise.
- Un réseau feedforward JavaScript (26 entrées, 1 à 4 couches cachées configurables, 1 sortie) classe chaque clairance candidate : approche/piste, atterrissage, sortie départ, repoussage, taxi, traversée, alignement, décollage, altitude, attente, remise de gaz, dégagement ou temporisation.
- Les 26 entrées comprennent 13 indicateurs d'action et 13 perceptions normalisées. Les actions impossibles ou manifestement conflictuelles sont masquées. Le réseau ne modifie ni la position, ni la vitesse, ni les forces : il appelle exclusivement les méthodes normales de contrôle. Les avions conservent les steering behaviors.
- Chaque individu contrôle sa propre `TowerSession`, avec une demande identique à celle de ses concurrents et du contrôleur de référence à règles. Horizon fixe et graine stable entre générations pour rendre les scores comparables.
- Le score privilégie strictement la sécurité : collisions, pertes de séparation (3 NM / 1000 ft), RA et incursions rendent le score inférieur à celui de toute session sûre. Ensuite sont récompensés les mouvements traités et réduits les délais, remises de gaz et ordres refusés.
- Un mouvement traité correspond à une arrivée au stand ou un départ à l'issue de sa montée initiale, pas au transfert hors du secteur. Le débit horaire est une extrapolation sur la durée de l'épisode, non une capacité aéroportuaire certifiée.
- Neuroévolution avec conservation du meilleur cerveau, élitisme, tournoi, croisement, mutation et scénarios à graine reproductible.
- La moitié de la population est amorcée par une priorité explicite (et ses mutations), l'autre moitié est aléatoire. L'interface ne présente pas cet amorçage comme un apprentissage à partir de zéro.
- Une validation séparée compare le meilleur cerveau et la référence sur trois graines inédites. Réussite : aucun incident, au moins 80 % de la demande traitée dans chacun des trois tests, et score au moins égal à la référence dans chaque test. Pas de déclaration de succès sur le seul score d'entraînement.
- Interface : session isolée observée, journal de clairances, métriques de sécurité/débit/attente, courbes et activations, hyperparamètres et couches modifiables, vitesse jusqu'à 20× sous budget de calcul par image.
- Les fichiers `SkylineATC-Controller` sont exportables/importables. Les anciens fichiers de cerveaux pilotes sont explicitement refusés. Installer un réseau l'applique à tout le contrôle ATC de la partie et l'active ; désactiver IA ATC rend la main au joueur. Le réseau installé est conservé localement, avec retour explicite au contrôleur à règles.
- Le bouton IA ATC transfère les clairances à un contrôleur automatique : affectation de piste, atterrissage, repoussage, taxi, traversées, alignement et décollage sont émis via les méthodes normales de `TowerSession`. Le joueur ne peut pas émettre de clairance, cap ou direct tant que ce mode est actif ; le désactiver rend immédiatement la main au joueur.
- Le contrôleur à règles reste une référence jouable sans entraînement. En mode neuronal, le classement des ordres est appris ; les contraintes de sécurité et préconditions de commande restent explicites. TCAS est conservé comme ultime protection, son déclenchement RA constitue un échec de sécurité de l'épisode.
- Connexion OpenSky explicitement séparée du trafic simulé ; le multijoueur reste hors périmètre tant que le solo n'est pas stable.

## 9. Critères de réussite de la démo

La démo est considérée comme jouable si :

1. le jeu se lance depuis `index.html` ;
2. un avion peut être sélectionné au clic ;
3. un départ peut être créé depuis un parking libre ;
4. l’avion rejoint le `HOLD_SHORT` par forces ;
5. le joueur doit autoriser le line-up puis le décollage ;
6. une arrivée peut atterrir et rejoindre un parking ;
7. les conflits sont bloqués et expliqués ;
8. la météo et les urgences produisent des comportements visibles ;
9. `vehicle.js` reste identique ;
10. tous les tests automatisés passent.

Le projet ne cherche pas encore à reproduire toutes les procédures réelles ni à fournir une interface finale. Il cherche d’abord à être un jeu de contrôle aérien minimal, cohérent et extensible.
