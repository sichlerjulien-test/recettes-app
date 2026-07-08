# ADR-020 — Convention de référencement ticket ↔ travail (TK-31)

**Statut** : Accepté
**Date** : 2026-07-01
**Amendé** : 2026-07-08 (TK-65) — la clause « résidu push direct » est retirée : le
             ruleset `ci-gate` (actif depuis 2026-06-05, `pull_request` required,
             `current_user_can_bypass: never`) rejette tout push direct sur main,
             docs-only inclus. Le résidu qu'elle visait à couvrir n'existe pas.
**Lié à** : préalable au gate backlog v2 · DoR (CLAUDE_PROJECT.md §Gate de cadrage) ·
            découple explicitement la politique de merge (hors scope — voir BACKLOG.md)

## Contexte

Le gate backlog v2 doit vérifier mécaniquement que chaque ticket "Fait" est couvert
par du travail mergé. Vérif terrain (2026-07-01) : `main` est mixte — squash, merge
commits et pushs directs coexistent ; les trois stratégies sont ouvertes côté GitHub ;
squash title en `COMMIT_OR_PR_TITLE`. Conséquence dure : `git log main` n'est pas un
oracle fiable — le `TK-XX` n'est pas garanti d'atterrir sur le sujet du commit main.

## Décision

1. **Surface unique = label de PR.** Toute PR mergée porte exactement un label
   `TK-XX` (ou `no-ticket`). Le gate v2 lit PR→label via l'API GitHub — agnostique
   à la stratégie de merge.
2. **Exemption explicite obligatoire** : `no-ticket`, jeton unique. Sans déclaration
   positive, "sans ticket" est indiscernable de "oublié" → couverture invérifiable.
   Motif "fausse confiance" (ADR-014/015/016) proscrit.
3. **Obligatoire, pas optionnel.** Une convention optionnelle est invérifiable — ça
   vide le ticket de sa raison d'être.
4. **Ne jamais fonder la convention sur le titre.** `COMMIT_OR_PR_TITLE` ne garantit
   rien sur main. Le label est la seule surface fiable.

## Hors scope (explicite)

Cette convention ne visait à l'origine que le référencement, pas la politique de
merge — voir TK-37 (différé). Le durcissement de l'historique (PR obligatoire) est
depuis arrivé par un autre chemin, le ruleset `ci-gate` (2026-06-05), indépendamment
de cet ADR. La présente convention reste inchangée par ce fait : elle décrivait déjà
le label PR comme seule surface fiable.

## Conséquences

Gate v2 robuste quelle que soit la stratégie de merge ; retrofit cheap (baseline
77 % → les 23 % restants reclassés `no-ticket`). CLAUDE.md intègre la règle de label
à l'ouverture de PR.

## Références

BACKLOG.md TK-31 · CLAUDE_PROJECT.md §Gate de cadrage · futur ticket gate backlog v2 ·
ADR-014/015/016 (rejet du motif "fausse confiance") · TK-37 (politique de merge — différé).
