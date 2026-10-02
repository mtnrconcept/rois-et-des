# Partie dans le viewport et dés physiques

## Cadrage

`match-layout.css` réserve la hauteur visible (`100dvh`) au plateau, aux joueurs,
aux barres/sorties et à la console. `match-layout.mjs` mesure l'espace restant et
dimensionne le plateau classique. La scène Blender occupe cette même surface.
Sur ordinateur, l'aide pédagogique a son propre défilement. En mode compact
(largeur ≤ 1000 px ou hauteur ≤ 600 px), les réglages, le journal et l'aide sont
dans des dialogues natifs accessibles au clavier. En portrait jusqu'à 600 px de
largeur, la vue centrale montre le plateau classique complet : les pointes 13 à
24 forment une bande au-dessus de l'échiquier et les pointes 12 à 1 une bande
au-dessous. Les 24 boutons de course conservent leurs identifiants, leurs comptes
et leurs actions ; aucune pièce ni aucun pion n'est dupliqué. Les pions peuvent
être joués directement depuis cette vue.

Lorsque la hauteur portrait ne dépasse pas 680 px, les bandes de course sont
moins hautes et l'échiquier occupe une plus grande part de la largeur disponible.
Les marges du coffret et l'espacement des piles s'adaptent aussi ; les deux bandes
et les commandes restent présentes. Les compteurs répétés sous les noms sont
masqués dans ce seul format court ; les barres et zones de sortie les affichent
toujours. Le dimensionnement lit les proportions CSS
effectives, au lieu de conserver celles du grand format.

Les boutons Piste gauche et Piste droite agrandissent les douze pointes de la
piste choisie. Le bouton central revient à la vue complète en portrait. Dans les
autres formats compacts, les trois sections restent des vues séparées. Sélections
et guides peuvent changer de vue sans changer la partie. La présentation 3D
conserve ses caméras ; son alternative accessible bénéficie aussi des deux bandes
en portrait. En paysage court, les commandes passent à droite.

## Physique, rendu et règles

Le module local Cannon-es 0.20.0, licence MIT conservée dans `assets/fleet/vendor`,
simule deux corps rigides cubiques : gravité 9,81, rotations, frottement, rebonds,
collisions entre dés, sol, rebords et volumes simplifiés des figurines. Ces
figurines sont des obstacles statiques cylindriques ; elles ne sont pas renversées.
La simulation dans un Worker avance à 120 Hz et enregistre les positions et
quaternions à 60 Hz. Three.js rejoue ces trajectoires dans la scène Blender, ou
sur un canvas transparent au-dessus de l'échiquier classique/accessibilité.

La graine initiale vient de `crypto.getRandomValues`. Aucune valeur de face n'est
choisie avant le lancer et aucune orientation finale n'est corrigée pour produire
un nombre. Le résultat vient des normales des faces lorsque les deux dés sont
immobiles et à plat. Un dé penché peut recevoir jusqu'à trois impulsions physiques
vers une zone dégagée, enregistrées avec la trajectoire. Si les dés restent coincés
après 12 secondes simulées, le lancer est refusé et « Relancer les dés » devient
accessible, y compris pendant le tour d'un bot. Aucun résultat de remplacement
n'est inventé.

`game.mjs` reçoit une seule paire à la fin du rendu ; il conserve les règles du
premier lancer, des doubles et de consommation des dés. Les exercices conservent
leurs valeurs imposées. Humains et bots utilisent le même chemin physique.
Les événements de collision déclenchent les sons existants. Avec la préférence
« mouvements réduits », la pose finale est présentée directement, issue de la
même simulation. Une défaillance WebGL du canvas classique affiche les mêmes
valeurs physiques dans la console. La perte de la scène Blender retourne au
plateau classique et annule le lancer en cours.

Les doubles clics, changements de partie et masquages de page sont protégés par
un numéro de lancer et un AbortController. Annuler termine le Worker et empêche
un résultat périmé de modifier la partie. Une erreur dans une image du rendu
rejette la promesse et libère les contrôles. Le Worker dispose d'un délai limite.

## Vérification reproductible

- `npm test` : règles, assets, cycle de présentation, physique et lecture des faces.
- `npm run check` et `npm run build` : syntaxe de tous les modules de production.
- `python tests/match-layout.browser.py` : bornes réelles des contrôles et du plateau
  à 1920×1080, 1440×900, 1366×768, 844×390 et 720×450, parcours d'aide. À
  440×956, 390×844, 360×740 et 320×640 : les 24 pointes visibles occupent bien
  deux bandes ordonnées de douze autour de l'échiquier, les 32 pièces et les
  comptes des 30 pions sont conservés. Le parcours joue réellement 9 → 6 depuis
  la vue complète, agrandit chaque piste puis revient, change d'orientation et
  vérifie aussi le plateau accessible depuis la 3D. Un vrai lancer à 390×844
  vérifie l'alignement du canvas de dés sur l'échiquier central et l'égalité entre
  les faces issues du Worker physique et les valeurs enregistrées par le jeu.
- `python tests/dice.browser.py` : vrais Workers/WebGL, faces affichées et valeurs
  enregistrées, double clic, reset, bot, refus/réessai, rendu accessible et perte
  de contexte. Le seul Worker substitué est le cas explicitement en échec.
- Suites navigateur historiques : `echgammon`, `lobby`, `analysis`, `fleet`.

Les deux nouvelles suites acceptent `FLEET_BASE_URL` pour vérifier le site publié.
Les tests physiques incluent 100 graines sans obstacle et 100 avec les 32 pièces
initiales. Un cas volontairement très encombré vérifie le refus d'un dé coincé.
Les tests de rendu utilisent Chromium et ne prouvent pas tous les matériels.
