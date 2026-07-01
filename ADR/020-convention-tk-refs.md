# ADR-020 — Convention de référencement ticket ↔ travail (TK-31)

**Statut** : Accepté
**Date** : 2026-07-01
**Lié à** : préalable au gate backlog v2 · DoR (CLAUDE_PROJECT.md §Gate de cadrage) ·
            découple explicitement la politique de merge (hors scope — voir BACKLOG.md)

## Contexte

Le gate backlog v2 doit vérifier mécaniquement que chaque ticket "Fait" est couvert
par du travail mergé. Vérif terrain (2026-07-01) : `main` est mixte — squash, merge
commits et pushs directs coexistent ; les trois stratégies sont ouvertes côté GitHub ;
squash title en `COMMIT_OR_PR_TITLE`. Conséquence dure : `git log main` n'est pas un
oracle fiable — le `TK-XX` n'est pas garanti d'atterrir sur le sujet du commit main.

## Décision

1. **Surface primaire = label de PR.** Toute PR mergée porte exactement un label
   `TK-XX` (ou `no-ticket`). Le gate v2 lit PR→label via l'API GitHub — agnostique
   à la stratégie de merge.
2. **Résidu = pushs directs sur main.** Pour eux seuls, trailer `Refs: TK-XX`
   obligatoire. Le gate réconcilie : {TK-XX côté PR} ∪ {Refs des commits sans PR}.
3. **Exemption explicite obligatoire** : `no-ticket` (label ou trailer), jeton unique.
   Sans déclaration positive, "sans ticket" est indiscernable de "oublié" → couverture
   invérifiable. Motif "fausse confiance" (ADR-014/015/016) proscrit.
4. **Obligatoire, pas optionnel.** Une convention optionnelle est invérifiable — ça
   vide le ticket de sa raison d'être.
5. **Ne jamais fonder la convention sur le titre.** `COMMIT_OR_PR_TITLE` ne garantit
   rien sur main. Le label est la seule surface fiable.

## Hors scope (explicite)

Normaliser l'historique (squash-only + branch protection + interdiction des pushs
directs) est une conséquence structurante distincte → ADR séparé si poursuivi. La
présente convention est merge-agnostique : inchangée si la politique de merge est
durcie plus tard.

## Conséquences

Gate v2 robuste quelle que soit la stratégie de merge ; retrofit cheap (baseline
77 % → les 23 % restants reclassés `no-ticket`). Coût assumé : double oracle (API PR
+ trailers des commits directs), plus lourd qu'un grep `git log` — prix de
l'agnosticité. CLAUDE.md intègre la règle de label à l'ouverture de PR.

## Références

BACKLOG.md TK-31 · CLAUDE_PROJECT.md §Gate de cadrage · futur ticket gate backlog v2 ·
ADR-014/015/016 (rejet du motif "fausse confiance") · TK-37 (politique de merge — différé).
