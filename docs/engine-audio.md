# Échgammon — analyse renforcée et sons de bois

## Audit et intention
Base distante : 63205f3b99253375daf59597db33f17b3a40c34b, PR 1 ouverte,
branche feat/playable-rois-et-des servie automatiquement par Render.
GitHub (lecture/écriture), Supabase, Vercel et Render vérifiés. Aucun backend,
secret, paiement ou migration dans cette application. AGENTS.md lu.
Le clone/fetch local est impossible (DNS github.com) : 27 sources du ZIP v4
vérifiées octet pour octet par leurs SHA GitHub, puis snapshot local et worktree
isolé .worktrees/engine-audio. Les fichiers historiques absents du snapshot ne
seront pas touchés ; les tests du dépôt complet sont exécutés sur Render.
Baseline locale : 51 tests réussis. Les checks GitHub précédents étaient
bloqués avant exécution par facturation ; ne pas modifier ce compte.

## Conception
Renforcer l'ordinateur et les conseils pour ce jeu hybride, sans changer les
règles ni appliquer naïvement un moteur d'échecs à des dés et une course.
Recherche sélective de suites utilisant les valeurs restantes, analyse des
réponses adverses et des 21 lancers distincts pondérés sur 36 possibilités.
Évaluation du matériel, de la sécurité, de l'activité, de la structure et de
la progression de course. Cache local à chaque recherche, budget de temps et
de nœuds. Une recherche partielle ne vaut pas preuve de meilleur coup absolu.
Les résultats affichent le travail effectivement achevé : variantes, meilleur
coup trouvé, raisons et risques mesurés, coûts des dés. Les lancers à venir
restent explicitement conditionnels. Aucun faux Elo ni pourcentage de victoire.
Astra, Octave et le niveau Maître utilisent le calcul dans un Worker ; tous les
conseils libres utilisent ce moteur indépendamment du niveau de l'adversaire.
Les parcours pédagogiques conservent leurs solutions éditoriales et indices.
Calcul annulable, résultats périmés ignorés, reprise légale rapide si Worker
indisponible. Le plateau ne se bloque pas pendant un conseil.

Sons de bois synthétisés localement (pas de fichier tiers) : pose/glissement,
capture plus grave, double contact du roque, pions de course et dés. Activation
après geste utilisateur, volume modéré et réglable, silence persistant, arrêt
lors du masquage de la page. Aucun son de coup sur une simple sélection ou une
erreur ; sons non essentiels et indisponibilité audio sans impact sur le jeu.

## Fichiers et ordre
1. Créer tests/analysis.test.mjs avant echgammon/analysis.mjs. Moteur pur,
   sorties structurées vérifiables et explications, mesures tactiques.
2. Créer tests/engine-client.test.mjs avant echgammon/engine-client.mjs et
   echgammon/analysis-worker.mjs. Annulation, erreurs, progrès et repli.
3. Créer tests/sound.test.mjs avant echgammon/sound.mjs. Synthèse bornée,
   préférences sûres, activation et arrêt.
4. Intégrer seulement echgammon/view.mjs, play.html,
   echgammon/analysis.css sans modifier les positions de catalog.mjs.
5. tests/analysis.browser.py pour parcours souris/tactile, calcul/annulation,
   actions périmées, sons, volume et régression de l'académie. Mettre à jour
   package.json et CI ; documentation README et ce rapport.

## Risques et retour arrière
Recherche sélective : force à mesurer, jamais annoncée comme optimale.
Budgets mobiles et annulation évitent les calculs orphelins. Les scores hybrides
ne sont pas des centipions Stockfish. Résultats associés à la révision/position.
Ne pas révéler une solution pédagogique via un conseil libre. Ne pas produire
une file de sons en cas d'audio suspendu. Retour arrière par réversion du commit
sur la seule branche dédiée, sans modifier main. Modules géométriques et
règles du jeu inchangés. Aucun changement de base ni d'hébergement.

## Vérification prévue
Tests RED→GREEN, suite Node existante, scénarios tactiques avant/après,
simulations légales, budget et déterminisme, sons RMS/peak et refus stockage.
Contrôles navigateur avec Worker et AudioContext quand disponibles ; signaler
les limites du navigateur hors réseau. Test réel du déploiement public.

## Résultats locaux constatés
- 20 tests ciblés (analyse 12, client Worker 4, synthèse/préférences 4), en plus des 51 tests v4. Scénarios tactiques, budgets, états immuables, gains constatés, parade royale, probabilités et priorité de la barre.
- Exemple reproductible : au départ avec un double 3, l'ancien profil Astra joue quatre déplacements de course ; le nouveau moteur prépare g1–f3–e5–f7–d8 et capture un pion puis la dame. La variante est rejouée avec les règles réelles.
- Sur « fourchette », le moteur utilise d'abord le dé 5 pour avancer la course, puis le 3 pour donner échec : l'ordre évite de perdre le second dé.
- Le test initial de l'explication tactique échouait (gain à venir absent) ; il vérifie maintenant que les captures de la suite effectivement rejouée sont expliquées. Le calcul d'exposition a aussi un test de régression sur la priorité des rentrées adverses.
- 24 contrôles du nouveau parcours Chromium : vrai module Worker, annulation du conseil puis relance, ancien calcul après reset, Astra via Worker, arrêt anticipé de l'ordinateur avec coup légal, sources AudioBuffer natives, absence de son sur conseil, son de capture, silence/volume, mobile 390 px sans débordement. Les vraies sources sont exécutées via URL data dans l'environnement hors réseau ; les préférences sont adaptées en mémoire localement.
- Les 18 problèmes et les deux parcours guidés de la suite historique restent testés via les vrais contrôles. Les sons n'altèrent pas les règles ni la validation pédagogique.

## Limites explicites
Meilleur coup **trouvé**, pas optimum prouvé. Deux tours individuels au plus dans l'horizon principal (tour courant puis tour adverse), sélection par faisceau et budget ; aucune estimation Elo ou probabilité globale de victoire. Les risques géométriques sont distingués des reprises effectivement payables. Les lancers futurs ne sont jamais présentés comme connus. « 21 lancers » désigne 21 paires non ordonnées, pondérées 1 ou 2 sur 36.

Les sons sont synthétisés, pas enregistrés sur un vrai échiquier. Tests numériques d'amplitude et de déclenchement réel ; pas de certification perceptive ni de test physique sur iPhone. Son et Worker sont facultatifs, avec repli signalé. Revue par l'auteur faute de revue indépendante.

Références techniques : documentation MDN Using Web Workers, Worker.terminate et Web Audio API best practices, consultées le 1 octobre 2026. Aucun service d'IA externe ni clé API ajouté.

## Validation avant publication
`npm test` : 71/71 sur le snapshot local. `npm run check` : 16 modules, succès. `npm run build` : vérification statique, succès. `git diff --check` : succès. Aucune compilation TypeScript ni linter externe ajouté.
Les suites navigateur actualisées ont confirmé 24 contrôles du moteur/audio et 14 contrôles historiques ; la suite du salon avait confirmé les 18 exercices et 2 parcours guidés. Aucune erreur JavaScript observée. L'état local d'une partie de 180 tours (179 répétitions historiques enregistrées) a aussi été analysé sans bloquer ni modifier la partie.
