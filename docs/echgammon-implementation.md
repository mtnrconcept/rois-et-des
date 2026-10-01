# Échgammon — Classique Royal : conception et exécution

## Source et audit
Référence : affiche fournie par l'utilisateur, IMG_5791.jpeg, sections 1–8.
Dépôt consulté via le connecteur GitHub : mtnrconcept/rois-et-des, branche feat/playable-rois-et-des, base 4905b89d4b440aa9bf10c2febb597bf00a36961c. PR 1 ouverte. Arbre complet lu : 18 fichiers, aucun AGENTS.md, aucune dépendance, migration, base, secret ou configuration Supabase. Render sert cette branche, commande `npm test && npm run check`, répertoire `.`. Vercel et Supabase accessibles mais non utilisés par cette application statique.
Le clone HTTPS local échoue (résolution DNS) : export local clairsemé des fichiers concernés, contrôlé par SHA des blobs, worktree isolé ; publication via GitHub Git Data API sur la branche existante, jamais main. Les fichiers historiques non concernés restent dans le dépôt ; les tests historiques seront exécutés par le build distant.

## Correspondance avec l'affiche
Échiquier 8×8 et 32 pièces ; pistes 24 pointes, 15 pions de chaque couleur ; deux dés partagés. Distances d'échecs exactes, cavalier=3, roi=1, roque=2 ; un dé ou deux dés additionnés pour une pièce. Double=4 valeurs, chacune utilisée au plus une fois. Course : une valeur par mouvement, point adverse occupé par >=2 pions fermé ; isolé frappé ; rentrée de la barre prioritaire pour la course. Sorties exactes (texte de l'affiche) dans le dernier quadrant. Victoire immédiate par mat géométrique ou 15 sorties. Aucun bastion sur l'échiquier, aucune sortie des pièces d'échecs.

## Précisions d'adaptation, absentes ou ambiguës dans l'affiche
- Échec : interrompt le tour attaquant. Le défenseur doit répondre avant la course. Sans paiement possible, une parade royale légale consomme tous les dés restants. Un mauvais lancer ne crée jamais un faux mat.
- La barre contraint seulement la course ; les échecs restent disponibles, sauf obligation de répondre à un échec.
- Une somme utilise exactement deux valeurs encore disponibles, y compris dans un double. Pas de somme pour les pions de course.
- Un dé temporairement inutile reste disponible : un autre mouvement peut le libérer. Passage automatique seulement si aucun coup, seul ou combiné, n'existe sur les deux espaces. Pas d'obligation de maximisation des dés du backgammon pur, puisqu'ils sont partagés avec les échecs.
- Donner échec termine le tour ; promotion au choix dame/tour/fou/cavalier ; prise en passant au prochain mouvement d'échecs, au plus tard à la fin du tour adverse ; toutes les conditions géométriques du roque s'appliquent.
- Le pat ou le matériel insuffisant aux échecs ne termine pas la course. Répétition de l'état hybride complet trois fois au début d'un tour = nulle. Limite de 400 tours individuels = nulle de sécurité. Pas de promesse de victoire forcée ni de zéro bug.
- Les variantes optionnelles de l'affiche ne sont pas le règlement classique livré ; « course pure » est contradictoire sur le traitement de l'échec. Pas d'implémentation silencieuse de cette variante.

## Architecture / fichiers
Préserver les modules/tests historiques pour retour arrière. Ajouter echgammon/chess.mjs (géométrie), race.mjs (course), game.mjs (dés/tour/fin), ai.mjs (3 niveaux), view.mjs (DOM et temporisations), royal.css (coffret responsive). Remplacer seulement index.html, compléter package.json et le workflow existant. Ajouter tests/echgammon.test.mjs et docs de vérification. Aucun backend/dépendance réseau à l'exécution.

## Ordre et validation
1. Tests des règles, puis moteur : perft 20/400/8902, roques, promotions, prise en passant, échecs, mat ; course/barre/sortie ; sommes/doubles/états périmés.
2. Simulations déterministes : invariants et terminaison bornée, tous les niveaux IA ne produisent que des coups légaux. Distinguer victoires et nulles.
3. Interface coffret bois, ivoire/ébène, triangles latéraux, relief CSS, dés 3D, mode local/IA et choix des promotions, souris/tactile/clavier. Contrôles mobiles visibles, plateau horizontal navigable.
4. Tests navigateur réels Chromium, bureau/mobile, captures et erreurs console, annulation des timers, rechargement sécurisé.
5. Test complet, syntaxe, commit atomique sur branche dédiée ; checks GitHub et déploiement Render ; contrôle du contenu servi. Main inchangé.

## Risques et retour arrière
Risques principaux : coordonnées de course, priorité échec/barre, coût des combinaisons, clics pendant l'IA, sauvegardes périmées, taille mobile. Tests dédiés. Réversion du commit publié ou restauration de index.html/package.json depuis la base ; les modules historiques ne sont pas supprimés. Le rendu est du relief CSS/SVG, pas un moteur 3D photoréaliste.

## Résultats locaux constatés
- 30 tests Node réussis ; perft classique jusqu'à profondeur 4 : 20, 400, 8 902, 197 281.
- 100 parties déterministes : 42 victoires, 58 nulles, 59 334 étapes (lancers et actions). La nulle à 400 tours est une règle annoncée, pas une assertion supprimée pour cacher un blocage.
- Trois parties IA complètes supplémentaires : apprenti nulle par répétition ; stratège victoire Ivoire par course ; maître victoire Ébène par course.
- 14 parcours/contrôles Chromium, bureau 1440×1100 et mobile tactile 390×844, zéro erreur JavaScript observée. Le mode local de test utilise les vrais fichiers exécutés hors réseau et un adaptateur de stockage en mémoire ; la navigation réseau du navigateur local est interdite. Le workflow distant exécute le test HTTP avec stockage natif.
- Régression reproduite puis corrigée : le groupe CSS preserve-3d interceptait les clics destinés aux cases. Le coffret reste en perspective mais ses descendants sont aplatis pour le hit-testing ; les dés gardent leurs six faces 3D.
- Régression reproduite puis corrigée : refus des sauvegardes sans résultat alors qu'un joueur possède déjà 15 sorties.
- Syntaxe JavaScript et build statique vérifiés. Pas de TypeScript ni de linter externe configuré.
- Revue finale par l'auteur, sans second relecteur indépendant. Les 11 tests historiques seront également exécutés par npm test dans le dépôt complet sur CI/Render. Aucun test exécuté ne prouve l'absence universelle de bugs ni l'équilibre définitif du jeu.
