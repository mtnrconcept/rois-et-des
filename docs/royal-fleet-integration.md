# La Flotte royale : présentation 3D du jeu hybride

Ouvrir `play.html?view=fleet` pour charger la citadelle et ses figurines. Le bouton
« Revenir au plateau 2D » change la présentation de la partie en cours. Une URL
sans `view=fleet` conserve le plateau historique et ne charge aucun module 3D.
Le paramètre se combine avec `bot`, `mode`, `lesson`, `puzzle` et `fresh`.

## Une seule partie, les règles existantes

`game.mjs`, `chess.mjs`, `race.mjs` et le règlement hybride restent les autorités.
Rouge représente Ivoire (`w`) et Bleu représente Ébène (`b`). Le canon d'une tour,
le projectile d'une dame et les autres effets représentent une action déjà
validée et payée avec les dés. Ils ne modifient ni sa portée, ni ses cibles, ni les
conditions de victoire. Les pions de course restent distincts des pièces d'échecs.

`view.mjs` conserve l'état `game` et la sauvegarde existante. Les clics 3D et DOM
appellent les mêmes fonctions de sélection des cases, pointes, barre et sortie.
Les promotions passent par la boîte de choix existante. `commitAction` transmet
`{before, after, action}` au rendu pour les humains, les bots et les exercices.
Le moteur effectue la transition une seule fois ; aucun moteur Python classique
ne participe au jeu web.

`fleet-bridge.mjs` gère uniquement le cycle de présentation. Il bloque les
interactions et la programmation du bot pendant une animation. Les changements
de sélection actualisent `sync({game, selected, available, canInteract})`.
Les actions déjà dépensées, les lancers, les resets et la reprise d'une sauvegarde
sont donc rendus à partir de l'état canonique. Une ancienne animation ne peut
pas déverrouiller une nouvelle instance après un reset ou un changement de vue.

## Contrat du renderer

```js
const renderer = await createFleetView({
  container, onSquare, onPoint, onBar, onOff, onBusy
});
renderer.sync({game, selected, available, canInteract});
await renderer.animate({before, after, action});
renderer.setCamera('overview'); // aussi chess, left, right
renderer.resize();
renderer.dispose();
```

Les cases et pointes utilisent les indices existants (0–63 et 0–23). Barre et
sortie reçoivent `w` ou `b`. Chaque chargement dispose de son propre conteneur et
d'un numéro de génération : un chargement terminé après un retour 2D est détruit.
`dispose()` doit aussi terminer une animation en cours. Le chargement et
l'animation peuvent signaler `onBusy(boolean)` ; les callbacks obsolètes sont
ignorés. Les changements de caméra n'agissent jamais sur les règles.

## Accessibilité et reprise

Les 64 cases et 24 pointes DOM restent présentes avec leurs noms accessibles,
coordonnées et commandes clavier. « Afficher le plateau accessible » les déplie
sous la scène ; un focus clavier ou un guide qui les cible les affiche également.
La barre, les sorties, les dés, les règles et les contrôles de partie restent
des boutons HTML. Le plateau 3D ne remplace donc pas les commandes accessibles.

Si le module, WebGL ou un asset échoue, un message rend le retour 2D explicite.
La partie déjà validée est conservée. Une nouvelle tentative est possible avec
le bouton 3D. La perte d'un contexte WebGL est interceptée dès le chargement ;
seule l'instance courante peut déclencher ce retour. Son écouteur est retiré
lors d'un changement de vue ou de la fermeture de la page.
Les préférences de mouvement réduit sont traitées par le renderer.
Les modifications 3D n'ajoutent aucun secret, backend ou nouvelle sauvegarde.

## Vérification

- `npm test`, `npm run check`, `npm run build` : contrôles du dépôt.
- `node --test tests/fleet-bridge.test.mjs` : état canonique partagé, verrou des
  transitions, rejet des chevauchements, annulation/résultats périmés, erreurs de
  rendu et conservation du parcours 2D.
- `python -X utf8 tests/echgammon.browser.py` : parcours historiques inchangés.
- `python -X utf8 tests/lobby.browser.py` : salon, académies et exercices.
- `python -X utf8 tests/analysis.browser.py` : Worker, analyse, annulation et audio.
- `python -X utf8 tests/fleet.browser.py` : intégration navigateur et assets 3D.

Les trois suites historiques partagent `tests/browser_server.py`, un serveur
HTTP limité à la boucle locale. Ses types MIME JavaScript sont explicites, même
si Windows associe `.mjs` à du texte brut ; aucun réglage système n'est changé.
Il réserve lui-même un port disponible et est fermé en fin de suite.
Les parcours historiques, le salon et l'analyse ont été vérifiés en HTTP natif
avec le stockage du navigateur, le vrai module Worker et l'audio Web Audio.

Les tests du bridge utilisent un renderer simulé et ne prouvent pas un rendu
WebGL. Les vérifications navigateur/GLB sont complémentaires. Un contrôle local
ne constitue pas une preuve de déploiement ou de comportement sur tous les GPU.
