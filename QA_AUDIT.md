# Audit jouabilité — SkylineATC

Mise à jour : le constat courant des mouvements, collisions, interceptions et steering est dans [BEHAVIORS_AUDIT.md](BEHAVIORS_AUDIT.md). Les flight strips couvrent désormais le secteur entier indépendamment du zoom ; les constats de filtrage au cadrage ci-dessous décrivent l'ancienne version. Le panneau D est désormais un inspecteur visuel dédié.

Date : 21 octobre 2026. Portée : code courant, cahier des charges, 171 tests automatisés réussis sur 171 et essai manuel sur `http://127.0.0.1:5500/index.html` dans un navigateur étroit (~586 × 612 px). Ce n'est pas une certification aéronautique ni une validation exhaustive de chaque aéroport sur plusieurs navigateurs.

## Parcours vérifié

| Étape | Constat |
| --- | --- |
| Menu | Libre, Missions, Urgences et Aéroport sélectionnables ; réglages d'aéroport, scénario et vitesse accessibles. Pause/reprise et lancement d'une nouvelle partie fonctionnent. |
| Lecture du trafic | Les strips ne montrent que les avions dans le cadre courant ; le compteur suit le zoom. Douze vols visibles tiennent dans un panneau défilant. Clic sur un strip et Tab sélectionnent un avion visible. |
| Départ manuel | La sortie de secteur se sélectionne à la souris ; l'ordre est confirmé dans le journal. Le repoussage démarre depuis l'action contextuelle. Les tests couvrent ensuite taxi, traversée, attente, alignement, décollage, rejet, retour et nouvelle tentative. |
| Arrivée | Un strip entrant apparaît au dézoom ; piste/approche assignables. Les tests couvrent finale, clairance proche, remise des gaz, toucher, dégagement et taxi au stand. |
| IA ATC | L'activation transmet les ordres au contrôleur automatique. Un test complet mène une arrivée et un départ jusqu'à la fin d'une mission calme. Le laboratoire IA entraîne des poids de steering et affiche génération, score et activations ; l'entraînement x20 a progressé manuellement. |
| Aide et présentation | L'aide clavier interactive s'ouvre et met le jeu en pause. Les silhouettes B738, B788 et A388 sont distinctes en proportions, voilure et moteurs. Les étiquettes radar évitent désormais leur chevauchement et les panneaux, au prix d'en masquer quelques-unes lorsque l'écran est saturé ; les strips restent disponibles. |

## Correctifs de cet audit

1. Panneau des strips contraint en hauteur, défilement interne et conservation du scroll pendant les mises à jour.
2. Filtre des vols visibles partagé par les strips et Tab ; sélection initiale d'un vol dans le cadre.
3. Dézoom maximal capable d'afficher les entrants vers 80 NM, sans couper le cercle du secteur.
4. Bouton de sortie sectorielle réparé : sa boucle de clic empêchait toute affectation.
5. Contrôleur IA : sortie EXIT choisie selon l'axe de piste avant le départ.
6. Entrant depuis la limite : l'approche donnée avant l'entrée reprend au passage de la frontière ; l'IA attend l'entrée avant d'assigner.
7. Étiquettes radar compactes et sans collision ; sélection et urgences prioritaires.
8. Sélection archivée nettoyée ; la fiche signale un vol sélectionné hors du cadre.

## Comparaison et décisions produit

- [Endless ATC](https://startgrid.itch.io/endlessatc) privilégie une carte radar légère, des trajectoires et interceptions ILS lisibles, un trafic adaptatif, des points de compétence et la reprise automatique. SkylineATC ajoute déjà le roulage, les urgences et des décors plus riches, mais manque de sauvegarde/reprise et d'un réglage de difficulté fondé sur les performances du joueur.
- [ATC 2026 — guide](https://atc2026.com/guide) rend explicites les destinations aux bords de carte, le contenu des strips, les étapes de départ et les règles de score. SkylineATC possède des EXIT et des clairances séparées ; il devrait mieux exposer la prochaine action et les objectifs pour chaque vol. Le choix de ne montrer que les vols à l'écran dans les strips est ici volontaire, contrairement à une liste de tout le trafic sous responsabilité : il faudra une alerte discrète pour les entrants hors cadre.
- Le [dépôt du simulateur F1 cité](https://github.com/Eljazou/simulation-f1) documente une boucle complète (départ, course, podium), plusieurs modes, météo et effets gradués, qualité graphique adaptative, aide, laboratoire neuronal avec modèle fourni, curriculum d'entraînement et démo navigateur filmée. SkylineATC reprend déjà le principe de forces et de neuroévolution, ainsi qu'un laboratoire visible, mais n'a pas encore le même niveau de progression, de reprise, de réglage de qualité, de modèle entraîné fourni ni de parcours navigateur automatisé. Sa scène top-down et son HUD léger peuvent s'inspirer du rendu illustré par la capture fournie, sans copier les règles de course ni ajouter du multijoueur non demandé.

## Écarts restants, par priorité

### P1 — nécessaires avant de qualifier le jeu de « complet »

- **Fin de partie et sécurité** : les missions ne possèdent que `RUNNING` / `COMPLETED`. Une collision retire 500 points, mais n'empêche pas une victoire ; il manque une règle de défaite, d'abandon, ou un classement final explicite. Décider la règle produit avant de coder.
- **Onboarding** : le tutoriel en sept gestes couvre surtout l'approche et se termine par le debug ; il ne fait pas pratiquer l'affectation EXIT, le taxi, la traversée, le dégagement, le secours ou la fin de mission. Le parcours guidé doit être rejouable et finir par un objectif complet.
- **Repérage du trafic** : à ±35 NM au démarrage, les arrivées près de 80 NM sont hors champ et donc absentes des strips, conformément au filtre demandé. Ajouter un indicateur de trafic entrant hors cadre et une commande « cadrer tous les vols » visible à la souris.
- **Couverture de bout en bout** : automatiser les quatre aéroports réels, plusieurs graines et les scénarios d'urgence. Le parcours navigateur manuel n'a été fait que sur SKY1 dans un viewport étroit ; la performance en charge et les autres résolutions restent à mesurer.

### P2 — profondeur du jeu

- **Modes** : Libre et Aéroport sont actuellement deux variantes de partie sans fin très proches ; les distinguer par objectifs, densité, contraintes ou progression. Missions/Urgences ont une fin mais pas de campagne ni de difficulté adaptative.
- **Score** : au-delà de +250 par vol et −500 par collision, ajouter des critères annoncés au joueur : séparation, remise des gaz, retard, ponctualité, sortie incorrecte et éventuellement bonus sans erreur. Les règles doivent rester déterministes et testées.
- **IA** : l'IA ATC qui émet les clairances est aujourd'hui à règles ; la neuroévolution apprend seulement à doser quatre forces de pilotage d'approche. Pour une véritable IA qui « apprend à être ATC », il faut définir des observations/ordres autorisés, un environnement d'entraînement de missions complètes et une évaluation contre un contrôleur de référence.
- **Persistance** : « Reprendre » ne survit pas à un rechargement de page. Sauvegarder partie, réglages et cerveaux, avec validation de version des données.
- **Qualité et démonstration** : suivre les FPS lorsque la densité augmente, dégrader graduellement les effets coûteux, et ajouter un parcours navigateur automatisé de démonstration qui vérifie menu, départ, arrivée, urgence, IA et résultat.

### P3 — qualité visuelle et confort

- **Avions et véhicules** : les nouvelles vues de dessus vectorielles distinguent B738, B788 et A388, mais ce ne sont pas encore des modèles détaillés ou des livrées réalistes. Prévoir des assets dessinés sous licence vérifiée ou des sprites originaux multi-échelles ; améliorer de même les véhicules incendie, médicaux et militaires.
- **Densité de carte** : le masquage d'étiquettes évite les collisions, mais le joueur doit pouvoir retrouver vite les vols masqués via les strips, un suivi ou une recherche. Sur écran étroit, la barre supérieure et les deux panneaux consomment beaucoup de place ; un mode compact et des tests responsive restent souhaitables.
- **Audio** : la synthèse navigateur et les alertes générées fonctionnent, mais la phraséologie, la variété des voix et le mixage demandent un travail distinct. Ne pas embarquer de sons cockpit non licenciés.

## Vérification reproductible

Exécuter `node --test tests/*.test.mjs`. Ensuite : ouvrir le jeu sur `:5500`, lancer Libre, assigner une sortie EXIT et repoussage à un départ, dézoomer jusqu'aux entrants, créer plusieurs arrivées avec `N`, vérifier le scroll des strips et l'absence de recouvrement des étiquettes, rétrécir/recentrer, activer IA ATC puis observer les ordres ; dans le laboratoire IA, lancer une génération x20. Les tests couvrent en plus une mission IA entière.
