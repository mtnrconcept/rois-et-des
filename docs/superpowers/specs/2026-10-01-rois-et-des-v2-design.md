# Rois & Dés v2 — Règles robustes et rendu 3D

## Objectif
Transformer le prototype en jeu de stratégie jouable sans état bloquant, avec règles cohérentes et présentation 3D premium.

## Tour
Deux dés donnent deux actions; un double en donne quatre. Les actions sont consommées dans l'ordre choisi par le joueur. Une action sans aucun coup légal est automatiquement passée. Si plus aucune action restante n'est jouable, le tour se termine automatiquement.

## Prison
Toute pièce isolée capturée va en prison. Tant qu'un joueur possède au moins un prisonnier, seules les rentrées sont autorisées. Une rentrée utilise la valeur du dé pour déterminer la colonne d'entrée. Si cette entrée est bloquée par un bastion adverse, ce dé est passé. Si aucune action restante ne permet une rentrée, le tour se termine: la pièce reste en prison jusqu'au prochain tour.

## Occupation
Une case accepte au maximum deux pièces alliées. Deux alliés constituent un bastion invulnérable. Une case ne contient jamais simultanément des couleurs différentes après résolution d'une action. Une pièce isolée adverse peut être capturée.

## Déplacements
Tour, fou et dame: déplacement d'au plus la valeur du dé, chemin libre. Roi: une case. Cavalier: mouvement en L et saut autorisé. Les pièces peuvent avancer, reculer et se déplacer latéralement. Une pièce ne traverse pas un bastion, sauf le cavalier qui peut le survoler.

## Sortie
Un joueur peut sortir des pièces seulement si tous ses éléments non sortis sont dans ses deux dernières rangées et aucun n'est en prison. Dernière rangée: tout dé. Avant-dernière: dé >=2. Une capture ultérieure suspend les nouvelles sorties jusqu'au retour de la pièce capturée dans la zone. Six pièces sorties = victoire.

## Garantie de progression
Le moteur expose les actions légales pour chaque dé restant. Après chaque action il recherche le prochain dé jouable. Les dés impossibles sont consommés automatiquement. Si aucun ne l'est, le tour change. L'interface ne doit jamais attendre un clic impossible.

## Robustesse
Tests unitaires des règles, invariants d'état, tests de prison/bastion/sortie, et simulations aléatoires de parties sur des milliers de tours avec garde anti-boucle. Une simulation doit toujours atteindre un changement de tour ou une victoire dans un nombre borné d'étapes.

## Interface 3D
Plateau CSS 3D en perspective, cadre sombre premium, cases texturées, profondeur, éclairage et ombres. Pièces avec volume simulé, reflets et élévation à la sélection. Dés 3D animés. Indicateurs de coups légaux volumétriques. Responsive et mode réduction des animations via prefers-reduced-motion.

## Architecture
engine.js reste pur et indépendant du DOM. turn.js orchestre la consommation des dés et les passages automatiques. ai.js ne choisit que parmi les actions légales. app.js orchestre l'affichage. Aucun backend.
