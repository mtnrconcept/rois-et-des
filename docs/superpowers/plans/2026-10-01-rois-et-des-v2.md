# Rois & Dés v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax.

**Goal:** Rendre Rois & Dés robuste contre les blocages et lui donner une interface 3D premium.

**Architecture:** Le moteur conserve les règles pures. Un nouveau module turn.js choisit/consomme les dés jouables et termine automatiquement les tours bloqués. L'UI utilise cette orchestration; l'IA reste un consommateur des actions légales.

**Tech Stack:** JavaScript ES modules, node:test, HTML/CSS 3D, Render static hosting.

**Spec:** docs/superpowers/specs/2026-10-01-rois-et-des-v2-design.md

## Global Constraints
- Aucun backend.
- Aucun développement sur main.
- Aucun état UI ne doit attendre une action impossible.
- prefers-reduced-motion doit être respecté.

## Review Focus
- Prisonnier avec toutes les entrées bloquées.
- Plusieurs dés dont seul le second est jouable.
- Double avec certaines actions devenues impossibles après un coup.
- État sans coup légal pour aucune pièce.
- Simulation prolongée sans boucle d'actions.

### Task 1: Orchestrateur anti-blocage
**Files:** Create src/turn.js; Create tests/turn.test.js
- [ ] Tests RED: prochain dé jouable, passage automatique, fin de tour.
- [ ] Implémenter getPlayableActionIndex et normalizeTurn.
- [ ] Tests GREEN.

### Task 2: Invariants et simulations
**Files:** Create tests/simulation.test.js; Modify src/engine.js
- [ ] Tests RED des invariants et simulations bornées.
- [ ] Renforcer validation des actions/états si nécessaire.
- [ ] Exécuter 100 parties simulées, max 5000 actions chacune.

### Task 3: IA v2
**Files:** Modify src/ai.js; Modify tests/ai.test.js
- [ ] Tester que chaque niveau renvoie uniquement une action légale.
- [ ] Tester prison et sortie.
- [ ] Adapter IA à l'orchestrateur.

### Task 4: UI 3D et orchestration
**Files:** Modify index.html, styles.css, src/app.js
- [ ] Intégrer normalizeTurn pour éliminer les attentes impossibles.
- [ ] Ajouter plateau perspective, profondeur des pièces, dés 3D, éclairage, transitions.
- [ ] Ajouter messages explicites de passage automatique et réduction d'animations.

### Task 5: Vérification et déploiement
**Files:** Modify package.json/.github/workflows/ci.yml si nécessaire
- [ ] npm test.
- [ ] npm run check.
- [ ] Vérifier CI.
- [ ] Vérifier déploiement public et URL.
