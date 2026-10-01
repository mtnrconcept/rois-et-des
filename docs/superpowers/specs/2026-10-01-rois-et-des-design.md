# Rois & Dés — Design

## But
Créer un jeu web responsive à deux modes: 2 joueurs local et joueur contre IA (facile, moyen, difficile).

## Règles
Plateau 6×8. Chaque camp possède roi, dame, deux tours, fou, cavalier. Deux dés donnent deux actions; un double en donne quatre. Tours/fous/dame ont une portée maximale égale au dé; roi et cavalier consomment un dé sans dépendre de sa valeur. Deux alliés sur une case forment un bastion invulnérable. Une pièce isolée capturée va en prison. Les prisonniers doivent rentrer avant toute autre action. Quand toutes les pièces restantes sont dans les deux dernières rangées, elles peuvent sortir. Premier à sortir six pièces gagne.

## Architecture
Application statique sans backend ni compte. Le moteur de règles est isolé de l'UI. L'IA ne reçoit qu'un état et produit une action légale. L'interface consomme le moteur et expose plateau, dés, prison, sorties, choix du mode et niveau IA.

## Qualité
Responsive mobile/desktop, aucun secret, tests Node natifs, CI GitHub, déploiement statique Vercel.
