# Audit de fiabilité avant démonstration

Date : 21 octobre 2026. Périmètre : fonctionnalités existantes du jeu solo,
du laboratoire ATC et des démonstrations de steering. Aucun changement de `vehicle.js`.

## Couverture automatisée

Exécution sans dépendances :

```powershell
node --test tests/*.test.mjs
```

Pour limiter la charge pendant les essais du navigateur :

```powershell
node --test --test-concurrency=4 tests/*.test.mjs
```

| Domaine | Contrôles |
| --- | --- |
| Départs | B738, B788 et A388, chaque direction compatible de SKY1, CMN, RAK, NCE et JFK : stand, repoussage, taxi, traversées, hold short, alignement, sortie assignée, décollage, montée et libération de piste |
| Arrivées | Mêmes combinaisons compatibles : approche, clairance proche, toucher, freinage, dégagement, traversées et taxi jusqu'au stand |
| Cas de contrôle | Changement de piste au point d'attente, rejet de décollage, retour au stand, nouvelle tentative, piste indisponible, remise de gaz, refus sans téléportation |
| Physique | Positions/vitesses/altitudes finies, déplacement borné, forces limitées, virages bornés, absence d'arrêt des avions à voilure fixe pendant le virage |
| Steering | Seek, Arrival, projection scalaire/Path Following, Separation/TCAS, Obstacle Avoidance, Wander, Pursuit, Evade et Leader Following |
| Météo | 27 combinaisons modèle/rayon/décalage, distance à la vraie hitbox, retour à l'objectif, plusieurs cellules mobiles, turbulence subordonnée et aucune déviation météo du taxiway |
| Sécurité | Conflit frontal, changement de palier, collision balayée entre deux pas, destruction et score, contact avec un avion stationné, files et arrêt au sol |
| Urgences | Moteur, radio et détournement jusqu'au stand sur les cinq plateformes, avec délai et commandes ordinaires ; engagement des secours |
| Hélicoptère | Occupation unique de la station, décollage, cap, retour, stationnement et TCAS pendant le retour |
| Interception | Ordre explicite, entrée en bord de secteur, Seek/Pursuit puis escorte, séparation de fin d'escorte sans fausse RA, montée/sortie et nettoyage si la cible disparaît |
| IA ATC | Réseaux de 1 à 4 couches, mutations/croisements, import/export JSON, sessions isolées identiques, arrêt/reprise, configuration, décisions réelles et installation/désactivation du contrôleur |
| Évaluation IA | Sécurité avant débit, compteurs sans doublon, validation sur trois graines inédites, cycle calme neuronal complet sur chaque plateforme, météo initiale récupérable |
| Modes/score | Libre, missions et urgences, score unique par événement, +100 après transfert sectoriel en libre, chrono, arrêt exact à zéro, fin de partie |
| Interface | Raccourcis et champs de saisie, modales/aide/tutoriel, cadrage caméra, strips indépendantes du zoom, identités DOM stables, liste vide après sortie, réglages Debug synchronisés, tempo 0,25× conservé au relancement |
| Cartes/rendu | Géométrie GeoJSON, nord en haut, routes, décor procédural, silhouettes, positions du balisage nocturne des quatre aéroports et nuages bornés par leur hitbox |
| Audio | Consommation des événements, TA/RA, activation et nettoyage des sources avec doubles de test |
| Intégrité | Base canonique `vehicle.js` strictement inchangée |

Les nouveaux tests d'audit se trouvent dans `tests/audit-workflows.test.mjs`,
`tests/audit-weather-ai.test.mjs`, `tests/audit-emergencies-ui.test.mjs` et
`tests/flight-strips.test.mjs`. Les suites existantes restent exécutées.

## Défauts corrigés

- L'objectif de navigation pouvait contrer l'évitement météo ; la RA TCAS reste prioritaire,
  puis l'évitement, puis les contributions normales. La turbulence ne neutralise pas l'évitement.
- Le cas météo de démonstration démarrait trop près de la cellule agrandie pour un virage
  physiquement récupérable. Le départ est maintenant placé à distance suffisante et le test
  compare la distance minimale au rayon réel, augmenté du rayon de l'avion.
- La démo météo pouvait annoncer sa réussite malgré une pénétration ; elle signale maintenant
  cet échec. La démo Seek attend réellement le passage près de l'objectif.
- Les textures de nuage débordaient largement de la hitbox ; le rendu est borné par la même
  zone circulaire. La caméra conserve le contexte de la démo à sa fin.
- L'évitement météo pouvait faire dévier les avions au sol. Il est réservé au vol.
- Un refus de retour au stand pouvait remplacer `TAKEOFF_ABORTED` par un état bloqué.
- Les protections de circulation ne couvraient pas tous les mouvements de dégagement ;
  elles couvrent maintenant les routes au sol actives, sans mouvement latéral d'évitement.
- Les appareils stationnés ne doivent ni être traversés par un avion mobile, ni bloquer
  une voie voisine qui ne coupe pas leur volume de collision. L'arrêt reste actif à vitesse nulle.
- L'IA pouvait lancer un repoussage devant une arrivée proche, puis bloquer le taxiway.
- La cellule du labo, déjà dimensionnée en NM, recevait à tort un agrandissement supplémentaire x10.
- Le labo comptait à tort l'intersection protégée d'une autre piste à JFK comme une incursion.
- L'échelle TCAS n'était pas adaptée à la projection de chaque aéroport.
- Deux hélicoptères pouvaient occuper la même station et le retour hélicoptère omettait le TCAS.
- Le chasseur pouvait apparaître au centre au lieu du bord, être envoyé sur un avion au sol,
  conserver une ancienne cible de navigation ou dériver après disparition du civil. Les indicatifs
  militaires simultanés sont distincts. Une séparation transitoire de fin d'escorte ne déclenche
  pas de fausse RA entre partenaires ; la surveillance normale est rétablie après séparation.
- Debug pouvait afficher une météo ou un trafic différents de la session réelle.
- Les strips étaient intégralement recréées pendant les mises à jour, fragilisant clic et focus.
  La dernière strip pouvait également rester affichée après la sortie du dernier vol.
- Le curseur 0,25× pouvait vider le sélecteur de vitesse (`.25` contre `0.25`) et bloquer
  la prochaine partie à une vitesse nulle.
- Le laboratoire pouvait être masqué par le lobby ; il s'affiche maintenant au-dessus,
  possède un accès direct dans le menu et restitue le focus au bouton d'origine.
- Son cadrage pouvait partir vers un départ déjà traité, très loin du terrain ;
  il reste maintenant ancré aux positions initiales identiques des épisodes.
- Les ressources JavaScript/CSS du point d'entrée portent une version pour ne pas
  réutiliser des scripts ou styles anciens après cette mise à jour.

## Essais dans le vrai navigateur

- Lancement depuis le lobby et bac à sable avec trafic automatique désactivé.
- Sélection par strip, cadrage du vol et choix de sortie sans utiliser Debug.
- Départ manuel à la souris : sortie EXIT-090, repoussage jusqu'à READY_TAXI,
  taxi jusqu'à HOLD_SHORT, LINE_UP_WAIT, décollage, montée puis transfert et +100 points.
- Chargement et lancement d'une démo météo depuis Debug, vecteurs visibles,
  contournement et arrêt automatique à la fin de la démonstration.
- Démo collision volontaire : destruction des deux appareils, compteur de vols à zéro
  et liste réellement vidée dans l'interface.
- Ouverture du laboratoire, changement d'architecture, application des réglages,
  démarrage à 20× et pause après évaluation de générations.
- Validation indépendante constatée dans l'interface : trois sessions sur trois sûres,
  au moins 80 % de la demande traitée et trois scores au moins égaux à la référence
  (expérience calme, ciel dégagé, réseau amorcé 26 → 16 → 12 → 1).

## Limites de ce constat

Une suite verte ne garantit pas l'absence absolue de bugs dans toute combinaison de
trafic, de météo et de commandes. Les tests matriciels couvrent les configurations
décrites, pas chaque stand de chaque aéroport avec une durée de jeu illimitée.
Les performances et altitudes sont des modèles de jeu, pas une simulation aéronautique certifiée.

L'import/export et l'installation IA sont vérifiés automatiquement ; l'export a aussi
été téléchargé via l'interface et son format `SkylineATC-Controller` vérifié. Un contrôleur
entraîné n'est pas annoncé « réussi » sans sa validation séparée. La voix réellement
disponible et son rendu audible dépendent du navigateur et du système : les tests
audio ne remplacent pas une écoute sur la machine qui enregistrera.

Pour filmer : répéter les scénarios déterministes avant la prise, garder les vecteurs
et hitboxes visibles pour les behaviors, ne pas présenter une collision volontaire
comme un échec du TCAS et ne pas présenter l'amorçage de l'IA comme un apprentissage à zéro.
Cet audit ne produit pas encore d'enregistrement vidéo.
