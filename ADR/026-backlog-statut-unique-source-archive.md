# ADR-026 — BACKLOG.md : source unique de statut + archive append-only (TK-69)

**Statut** : Accepté
**Date** : 2026-07-08
**Supersede** : la convention du 2026-07-01 (« le tableau récap est un index
                 d'état — les lignes "Fait" sont conservées »), notée en pied
                 de BACKLOG.md.
**Lié à** : ADR-020 (label PR = surface unique de mapping TK→travail) ·
            CLAUDE_PROJECT.md §6 (« pas un cimetière d'historique ») ·
            TK-70 (gate CI check-backlog.ts, dépendant)

## Contexte

Le statut d'un ticket vivait à trois endroits non contraints dans BACKLOG.md :
prose détaillée (`### TK-XX`), tableau « Vue d'ensemble », bloc « Ordre
conseillé ». Trois copies de la même vérité, sans contrainte de cohérence
entre elles → dérive garantie. Constats terrain (2026-07-08) :
- TK-67 déjà mergé (PR #107) mais listé « À faire » dans le tableau.
- Deux versions du bloc « Ordre conseillé » avaient coexisté à des moments
  différents du fichier, sans qu'aucune ne soit expirée mécaniquement.
- Les tickets clos les plus anciens (TK-01…TK-07, TK-19…) manquaient de la
  vue d'ensemble, jamais rattrapés.

La convention actée le 2026-07-01 (« garder les lignes Fait » dans le tableau)
entre en tension directe avec CLAUDE_PROJECT.md §6 : « Les dettes traitées se
suppriment du backlog (pas un cimetière d'historique) ». Le mapping TK→PR est
déjà mécanisé par ADR-020 (label de PR) + `git log --grep`. Garder les tickets
Fait dans le backlog vivant duplique cette traçabilité déjà existante — et
c'est cette redondance non contrainte qui pourrit.

## Décision

1. **Le tableau « Vue d'ensemble » est la source unique de vérité du statut.**
   La prose (`### TK-XX`) ne porte plus aucun marqueur de statut (✅, Livré,
   Fait, Annulé).
2. **Fait / Annulé sortent du backlog vivant vers `BACKLOG_ARCHIVE.md`**,
   append-only : une ligne par ticket clos (`TK-XX | titre | Fait|Annulé |
   réf PR/ADR`), jamais réédité. C'est l'append-only qui rend l'archive
   structurellement non-dérivante — une ligne écrite une fois ne peut plus
   diverger d'elle-même.
3. **Le backlog vivant (BACKLOG.md) ne contient que À faire + Dormant.**
4. **« Ordre conseillé » est un bloc éphémère unique**, en tête de fichier,
   réécrit en entier à chaque kickoff, ne référençant que des tickets À
   faire. Jamais appendé — pas de version fantôme qui traîne.

Ce renversement tranche en faveur de CLAUDE_PROJECT.md §6 contre la
convention du 2026-07-01 : le besoin réel derrière « garder les Fait »
(voir ce qui a été livré) est déjà servi par l'archive append-only, sans le
coût de dérive d'un statut dupliqué à trois endroits.

## Conséquences

- BACKLOG.md rétréci à sa seule fonction (piloter le travail à venir) ;
  BACKLOG_ARCHIVE.md porte l'historique de clôture, jamais retouché.
- TK-70 (gate CI `check-backlog.ts`) peut geler mécaniquement les six
  invariants issus de cette décision (unicité des IDs, statuts autorisés,
  disjonction backlog/archive, prose ⊆ tickets ouverts, unicité des blocs).
- Aucun gate CI existant ne parsait BACKLOG.md avant cette décision (vérifié :
  aucune référence à `check-backlog` dans `package.json` ni les workflows) —
  pas de retrofit nécessaire sur un gate v2 antérieur.

## Références

BACKLOG.md (note d'en-tête) · BACKLOG_ARCHIVE.md · CLAUDE_PROJECT.md §6 ·
ADR-020 · TK-69 · TK-70.
