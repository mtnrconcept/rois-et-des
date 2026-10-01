# Rois & Dés Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Livrer un prototype web jouable de Rois & Dés en local et contre IA.

**Architecture:** Moteur fonctionnel sans DOM, IA séparée, interface statique. Tests via node:test.

**Tech Stack:** HTML, CSS, JavaScript ES modules, Node.js tests, Vercel static hosting.

**Spec:** docs/superpowers/specs/2026-10-01-rois-et-des-design.md

## Global Constraints
- Aucun backend ni secret.
- Ne pas modifier main pour le développement.
- Responsive mobile/desktop.
- IA facile, moyen, difficile.

## Review Focus
- Rentrée obligatoire des prisonniers.
- Bastions non capturables.
- Déplacements bloqués pour les pièces glissantes.
- Conditions de sortie.
- Doubles donnant quatre actions.

### Task 1: Moteur et tests
Créer src/engine.js et tests/engine.test.js; tester état initial, dés, déplacements, bastions, captures, prison, sortie.

### Task 2: IA et tests
Créer src/ai.js et tests/ai.test.js; facile choisit un coup légal, moyen favorise captures/progression, difficile évalue les séquences.

### Task 3: Interface
Créer index.html, styles.css, src/app.js; plateau, dés, modes, niveaux, aide, statut, nouvelle partie.

### Task 4: CI et déploiement
Créer package.json, vercel.json et workflow GitHub; exécuter tests, ouvrir PR, vérifier les checks, déployer sur Vercel.
