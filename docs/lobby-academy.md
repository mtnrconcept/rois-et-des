# Échgammon — Lobby & Académie, 1 octobre 2026

## Brief et périmètre
L'utilisateur demande une interface complète de lobby de qualité comparable aux grands sites d'échecs, des problèmes à résoudre, des bots de niveaux différents et un apprentissage avec bulles d'explications et d'indices. Réalisation directement dans la branche de jeu dédiée, sans merge. Garder le design royal bois/ivoire/or, sans copier les marques ni inventer un Elo certifié. Les références ergonomiques publiques sont les aides officielles Chess.com « Play bots », « Puzzles » et « Lessons » consultées le 1 octobre 2026. Pas de revendication de parité avec tout Chess.com.

## Audit et contraintes
Base distante vérifiée : 34bceb3a378a8476935faeda16b03093d9cd35e1, PR 1 ouverte. GitHub, Supabase, Vercel et Render accessibles. L'application n'utilise ni base, paiement, secrets ni authentification ; ne toucher à aucun autre projet. Clone local refusé par DNS ; utiliser le ZIP de la livraison précédente dont les 15 blobs ont été comparés exactement à l'arbre GitHub actuel. Snapshot clairsemé Git, worktree /mnt/data/echgammon-lobby, branche feat/playable-rois-et-des. Publication par Git Data API en conservant les fichiers historiques absents localement. Baseline : 30 tests locaux réussis ; 11 tests historiques supplémentaires restent exécutés sur Render. AGENTS.md et documentation lus.

## Spécification
- index.html devient l'accueil ; play.html conserve le plateau et les anciens IDs de commandes. Lien de retour toujours visible, URL directe reproductible.
- Navigation Accueil / Jouer / Problèmes / Académie / Progression, clavier et mobile. Pas de fausses personnes en ligne ni de faux classements.
- Six bots avec identité et six réglages distincts (erreur aléatoire, style course/échecs, recherche bornée). Difficultés indicatives, pas d'Elo numérique. Mode accompagné ou défi.
- 18 exercices éditoriaux prédéfinis, positions et solutions vérifiées par le moteur existant ; plusieurs thèmes, filtres, défi du jour sélectionné dans le catalogue, séquences d'une ou deux actions, nouvel essai, 3 indices graduels, solution démontrée. Un mauvais coup ne modifie pas la position ; un coup correct est appliqué par play().
- 8 leçons guidées : explication progressive, bulles ancrées aux vrais contrôles/cases, exercice manipulable, indices et explication après réussite. Navigation précédent/suivant, quitter sans perte d'une partie normale.
- Progression locale : exercices et cours terminés, étoiles liées aux indices/erreurs, activité et parties terminées. Sauvegarde versionnée et bornée, repli en mémoire si stockage indisponible, remise à zéro avec confirmation. Aucun compteur inventé.
- Les exercices et leçons ne doivent jamais écraser la sauvegarde d'une partie libre.
- Modes découverte sans IA pour les exercices ; aucun timer IA parasite après sortie/reset. Aide en partie libre explicite et déterministe, pas une prétendue analyse grand maître.

## Plan d'implémentation et interfaces
1. tests/lobby.test.mjs : tests RED de catalogue, validation de toutes les solutions et invariants, variantes de paiement, erreurs/rejeu/solution, stockage corrompu/dédoublonnage.
   Créer echgammon/catalog.mjs (BOTS, EXERCISES, LESSONS, exerciseState, dailyExercise), training.mjs (startTraining, attemptTraining, revealHint, solutionAction), progress.mjs (createProgress, readProgress, writeProgress, recordExercise, recordGame, summary).
2. echgammon/ai.mjs : étendre choose sans modifier les trois niveaux historiques ; paramètres validés, configs de bots exportées via catalog. Tests de légalité et victoires immédiates.
3. echgammon/visuals.mjs : extraire pieceSVG/cube existants sans changer le rendu ; réutiliser dans lobby et jeu.
4. index.html, lobby.mjs, lobby.css : accueil royal, navigation, fiches bots, filtres, leçons, vraie progression. Ajouter play.html et intégration minimale view.mjs + academy.css + coach.mjs pour les explications ancrées, sessions d'entraînement et paramètres de bots.
5. tests/lobby.browser.py : parcours bureau et tactile, erreur/indice/solution/succès, navigation retour, distinction entre entraînement et partie, dialogues et stockage. Ajuster ancien test pour play.html, compléter CI et scripts check/build. Vérifier données et tous assets avant déploiement.

## Risques / retour arrière
Risques : URLs malformées, stockage refusé/périmé, objectifs d'exercices trop stricts, réutilisation de valeurs de dés déjà consommées, clavier et bulles sur petit écran, timer IA et écran en arrière-plan. Tous à couvrir. Ne pas modifier chess.mjs/race.mjs/game.mjs sans régression avérée. Revenir au commit 34bceb3 sur la branche dédiée (ou revert du commit de lobby), jamais forcer main. Aucun changement de facturation pour débloquer GitHub Actions.

## Registre d'exécution
- Prévol : moteur game/actions/play partagé entre catalogue, entraînement et vue ; pas de nouveau moteur parallèle.
- Décision : stockage local uniquement ; un compte/multijoueur réseau n'est pas demandé. Coût : pas de synchronisation inter-appareils.
- Décision : niveaux de bots indicatifs et styles distincts, pas de chiffres Elo non mesurés.
- Décision : les exercices acceptent les paiements équivalents et les promotions alternatives quand l'objectif le permet.

## Vérification de réalisation
- Catalogue, entraînement et stockage : tests RED observés avant implémentation ; toutes les branches acceptées des 18 solutions contrôlées avec actions/play/isState.
- Corrections RED → GREEN : refus du getter localStorage, absence de crédit pour solution regardée, rejet des résultats dupliqués, identifiants de bulles uniques, guide rouvert bloquant les coups et fermeture d’une explication après changement de position.
- 51 tests locaux réussis (30 précédents et 21 nouveaux). Chaque bot termine aussi une partie complète légale ; la limite documentée peut conclure en nulle. Les 11 tests historiques du dépôt complet ne sont pas présents dans le snapshot local et seront contrôlés dans le build distant.
- Test historique : 14 contrôles bureau/mobile réussis. Nouveau test : les 18 problèmes résolus au travers de l’interface, 6 profils sélectionnables, 2 parcours guidés, indices/révélation/rejeu, conservation de partie, reset de progression, URL inconnue, clavier et formats 1440/820/390 px. Zéro erreur JavaScript observée.
- Le navigateur de cet environnement refuse localhost (ERR_BLOCKED_BY_ADMINISTRATOR). Les deux suites ont été exécutées sur les vrais assets via OFFLINE_BROWSER=1 avec localStorage en mémoire. Ce résultat ne certifie ni le réseau ni la persistance native : la CI conserve les parcours HTTP pour une exécution autorisée.
- Aucun ajout de dépendance de production, migration, secret, paiement ni service cloud. Contrôle syntaxique des 11 modules et build statique réussis avant publication.
- Revue par l’auteur, sans relecteur indépendant. Aucun zéro-bug universel ni calibration de force des bots revendiqué.

## Décisions et limites
- Compatibilité : jeu et stockage v3 conservés sur play.html ; application/lobby version 4.0.
- Six profils utilisent la recherche heuristique locale bornée pour rester utilisables sur mobile, pas Stockfish ni modèle distant. Une augmentation de difficulté ne constitue pas une force Elo garantie.
- Catalogue initial fixe de 18 problèmes et 8 leçons, pas une bibliothèque illimitée.
- La consultation de solution vaut zéro étoile et ne valide pas la leçon ; les indices restent autorisés pour une validation à une étoile.
- En mode Défi, le panneau d’accompagnement est masqué, mais le bouton conseil manuel reste disponible, explicitement annoncé.
- Données locales uniquement : en cas de stockage refusé, une navigation/recharge peut perdre les résultats ; pas de promesse de synchronisation.
- Les illustrations de coffret du lobby sont décoratives ; les positions à résoudre sont celles du plateau interactif.
- Mineurs différés : pas de réglage de côté pour les duels contre les bots (Ivoire humain), pas de mode réseau, pas de calibration chiffrée des adversaires.
