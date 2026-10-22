# Plateforme en ligne — exploitation

Le nouveau serveur n'est pas encore provisionné publiquement. `render.yaml` décrit un service dédié et un disque persistant ; sa présence dans Git n'engage aucun abonnement.

## Démarrage local

```bash
npm test
npm run check
npm run build
npm start
```

Node 22.23.4 est fixé dans `.node-version`. Par défaut le service écoute `127.0.0.1:3000` et crée `data/rois-et-des.sqlite`.

## Production

Variables principales : `NODE_ENV=production`, `PUBLIC_ORIGIN` HTTPS exact, `DATABASE_PATH` absolu sous `PERSISTENT_DATA_DIR`, et éventuellement `ADMIN_USERNAMES`.

Le serveur refuse en production une origine HTTP, une base dans `/tmp` ou dans le dépôt, ou un volume déclaré absent. Sur Render, `PERSISTENT_DATA_DIR=/var/data` doit être réellement monté.

Le proxy n'est jamais implicitement fiable. Laisser `TRUST_PROXY=0` tant que la chaîne proxy réelle n'a pas été vérifiée. Si elle est activée, les adresses exactes du proxy doivent être listées dans `TRUSTED_PROXY_ADDRESSES`.

## Sessions et sécurité HTTP

Les mots de passe sont dérivés avec scrypt. Les jetons de session et codes de récupération sont stockés sous forme d'empreinte. Les mutations exigent l'origine exacte ; les mutations authentifiées exigent également le jeton CSRF.

Les réponses API sont `no-store`. Les corps JSON, en-têtes et durées de requête sont bornés. Les fichiers privés, le code serveur, les tests, la documentation et la base ne sont pas servis comme ressources statiques.

## Sauvegarde

```bash
DATABASE_PATH=/var/data/rois-et-des.sqlite npm run backup -- /var/data/backups/rois-et-des-2026-10-22.sqlite
```

La sauvegarde utilise `VACUUM INTO`, `PRAGMA quick_check`, fsync et permissions privées. Elle n'écrase jamais une sauvegarde existante. Une copie sur le même disque ne protège pas de la perte du disque : une sauvegarde externe reste à organiser avant ouverture publique.

## Recette avant ouverture

Vérifier `/api/health`, deux comptes, un salon, une partie complète, la reconnexion, une partie classée, un tournoi, la récupération de compte, le redémarrage avec persistance et la restauration d'une sauvegarde. Contrôler ensuite les logs, les erreurs 5xx, les quotas et la taille du disque.
