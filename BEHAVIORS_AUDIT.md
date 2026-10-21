# Steering et parcours ATC — constat du 21 octobre 2026

Des démonstrations isolées sont accessibles dans le menu D : voir [le guide des démonstrations](DEMOS.md). Elles affichent les comportements réellement observés et conservent la partie normale pour le retour.

## Ce qui commande réellement le mouvement

`vehicle.js` est protégé. Les avions héritent de `Airplane`, les modèles de `ModelAircraft`, les chasseurs de `FighterJet`. La composition des forces passe par `SteeringComposer`, puis par une contrainte de virage, `applyForce()` et un unique `super.update()` dans `Airplane.simulateStep()`. La contrainte produit une force ; elle ne réécrit ni la position ni la vitesse.

Les positions de contact sont examinées sur tout le segment parcouru entre deux pas. Un voisinage TCAS est une zone de prévention ; une collision exige simultanément un contact horizontal des empreintes physiques et un écart vertical d'au plus 50 ft. Le chevauchement des étiquettes ou des symboles agrandis à l'écran n'est pas un contact physique.

## Behaviors effectivement utilisés

| Behavior | Usage et preuve dans le code |
| --- | --- |
| Seek | `super.seek()` pour les objectifs ; premier rapprochement du chasseur vers une position décalée du civil. |
| Arrival | `super.arrive()` au stand et aux points d'arrêt via `PathFollowing` ; ralentissement du roulage. Le profil vertical et les vitesses d'approche restent gérés par `TowerApproach`. |
| Path Following / projection scalaire | `PathFollowing.project()` et `forceFor()` pour taxiways, alignement, axe ILS, circuit d'attente. |
| Separation | Répulsion inverse carré, CPA prédictif et seuil vertical ; version latérale prioritaire lors d'une RA pour éviter de freiner face à un trafic frontal. |
| Obstacle Avoidance | Couloir projeté et choix de côté stable autour de la hitbox circulaire des orages ; anticipation adaptée au rayon de virage. |
| Wander | Entrants sans clairance et dérive des `StormCell`. Le wander entrant cesse lorsqu'un ordre de navigation le remplace. |
| Pursuit | Prédiction du déplacement du civil pendant le rapprochement militaire. |
| Offset pursuit / velocity matching | Le chasseur rejoint un emplacement à côté du civil puis adapte sa vitesse à celle de son leader. |
| Leader Following | File au taxi via `LeaderFollowing.forceFor()` ; suivi décalé du civil par le chasseur. |
| Braking | Force opposée à la vitesse lors d'une attente, d'un arrêt de trafic et d'un rejet de décollage. |
| Evasion / flee | Algorithme présent et testé dans `core/evasion.js`. Aucun scénario actif n'en fait un comportement principal : ne pas le présenter comme une feature jouable déjà exploitée. |

## Corrections et règles vérifiées

- TCAS : observations communes à tous les avions, conservation de la clairance verticale lors d'un changement de cap, alerte sur trajectoires verticales convergentes, force latérale prioritaire et vitesse minimale en vol. Une nouvelle clairance verticale est refusée pendant une RA ; le changement de niveau en cours est suspendu jusqu'à la fin de l'alerte.
- Collision : test balayé horizontal et vertical, destruction, explosion lisible au zoom, retrait après l'effet, libération de piste et réservations. Une paire ne coûte qu'une pénalité. En mission limitée, la collision entraîne l'échec ; en libre, le trafic continue.
- Virages : borne appliquée à la force totale, y compris approche, attente, météo et TCAS. Les waypoints sont anticipés pour éviter les orbites autour d'un point manqué. Les gros porteurs ont un taux de virage plus faible.
- Départ : piste assignée, repoussage, taxi avec files et traversées explicites, arrêt au hold short, alignement proche, arrêt confirmé, sortie EXIT requise, autorisation de décollage. Rejet : freinage, maintien de réservation, dégagement puis retour ou nouvelle tentative.
- Arrivée : entrée libre, vecteurs/directs/attente sur ordre, approche via base et interception, clairance d'atterrissage seulement proche de la piste. Une finale établie exige une remise des gaz avant un nouveau cap/direct. Une absence de clairance ou une approche instable déclenche une remise des gaz.
- Interception : ordre du contrôleur, arrivée depuis le secteur, seek + pursuit, suivi latéral du civil, aucun TCAS entre partenaires d'interception ; à la finale, rupture, montée et sortie EXIT. La proximité en formation n'est pas une immunité contre un véritable contact.
- UI : les clairances souris sont réunies dans un volet de la fiche de vol. D ouvre uniquement un inspecteur : parcours, forces individuelles et résultante, vitesse, projection, détection TCAS/CPA et hitboxes météo.

## Limites à conserver explicites

Il s'agit d'un jeu ATC avec temps et vitesses compressés, pas d'une simulation certifiée des performances ou des procédures publiées. Les taux de virage sont bornés par pas du jeu et varient par modèle ; ils ne constituent pas une calibration physique exhaustive en degrés par seconde réelle.

Le TCAS réel délivre des résolutions verticales. Le jeu conserve une séparation latérale de steering et suspend le changement de niveau lors d'une RA : c'est une simplification pédagogique demandée par l'architecture du projet. Références : [FAA — TCAS et approches](https://www.faa.gov/Air_traffic/publications/atpubs/aim_html/chap5_section_4.html), [FAA — instructions ATC pendant une RA](https://www.faa.gov/Air_traffic/publications/atpubs/atc_html/chap2_section_1.html), [FAA — virages et inclinaison](https://www.faa.gov/sites/faa.gov/files/regulations_policies/handbooks_manuals/aviation/FAA-H-8083-15B.pdf).

Validation de cette révision : `node --test tests/*.test.mjs`, 181 tests réussis sur 181. La suite couvre les parcours des quatre plateformes, les directions réciproques, les limites de force/vitesse, les alertes, les contacts, l'escorte et l'intégrité de `vehicle.js`. L'accès souris aux clairances, le panneau D et ses couches ont également été contrôlés dans le navigateur sur `http://127.0.0.1:5500/index.html`, avec un écran étroit. Une vérification navigateur complète de chaque scénario, de la charge maximale et de tous les formats d'écran reste distincte de ces tests.

## Essais manuels utiles

1. Deux trafics convergents à la même altitude : voir TA/RA sur les strips, activer l'audio ATC et D pour examiner la détection et la force latérale. Un évitement réussi ne provoque pas d'explosion.
2. Donner une montée puis un nouveau cap : la cible d'altitude doit rester inchangée. Une RA suspend la montée ; une nouvelle clairance verticale doit être refusée pendant l'alerte.
3. Tester une approche et une attente avec B738 puis A388 : virages continus, vitesse maintenue, passage des points sans demi-tour instantané.
4. Déclencher une interception d'un vol 7600 : rapprochement, position latérale stable, aucune alerte TCAS causée par le partenaire ; en finale, le chasseur monte et rejoint une sortie.
5. D : masquer séparément routes, forces, projection, TCAS et météo. La fermeture de D ne doit pas supprimer les ordres de vol ni leurs commandes souris.
