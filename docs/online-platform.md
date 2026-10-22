# Plateforme en ligne — architecture 5.0

Cette branche prolonge les PR #1, #2 et #3 sans les fusionner dans `main`. Le navigateur envoie des intentions ; le serveur Node 22 applique le moteur Echgammon canonique, produit les dés, arbitre les horloges et persiste les résultats dans SQLite.

## Livré

- comptes pseudonymes, sessions HttpOnly/SameSite et récupération par code ;
- profils et synchronisation volontaire de la progression locale ;
- salons privés, matchmaking amical et classé entre vrais joueurs ;
- autorité serveur sur les dés, les coups, les horloges et les résultats ;
- commandes idempotentes avec `commandId` et contrôle de révision ;
- Elo 1200, K=24, appliqué une seule fois aux parties classées ;
- tournois persistants à élimination directe de 2 à 16 joueurs ;
- relecture compacte et vérifiée avec le moteur canonique ;
- signalements et modération réservée aux comptes explicitement autorisés ;
- limites persistantes, contrôles d'origine/CSRF et journal d'audit.

Les bots, les exercices, les salons amicaux et les tournois ne modifient pas l'Elo. Aucun bot n'est présenté comme un joueur connecté.

## Contrat de partie

Les états sont `waiting`, `active`, `ended`, `cancelled`. Les commandes autorisées sont `roll`, `move`, `resign` et `cancel`. Un client ne peut fournir ni plateau de remplacement, ni dés, ni score Elo, ni résultat.

Les files associent même pool et même cadence. La fenêtre Elo commence à 200 points et s'élargit avec l'attente. L'ouverture doit être lancée par Ivoire sous 60 secondes. L'horloge continue en cas de déconnexion et le serveur reste l'autorité après reconnexion.

## Elo et tournois

Le classement utilise l'Elo classique de la PR #3 : départ à 1200 et K=24. Le règlement du résultat et les statistiques sont transactionnels.

Les tournois figent les têtes de série au lancement. Une première nulle provoque une revanche couleurs inversées ; une deuxième nulle qualifie la meilleure tête de série. Les exemptions et départages ne créent pas de résultat Elo.

## Relecture et anti-triche

Chaque événement conserve le type, l'acteur, les données minimales du coup, la version des règles et l'empreinte SHA-256 de la position. La relecture est reconstruite avec le moteur canonique avant affichage. Les conseils sont masqués pendant une partie en ligne.

L'autorité serveur limite la falsification du client mais ne constitue pas une détection complète des moteurs externes, de la collusion ou des comptes multiples. Une couche statistique et une politique de sanctions restent des travaux distincts.

## Persistance

SQLite utilise WAL, clés étrangères, `synchronous=FULL` et transactions `BEGIN IMMEDIATE`. La version cible une seule instance avec un disque persistant. Aucune bascule silencieuse vers un stockage éphémère n'est autorisée en production.

Voir `docs/online-deployment.md` pour l'exploitation et la sauvegarde.
