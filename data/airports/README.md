# Sources géographiques des aéroports

Les quatre fichiers GeoJSON sont désormais de vrais extraits WGS84 (longitude, latitude) téléchargés via l'API officielle OpenStreetMap le 20 octobre 2026. Chaque objet conserve son identifiant `way/...`. Les anciens fichiers à coordonnées écran ont été remplacés.

`osmGeometry.js` embarque le même instantané pour fonctionner depuis `index.html`, même en `file://`, sans serveur de tuiles ni requête réseau pendant le jeu. `core/airportGeometry.js` projette les coordonnées avec une échelle uniforme et **le nord vrai toujours en haut**. Le zoom et le suivi d'avion ne tournent jamais la carte.

## Reproduction

`node tools/import-airports.mjs` récupère les extraits OSM ; `node tools/compact-airports.mjs` réduit le contexte et régénère le fichier embarqué. Le téléchargement nécessite Internet et curl ; jouer ne le nécessite pas. Les données WGS84 déjà présentes sont réutilisées par l'importeur.

## Références consultées et limites

- GMMN : [ONDA AD2GMMN](https://siamaroc.onda.ma/eaip/AD/AD2GMMN.pdf), [rapport officiel DGAC publié par le BEA](https://bea.aero/fileadmin/documents/docspa/2011/f-xc110808/pdf/f-xc110808_06.pdf). Deux pistes 17L/35R et 17R/35L. Les PDF ONDA ont renvoyé HTTP 403 lors de la consultation directe ; les résultats indexés et le rapport permettent de contrôler la configuration générale, pas chaque détail actuel.
- GMMX : [ONDA AD2GMMX](https://siamaroc.onda.ma/eaip/AD/AD2GMMX.pdf). Piste 10/28. Accès direct au PDF également refusé ; géométrie détaillée issue d'OSM.
- LFMN : [eAIP France du 1er octobre 2026](https://www.sia.aviation-civile.gouv.fr/media/dvd/eAIP_01_OCT_2026/FRANCE/AIRAC-2026-10-01/html/eAIP/FR-AD-2.LFMN-fr-FR.html). Deux pistes 04L/22R (2628 m) et 04R/22L (2963 m), marquages de seuil, axe, points de visée et zone de toucher ; taxiways à ligne jaune.
- KJFK : recherche dans les [Airport Diagrams FAA](https://www.faa.gov/air_traffic/flight_info/aeronav/digital_products/dtpp/). Quatre pistes 04L/22R, 04R/22L, 13L/31R et 13R/31L. Le PDF FAA direct n'a pas pu être chargé ; les formes sont issues d'OSM et non d'une numérisation de cette carte.

Le rendu utilise les axes de pistes et taxiways, les polygones d'aprons, terminaux et bâtiments, les routes et le littoral réellement présents dans l'extrait. Les marquages, la végétation et l'aspect des toitures sont procéduraux. Les accès de stands absents d'OSM sont raccordés au taxiway voisin pour le jeu ; ces petits raccords sont marqués `simulated: true`. Les points d'attente affichés sont déduits des intersections et ne constituent pas une transcription vérifiée de chaque point publié. Les largeurs très fines sont agrandies pour la lisibilité.

Les multipolygones OSM complexes et les travaux/fermetures temporaires ne sont pas interprétés. La reproduction des formes est géographique ; le jeu ne reproduit pas toutes les procédures réelles.

## Licence des données

© OpenStreetMap contributors. Données sous [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). [Attribution et conditions](https://www.openstreetmap.org/copyright). Les fichiers GeoJSON et leur version JS dérivée sont distribués sous cette licence. Le lien d'attribution est visible dans la barre de carte.
