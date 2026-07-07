# ADR-023 — Plafond de générations par séjour (rate limiting, cap console)

**Statut :** Accepté (2026-07-07)

## Contexte

`POST /api/sejours/:id/planning` déclenche un appel LLM payant sans aucune
borne : un client (buggé ou malveillant) peut faire boucler la génération
sur un même séjour et générer un coût imprévu. Le per-IP est explicitement
hors scope de ce ticket (ligne dormante, cf. Conséquences).

## Décision

1. **Plafond par séjour = compteur DB natif.** `countPlanningsBySejourId`
   (`src/lib/db/plannings.ts`) fait un `COUNT` sur la table `plannings`
   filtrée par `sejour_id`. La route compare ce compte à `GENERATION_CAP`
   (constante nommée, valeur = 20) avant d'appeler `generatePlanning`. Au
   plafond : 429 `generation_cap_reached`, `generatePlanning` n'est **jamais**
   invoqué — même discipline que `pool_empty` (ADR-004) : pas d'appel LLM
   quand la garde est activée.

   **Upstash rejeté** : dépendance et infrastructure injustifiées à cette
   échelle (un compteur DB fait le travail, pas de nouveau service à
   opérer).

2. **Le compteur protège la disponibilité, pas le portefeuille.** Un séjour
   abusif est stoppé (dégradation gracieuse), le produit reste debout pour
   les autres séjours. La protection contre le coût catastrophique réel est
   un **budget cap mensuel posé manuellement dans la console Anthropic**
   (action hors code, preuve collée dans la PR TK-55). Le code ne remplace
   pas cette protection, il la complète.

3. **Amende ADR-006 §5** : le format d'erreur unifié gagne un kind API de
   première classe, `generation_cap_reached` → 429. Comme `pool_empty`, il
   est distinct de `business_error` car le client doit pouvoir le
   discriminer (message dédié, pas de retry immédiat côté UI).

   Table HTTP mise à jour :
   - `generation_cap_reached` : 429 (Too Many Requests)

4. **Rate limiting per-IP : différé**, ligne dormante en BACKLOG. Seuil de
   réveil : le cap console est effectivement approché, OU du martèlement
   est visible en logs. Pas de ticket rédigé tant que ce seuil n'est pas
   atteint.

5. **TOCTOU non traité.** Deux requêtes concurrentes qui lisent
   `count = GENERATION_CAP - 1` en parallèle peuvent toutes deux passer le
   garde-fou et produire un dépassement transitoire du plafond. Assumé à
   cette échelle (trafic mono-utilisateur par séjour, fenêtre de course
   étroite) — pas de verrou introduit pour ce ticket.

## Conséquences

### Positives
- Zéro dépendance, zéro infrastructure nouvelle : un `COUNT` sur une table
  déjà là.
- Zéro migration : `plannings` est déjà append-only (`createPlanning` fait
  systématiquement un `insert`, jamais un upsert — vérifié pour la
  génération initiale et pour le swap/régénération TK-41/ADR-021).

### Négatives
- Le swap (TK-41) insère aussi une row `plannings` sans appeler
  `generatePlanning`. Il consomme donc du "budget" de comptage sans
  appeler le LLM : un séjour qui swap beaucoup atteint le plafond de
  génération plus vite qu'un séjour qui ne fait que des générations
  complètes. Ce n'est pas un bug (le plafond reste plus conservateur, pas
  moins protecteur), mais c'est documenté ici pour éviter la surprise. Non
  traité — `GENERATION_CAP = 20` est volontairement généreux.
- TOCTOU non traité (point 5).
- Per-IP différé (point 4) : le trou "un même visiteur multiplie les
  séjours" reste ouvert jusqu'au seuil de réveil.

## Alternatives écartées

### Alternative A — Upstash / rate limiter externe
Rejeté : dépendance et opération d'un service externe pour un besoin que
resout un `COUNT` SQL. Reconsidérer si le rate limiting per-IP devient
nécessaire et qu'un besoin de fenêtre glissante distribuée apparaît.

### Alternative B — Verrou / transaction pour fermer le TOCTOU
Ajoute de la complexité (lock DB ou contrainte transactionnelle) pour une
fenêtre de course qui ne cause qu'un dépassement transitoire à cette
échelle de trafic. Écarté pour ce ticket ; à reconsidérer si le plafond
devient un mécanisme de facturation stricte plutôt qu'une garde de
disponibilité.

## Références
- ADR-004 : `PoolEmptyError`, discipline "pas d'appel LLM" sur garde-fou
- ADR-006 §5 : format d'erreur API unifié (amendé ici)
- ADR-017 : frontière LLM dans les tests (LLM toujours stubbé)
- ADR-020 : convention TK-refs
- ADR-021 : régénération partielle / swap picker (TK-41)
