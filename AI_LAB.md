# Laboratoire du contrôleur ATC

Le réseau donne les ordres à la place du joueur. Les avions n'ont plus de
cerveau neuronal : ils exécutent ces ordres avec les steering behaviors et
la locomotion héritée de `Vehicle`. `vehicle.js` n'est pas modifié.

## Tester la livraison

1. Ouvrir **Laboratoire IA**, puis **Réseau et réglages** sur petit écran.
2. Commencer sur SKY1, trafic Normal, horizon 200 secondes, population 6.
3. Choisir 1 à 4 couches cachées et 1 à 64 neurones par couche si souhaité.
   Appliquer les réglages, puis lancer **Entraîner**, éventuellement à 20×.
4. Observer une session : tous les vols affichés sont sous les ordres d'un seul
   contrôleur. Ses concurrents et la référence possèdent des sessions séparées.
5. Après une génération, mettre en pause et choisir **Tester sur 3 scénarios
   inédits**. Attendre la fin ; le résultat peut être **À améliorer**.
6. **Installer le contrôleur**, fermer le laboratoire, reprendre la simulation.
   Le bouton **IA ATC ON · RÉSEAU** confirme le contrôle neuronal. Le journal
   montre les clairances. Désactiver IA ATC rend immédiatement la main au joueur.
7. Exporter/importer un contrôleur JSON. **Rétablir le contrôleur à règles**
   retire le réseau installé et sa sauvegarde locale.

La partie est suspendue pendant l'ouverture du laboratoire. Son état de pause
antérieur est restauré à la fermeture. Un réseau installé reste disponible
après rechargement et changement de partie, mais une nouvelle partie n'active
pas automatiquement le contrôle ATC. Aucun avion n'a besoin d'être sélectionné.

## Architecture et apprentissage

Le même réseau classe toutes les actions candidates, ce qui permet de gérer un
nombre variable de vols. Il possède 26 entrées (13 indicateurs de type d'action
et 13 perceptions normalisées), des couches cachées configurables, et une sortie
de priorité. Cette sortie n'est pas une probabilité de sécurité.

Les choix couvrent approche/piste, atterrissage, sortie départ, repoussage, taxi,
traversée, alignement, décollage, altitude, attente, remise de gaz, dégagement et
temporisation. Le contrôleur anticipe les rapprochements en altitude et réserve
les capacités de piste/parking. Les ordres passent par `TowerSession` ou
`AirNavigation`, comme ceux du joueur. Les préconditions et masques de sécurité
restent programmés ; la stratégie de classement évolue.

La moitié de la population part d'une priorité explicite et de ses mutations,
l'autre est aléatoire. Ce démarrage assisté rend la démonstration immédiatement
observable ; ce n'est pas un apprentissage entièrement à partir de zéro.
Tournoi, croisement, mutations et élitisme produisent les générations suivantes.

## Scores, équité et réussite

Tous les contrôleurs reçoivent le même trafic, le même horizon et la même météo
physique reproductible. La graine d'entraînement reste fixe entre générations.
Les collisions, pertes de séparation (moins de 3 NM et de 1000 ft), RA TCAS et
incursions placent toute session dangereuse sous toute session sûre. TCAS n'est
jamais désactivé. Ensuite comptent le trafic traité, l'attente, les remises de
gaz, les ordres refusés et l'exposition météo.

Une arrivée est traitée au stand. Un départ est traité après sa montée initiale,
pas après la sortie du secteur. Le débit horaire affiché est extrapolé à partir
du petit épisode ; il n'est pas une estimation certifiée de capacité réelle.

**Validation** : trois graines différentes, jamais utilisées pour l'évolution ;
aucun incident, au moins 80 % du trafic traité et un score au moins égal à la
référence à règles dans chacun des trois scénarios. Le réseau testé est figé
et n'évolue pas pendant ces tests. Un réseau importé doit être réévalué.
Le réseau peut être installé sans validation réussie pour l'expérimentation,
mais cette installation ne le déclare pas validé.

Les scénarios sont des exercices de jeu, pas une certification aéronautique.
Les essais actuels portent sur les vols B738, avec choix de densité et météo.
L'optimisation n'est pas garantie pour tous les aéroports, densités et réseaux.

## Compatibilité et performances

Les anciens cerveaux pilotes sont retirés et explicitement refusés à l'import.
Seul le format `SkylineATC-Controller`, version 1 et schéma d'actions connu, est
accepté. Le réseau installé est copié et indépendant des mutations du laboratoire.

Le 20× est un objectif de calcul, limité par un budget par image pour garder
l'interface réactive. Le débit réel dépend du matériel et de la population.
La barre de temps du jeu reste indépendante (pause, 0,25× à 8×).

Tests : `node --test tests/*.test.mjs` sans dépendances ni compilation.
