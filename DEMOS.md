# Présenter les steering behaviors

Dans une partie, appuyer sur **D**, puis utiliser **Démonstrations pour l’évaluation**.

1. Choisir une situation dans le menu déroulant.
2. Cliquer sur **Charger / Rejouer**. Une session isolée à graine fixe est préparée en pause et la caméra est cadrée sur la scène.
3. Cliquer sur **Démarrer**. La vitesse est réglable de 0,25× à 4× ; **Pause** permet d'examiner les vecteurs.
4. Le résultat observé fige automatiquement la scène. Les traces colorées conservent les trajectoires réellement parcourues. Démarrer permet ensuite de poursuivre ; Charger / Rejouer recommence à l'identique.
5. **Retour à la partie** restaure la session précédente, son trafic, son score, sa sélection et sa caméra, sans rattrapage du temps passé en démonstration.

Les coches sous la démonstration affichent séparément les parcours, les forces et la vitesse, la projection scalaire, le TCAS/CPA et les hitboxes météo. Les messages et la liste des behaviors proviennent de la simulation, pas d'une animation enregistrée.

| Démo | Ce qu'il faut montrer |
| --- | --- |
| TCAS — rencontre frontale | Deux avions au même niveau, RA, force latérale et évitement sans collision. Les trajectoires montrent l'écart créé. |
| TCAS — croisement de paliers | Une montée traverse le niveau prévu du voisin. Le TCAS anticipe le conflit et suspend la montée pendant la RA. |
| Collision — conflit trop tardif | Contact physique volontairement irrécupérable malgré le TCAS actif. La scène se fige sur l'explosion ; reprendre pour voir la disparition des appareils. |
| Obstacle Avoidance — orage | Avion orienté vers l'orage, détection de sa hitbox circulaire puis contournement. L'orage est immobile pour isoler l'explication de ce behavior. |
| Seek | Force vers le point jaune, virage progressif et intégration physique. |
| Wander | Entrant sans clairance, cercle projeté et force de dérive organique. |
| Path Following + Leader Following — taxi | Projection sur les segments du taxiway, virages et file au hold short avec espacement. |
| Arrival — stand | Arrival est réellement appelé en fin de Path Following ; vitesse décroissante, freinage et arrêt au stand. |
| Path Following — holding | Entrée au point, suivi du circuit et passage des segments avec un rayon de virage borné. |
| Interception | Seek et Pursuit, suivi latéral du civil, exemption TCAS des partenaires, rupture en finale et montée vers EXIT. La démo initialise le chasseur à proximité pour la présentation ; la partie normale conserve l'entrée militaire depuis le bord du secteur. L'approche et sa clairance sont automatisées dans cette démonstration. |

Les démos utilisent les classes et systèmes de la partie normale. Seules les conditions initiales et les clairances de présentation sont préparées. Le trafic aléatoire et le contrôleur IA sont désactivés au chargement pour garder une présentation lisible. Les ordres manuels restent disponibles pour expérimenter ; **Rejouer** retrouve la situation de référence.

Le TCAS latéral et les vitesses compressées restent les simplifications de jeu décrites dans [BEHAVIORS_AUDIT.md](BEHAVIORS_AUDIT.md).
