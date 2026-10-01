# Échgammon — Classique Royal

Jeu web statique adapté de l'affiche fournie par l'utilisateur : échiquier 8×8 avec 32 pièces, pistes latérales totalisant 24 pointes, 15 pions de course par couleur et deux dés partagés. Gagnez par mat ou en sortant les 15 pions. Mode deux joueurs sur le même appareil, six bots de personnalités et de niveaux différents, problèmes tactiques et académie guidée.

L'interface utilise un coffret en perspective CSS, des pièces SVG avec relief, des pions empilés et des dés CSS 3D. Aucun service distant, compte, clé ou dépendance n'est requis pendant la partie. Sur téléphone, les boutons Piste gauche / Échiquier / Piste droite et le défilement horizontal donnent accès à tout le plateau.

## Le Salon — édition 4.0

`index.html` est le lobby : Accueil, Jouer, Problèmes, Académie, Progression. `play.html` conserve le plateau royal complet. Une partie libre sauvegardée peut être reprise depuis l’accueil.

- **Six bots** : Léon, Iris, Nora, Basile, Octave, Astra. Profils réels distincts : tolérance d’erreur, préférence course/échecs, recherche bornée et estimation des menaces. Niveaux indicatifs ; aucune revendication d’Elo calibré ou de force de grand maître. Les trois réglages historiques restent compatibles.
- **18 problèmes** éditoriaux : fondamentaux, tactique, dés, course et sorties. Le moteur valide chaque solution ; les branches/paiements équivalents sont acceptés. Le défi du jour tourne dans ce catalogue, ce n’est pas une nouvelle génération quotidienne.
- **8 leçons** : trois bulles ancrées aux vrais éléments du plateau, navigation précédent/suivant et exercice pratique. Revoir le guide bloque les mouvements jusqu’à sa fermeture. Trois indices graduels, correction sans déplacer la position sur erreur et solution démontrée.
- **Étoiles** : 3 sans aide ni erreur, 2 après erreur, 1 avec indices, 0 après consultation de la solution. Le meilleur résultat est conservé. Une solution seulement regardée ne valide pas une leçon.
- **Mode accompagné** : explication contextuelle des paiements et des coups proposés ; le mode Défi retire le panneau d’accompagnement (le bouton conseil reste disponible). Les suggestions sont heuristiques, pas une analyse certifiée.
- **Progression locale** : résultats réels, leçons, étoiles, activité et 50 dernières parties terminées. Aucun compte, abonnement, classement fictif, collecte distante ou synchronisation inter-appareils. Stockage facultatif avec repli pour la page courante. Effacer la progression demande confirmation et conserve la partie libre.

Les exercices et les leçons ne remplacent jamais la sauvegarde d’une partie normale. Les URL inconnues sont gérées sans lancer un faux exercice. Le plateau et ses règles n’ont pas été remplacés par un second moteur.

## Analyse approfondie et sons de bois · 4.1

Astra, Octave et le réglage Maître utilisent maintenant un Worker pour rechercher des suites de coups sur les dés disponibles et des réponses adverses. Le bouton « Un conseil » utilise ce même moteur, indépendamment du niveau du bot. Choix Rapide (1,5 s), Approfondi (5 s), Maximum (12 s) ; Octave est plafonné à 1,8 s. Une annulation termine réellement le Worker. Un résultat périmé n'est pas joué. Le repli rapide est annoncé si les Workers sont indisponibles.

La recherche est **sélective** : elle compare les meilleures suites retenues pour le tour actuel et les réponses du tour adverse, sur 21 lancers distincts pondérés sur 36 possibilités. Elle ne prouve pas le meilleur coup absolu, ne revendique ni force Stockfish ni Elo. Le panneau affiche le meilleur coup trouvé, les paiements, captures et risques constatés, la suite légale, trois alternatives et une réponse adverse conditionnelle. Approfondir élargit la recherche sous un budget de temps/nœuds. Les exercices gardent leurs indices éditoriaux.

Les bruitages sont une synthèse locale originale : contact et glissement sur bois, capture, roque, pions de course, sortie et dés. Pas d'échantillon tiers. Premier geste requis pour activer l'audio, volume initial 35 %, silence et réglage persistants. Aucun bruit de pose sur sélection ou coup refusé. Le jeu reste utilisable sans audio.

Voir `docs/engine-audio.md` pour les méthodes, mesures et limites. Tester avec `python tests/analysis.browser.py` en complément des suites historiques.

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
.venv/bin/python tests/lobby.browser.py
.venv/bin/python tests/analysis.browser.py
```

Le test lance son propre serveur local. En environnement interdisant toute navigation du navigateur, `OFFLINE_BROWSER=1` exécute les mêmes fichiers HTML/CSS/JS en mémoire avec un adaptateur de stockage : cela vérifie les interactions et le rendu, pas le réseau ni la persistance native. La CI utilise le mode HTTP et le stockage natif.

## Règles importantes

Le coût d'échecs est exact : distance parcourue, cavalier 3, roi 1, roque 2. Un dé ou deux valeurs additionnées paient un déplacement d'échecs ; les pions de course utilisent une seule valeur. Double : quatre valeurs. Le joueur peut partager ses dés entre les deux espaces.

Les pions isolés sont frappés ; deux adversaires ou plus ferment une pointe. La barre bloque uniquement les autres pions de course. Les pièces d'échecs ne quittent jamais l'échiquier et ne forment pas de bastions. Sortie exacte, dans le dernier quadrant uniquement, sans pion sur la barre.

### Précisions nécessaires à l'adaptation

Donner échec termine le tour. Le défenseur répond aux échecs ; sans défense payable mais avec une défense géométrique, une parade royale consomme tous les dés restants. Le mat est donc géométrique, jamais causé uniquement par un mauvais lancer. Les dés temporairement bloqués sont conservés ; le passage est automatique quand aucun paiement simple ou combiné ne permet de jouer.

Promotion au choix ; conditions classiques du roque ; prise en passant au prochain mouvement d'échecs et au plus tard à la fin du tour adverse. Le pat ou le manque de matériel d'échecs ne stoppe pas la course. Trois répétitions du plateau hybride complet, ou 400 tours individuels, donnent une nulle. L'obligation de maximiser les dés du backgammon pur n'est pas appliquée aux dés partagés. Les variantes optionnelles de l'affiche ne sont pas activées.

Voir le livret intégré, `docs/echgammon-implementation.md` et `docs/lobby-academy.md`. Les modules et tests de l'ancien prototype sont conservés dans `src/` et `tests/` pour historique et retour arrière ; `index.html` et `play.html` utilisent exclusivement `echgammon/`.

## Déploiement

Le service Render existant sert `feat/playable-rois-et-des` après `npm test && npm run check`. La PR reste ouverte ; aucune fusion vers main n'est requise pour tester ce déploiement de branche. Revenir au commit antérieur restaure le prototype. Ne pas supprimer des modules historiques avant une migration explicitement approuvée.
