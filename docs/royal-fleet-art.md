# La Citadelle des Marées : modèles et animations

Cette édition interprète les trois références visuelles fournies en miniatures
3D stylisées. Elle conserve la composition nautique, le royaume rouge, la flotte
bleue, les dorures, les couronnes, les tricornes, les chevaux et la tour-canon.
Ce sont des géométries éditables créées dans Blender 4.2, pas des images plaquées
sur les pièces. Le niveau de détail et les matériaux web sont adaptés au temps
réel ; ils ne reproduisent pas le photoréalisme des illustrations de référence.

## Bibliothèque de pièces

| Type | Royaume rouge | Flotte bleue | Capture dans le jeu |
|---|---|---|---|
| Roi | Couronne, cape, épée et sceptre | Amiral à tricorne, barbe, épée | Geste d'arme, arc lumineux et impact |
| Dame | Couronne et sceptre à rubis | Tricorne, robe et sceptre marin | Sphère d'énergie rouge / énergie des marées |
| Tour | Tour crénelée et emblème du lion | Canon articulé sur piédestal | Flamme de siège / boulet, recul, fumée |
| Fou | Mitre, cape et bâton | Navigateur et astrolabe | Projection astrale et anneau d'impact |
| Cavalier | Cheval caparaçonné rouge | Cheval marin bleu et or | Saut de déplacement et charge |
| Pion | Garde avec casque et bouclier | Marin à tricorne et lame | Geste court et éclats à l'impact |

Chaque variante contient un squelette et un maillage avec poids rigides, plus
les actions Blender `IDLE`, `MOVE`, `ATTACK`, `HIT`, `DEFEAT` et `VICTORY`.
Les pièces partagent une bibliothèque de 12 fichiers GLB et sont instanciées
pour les 32 figurines en jeu. Les 30 pions de course utilisent `checker.glb`,
un modèle distinct. Les courbes décoratives sont converties en géométrie et
les pièces d'un même squelette fusionnées pour limiter les appels de rendu.

## Synchronisation

Les animations sont lues par `AnimationMixer` à partir des clips exportés.
Le déplacement sur les cases, le trajet du projectile, les particules et la
disparition sont pilotés dans le navigateur afin de s'adapter à toute cible
légale. Une attaque comporte préparation, projectile ou geste, impact, défaite,
puis occupation de la case. Elle ne crée jamais un second coup ni une seconde
capture dans le moteur.

Le canon utilise le point d'émission exporté au bout du tube et la dame celui
de son sceptre. Le cavalier saute visuellement ; le roque déplace aussi la tour,
la prise en passant retire le bon pion, et la promotion change le modèle choisi.
Les pions frappés rejoignent la barre et les sorties remplissent la réserve.
La préférence de mouvement réduit raccourcit les transitions. Les effets sont
visuels ; les sons de contact synthétisés du jeu existant restent disponibles.

## Plateau et provenance

`board.glb` provient du plateau Blender : château, remparts, bateaux, drapeaux,
îles, eau, marqueterie et 64 cases. Environ 4 800 objets sont regroupés en
25 maillages et compressés avec Draco. Les jetons décoratifs fixes et la rose
surélevée centrale sont retirés de la version jouable. a1 est sombre.

Le fichier Blender local utilise deux matériaux de la bibliothèque BlenderKit
déjà installée : Scratched Gold (`9c9cca39-7015-4eb8-9b4f-4120babaa738`) et
Simple marble (`70e24f55-6737-4528-af06-4ffcace039be`). Les GLB web utilisent
des matériaux PBR simplifiés et des couleurs de sommets ; ils n'embarquent pas
ces textures BlenderKit. Les modèles géométriques ont été créés pour ce projet.
Three.js 0.180.0 et son décodeur Draco sont servis localement avec leurs licences
dans `assets/fleet/vendor/` ; aucune requête CDN n'est nécessaire pendant le jeu.

## Fichiers de travail

Les sources de génération et d'export sont dans `tools/blender/`. Le `.blend`
éditable et les rendus sont livrés séparément dans le dossier `outputs` de la
session de création. Ils ne sont pas téléchargés par les joueurs.
`board-manifest.json` et les tests GLB documentent le contenu effectivement
exporté. Les modèles peuvent être remplacés par une sculpture plus détaillée
en conservant les coordonnées, les points d'émission et le nom des clips.
