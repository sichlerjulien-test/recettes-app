# ADR-017 — Frontière LLM dans les tests : jamais en E2E, sûreté prouvée au niveau déterministe

**Statut** : Accepté
**Date** : 2026-06-28
**Auteur** : Équipe Meal Planner
**Lié à** : étend ADR-010 (E2E hors gate pré-merge, intégrité du signal) ·
            s'appuie sur ADR-001 (forteresse allergènes déterministe) et
            ADR-009 (validateurs déterministes post-LLM)

## Contexte

Le cadrage de TK-12b a rouvert une question latente : comment un test E2E couvre-t-il
un flow « qui doit produire un planning sûr et cohérent » ? Trois options se présentaient :
LLM live (non déterministe, coûteux, flaky), planning mocké en dur asserté sur la réponse
(vacuité : on teste que l'UI affiche ce qu'on lui sert), ou pipeline réel sous LLM stubbé.
La formulation « cohérent et sûr » dans un E2E est un piège : c'est le « ça marche mieux »
que le gate de cadrage interdit, et le choix d'implémentation engageait l'architecture de
test bien au-delà d'un ticket.

## Décision

La frontière LLM est exclue de toute couverture E2E. Concrètement :

1. Les tests E2E (Playwright) ne dépendent jamais du LLM réel et n'assertent jamais une
   propriété de **sûreté** (absence d'allergène) ni de **cohérence** (structure journalière,
   doublons, unicité de l'ingrédient principal).
2. Ces propriétés sont prouvées exclusivement au niveau **lib déterministe**
   (`generate-planning.test.ts`, `src/lib/allergens/validator.ts`, `src/lib/coherence/`).
3. Le **wiring** de re-génération est prouvé au niveau **route**, avec `generatePlanning`
   stubbé : on asserte les contraintes reçues et la persistance, pas une sortie LLM.
4. L'E2E ne prouve qu'une chose : le **wiring UI** — l'interface émet les bonnes requêtes
   avec la bonne charge et réagit correctement aux réponses (mockées).

## Conséquences

Positives : le signal de sûreté reste déterministe et reproductible ; les E2E restent
rapides, mockés, et hors gate (ADR-010) sans rien perdre ; « cohérent et sûr » cesse
d'être une assertion E2E impossible et redevient une garantie lib.

Coût assumé : aucun test automatisé ne couvre « le vrai LLM produit un planning sûr de
bout en bout ». C'est délibéré — la sûreté est garantie en amont par le filtre pré-LLM et
les validateurs post-LLM, que le LLM hallucine ou non. Si un smoke test live est un jour
souhaité, il vivra hors CI (manuel ou scheduled), jamais dans le gate.

## Alternatives écartées

- **E2E avec LLM live.** Flaky, coûte de l'argent, non déterministe ; et ADR-010 gardant
  déjà l'E2E hors gate, un test de sûreté hors gate est un faux filet. Rejetée.
- **E2E avec planning mocké asserté sur la réponse.** Teste que l'UI affiche ce qu'on lui
  donne — prouve zéro propriété réelle. Rejetée.

## Références
- ADR-010 (gate CI, E2E hors gate) · ADR-001 (filtre + validateur allergènes) ·
  ADR-009 (validateurs post-LLM).
- `src/lib/llm/generate-planning.ts`, `src/lib/llm/generate-planning.test.ts`,
  `src/lib/coherence/`, `e2e/exclusions.spec.ts`.
- TK-12b-route, TK-12b-e2e.
