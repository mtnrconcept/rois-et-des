# Pipeline Blender — Royal Fleet

Blender 4.2 LTS. Ces outils produisent les modèles et leurs animations ; les règles
canoniques Échgammon restent dans `echgammon/`. Aucun moteur d'échecs classique ni
panneau Python de jeu n'est installé. Aucun script ne s'exécute automatiquement à
l'ouverture d'un fichier `.blend`.

Depuis la racine du dépôt, adapter les chemins et utiliser l'exécutable Blender :

```sh
blender --background --python tools/blender/build_board.py -- \
  --out-dir /sources --skip-render

blender --background --python tools/blender/export_board_web.py -- \
  --base-blend /sources/citadelle-des-marees.blend --asset-dir assets/fleet

blender --background --python tools/blender/build_fleet.py -- \
  --base-blend /sources/citadelle-des-marees.blend --outdir /sorties --skip-render

blender --background --python tools/blender/export_fleet_web.py -- \
  --base-blend /sorties/royal-fleet-jeu.blend --outdir assets/fleet/pieces \
  --preview-dir /sorties

blender --background --python tools/blender/bake_capture_demos.py -- \
  --base-blend /sorties/royal-fleet-jeu.blend --outdir /sorties --render-stills
```

Retirer `--skip-render` calcule la vue d'ensemble avec la caméra du plateau et
EEVEE. `--render-engine CYCLES` utilise le débruiteur OptiX et demande un GPU
NVIDIA compatible avec assez de mémoire. Les démonstrations et la planche
utilisent EEVEE. L'option
`--render-video` des démonstrations exporte deux vidéos H.264 1280×720, 24 i/s ;
`--demo canon` ou `--demo magie` limite le calcul. Le fichier source fourni via
`--base-blend` n'est jamais réécrit par ces outils.

`build_fleet.py` attend le plateau source sans figurines. Il crée 12 prototypes,
32 figurines articulées, 72 actions et un damier avec a1 noir. L'option
`--references-dir DIR` incorpore facultativement `blue-pieces.png` et
`red-pieces.png` fournis par l'utilisateur.

`export_fleet_web.py` évalue courbes et modificateurs, réunit chaque figurine en
un maillage avec pondération rigide par os, puis exporte 12 GLB comprimés Draco.
Chaque GLB conserve six clips : IDLE, MOVE, ATTACK, HIT, DEFEAT, VICTORY. L'origine
est au sol, Blender Z devient glTF Y et la face Blender −Y devient glTF +Z.
Le manifeste décrit tailles, dimensions, matériaux et clips. Le navigateur utilise
les décodeurs Draco locaux livrés dans `assets/fleet/vendor/draco/`.

Les démos sont deux fichiers séparés : visée, recul, boulet et fumée du canon ;
canne, orbe, traînée et anneaux de magie de la reine. Les clés et effets sont cuits
dans les fichiers et lisibles avec Espace, sans extension et sans moteur de règles.

## Provenance

Le plateau source et les figurines sont des interprétations 3D stylisées des
références fournies par l'utilisateur. Le plateau source utilise deux matériaux
de sa bibliothèque BlenderKit locale, avec textures intégrées :

- Scratched Gold : `9c9cca39-7015-4eb8-9b4f-4120babaa738`.
- Simple marble : `70e24f55-6737-4528-af06-4ffcace039be`, décliné en ivoire et noir.

Les matériaux des figurines sont procéduraux et créés dans `build_fleet.py` ;
leurs GLB n'embarquent aucune texture BlenderKit. `build_board.py` reconstruit la
géométrie du plateau depuis zéro ; les textures BlenderKit sont facultatives et
requièrent les fichiers locaux correspondants pour reproduire ce traitement de
surface. Les images de référence et le `.blend` original ne sont pas distribués
dans ce dépôt.
