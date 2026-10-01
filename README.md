# Échgammon — Classique Royal

Jeu web statique adapté de l'affiche fournie par l'utilisateur : échiquier 8×8 avec 32 pièces, pistes latérales totalisant 24 pointes, 15 pions de course par couleur et deux dés partagés. Gagnez par mat ou en sortant les 15 pions. Mode deux joueurs sur le même appareil et adversaire local à trois niveaux.

L'interface utilise un coffret en perspective CSS, des pièces SVG avec relief, des pions empilés et des dés CSS 3D. Aucun service distant, compte, clé ou dépendance n'est requis pendant la partie. Sur téléphone, les boutons Piste gauche / Échiquier / Piste droite et le défilement horizontal donnent accès à tout le plateau.

## Jouer / développer

```sh
python -m http.server 8000
# Ouvrir http://localhost:8000
npm test
npm run check
npm run build
```

Node 22 est utilisé par les vérifications. L'application est statique : build vérifie la syntaxe ; il n'y a pas de transpilation ou de typecheck TypeScript. Aucun linter externe n'était configuré dans le dépôt.

## Tests navigateur

```sh
python -m venv .venv
.venv/bin/pip install playwright==1.57.0
.venv/bin/python -m playwright install --with-deps chromium
.venv/bin/python tests/echgammon.browser.py
```

Le test lance son propre serveur local. En environnement interdisant toute navigation du navigateur, `OFFLINE_BROWSER=1` exécute les mêmes fichiers HTML/CSS/JS en mémoire avec un adaptateur de stockage : cela vérifie les interactions et le rendu, pas le réseau ni la persistance native. La CI utilise le mode HTTP et le stockage natif.

## Règles importantes

Le coût d'échecs est exact : distance parcourue, cavalier 3, roi 1, roque 2. Un dé ou deux valeurs additionnées paient un déplacement d'échecs ; les pions de course utilisent une seule valeur. Double : quatre valeurs. Le joueur peut partager ses dés entre les deux espaces.

Les pions isolés sont frappés ; deux adversaires ou plus ferment une pointe. La barre bloque uniquement les autres pions de course. Les pièces d'échecs ne quittent jamais l'échiquier et ne forment pas de bastions. Sortie exacte, dans le dernier quadrant uniquement, sans pion sur la barre.

### Précisions nécessaires à l'adaptation

Donner échec termine le tour. Le défenseur répond aux échecs ; sans défense payable mais avec une défense géométrique, une parade royale consomme tous les dés restants. Le mat est donc géométrique, jamais causé uniquement par un mauvais lancer. Les dés temporairement bloqués sont conservés ; le passage est automatique quand aucun paiement simple ou combiné ne permet de jouer.

Promotion au choix ; conditions classiques du roque ; prise en passant au prochain mouvement d'échecs et au plus tard à la fin du tour adverse. Le pat ou le manque de matériel d'échecs ne stoppe pas la course. Trois répétitions du plateau hybride complet, ou 400 tours individuels, donnent une nulle. L'obligation de maximiser les dés du backgammon pur n'est pas appliquée aux dés partagés. Les variantes optionnelles de l'affiche ne sont pas activées.

Voir le livret intégré et `docs/echgammon-implementation.md`. Les modules et tests de l'ancien prototype sont conservés dans `src/` et `tests/` pour historique et retour arrière ; `index.html` utilise exclusivement `echgammon/`.

## Déploiement

Le service Render existant sert `feat/playable-rois-et-des` après `npm test && npm run check`. La PR reste ouverte ; aucune fusion vers main n'est requise pour tester ce déploiement de branche. Revenir au commit antérieur restaure le prototype. Ne pas supprimer des modules historiques avant une migration explicitement approuvée.
