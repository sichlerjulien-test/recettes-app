# Backlog — Archive (Fait / Annulé)

> Append-only. Une ligne par ticket clos, jamais réédité (ADR-026). Source du
> statut vivant : `BACKLOG.md` § Vue d'ensemble. Mapping TK→PR mécanisé par
> ADR-020 (label PR) ; cette archive n'est qu'un index de clôture, pas une
> 2e source de vérité.

| Ticket | Titre | Statut | Réf |
|--------|-------|--------|-----|
| TK-12 | Tests d'intégration TK-03 | Fait | PR #47, #49, #50 |
| TK-13 | Source unique enums SQL + Zod (Trou A) | Fait | ADR-015 |
| TK-15 | Baseline schéma DB + source de vérité | Fait | PR #35, #37 — ADR-013 |
| TK-16 | Gate déploiement : schéma DB ↔ code | Fait | PR #39, #40 |
| TK-18 | Bug hydratation ShareLink | Fait | PR #45/#46 |
| TK-21 | Violations séparées post-retry : allergènes ≠ exclusions | Fait | PR #59 |
| TK-24 | tool input_schema dérivé de Zod | Fait | PR #61 |
| TK-25 | Sortir buildPlanningConstraints des routes | Fait | PR #64 |
| TK-27 | Dark mode : trancher | Fait | PR #64 — ADR-019 |
| TK-30 | Cleanup CLAUDE_PROJECT.md (règles mécanisées) | Annulé | PR #70 — prémisse infirmée |
| TK-31 | Convention TK-XX commits | Fait | PR #67 — ADR-020 |
| TK-32 | Garde read-contract.ts ↔ selects DAL réels | Fait | PR #41 |
| TK-33 | Gate CI DAL reads ⊆ READ_CONTRACT — AST + file:line | Fait | commit f054641 |
| TK-34 | Unifier checkers DAL AST (TK-32/33) — ADR-016 | Fait | PR #43, #44 |
| TK-38 | Afficher les recettes dans le planning | Fait | PR #76 |
| TK-39 | Recalibrer la non-répétition pour les séjours longs | Fait | PR #77 — amendement ADR-009 |
| TK-40a | Diagnostic de couverture du catalogue | Fait | PR #78 |
| TK-41 | Régénération partielle d'un repas | Fait | PR #79 — ADR-021 |
| TK-42 | Créneau « resto / non cuisiné » | Fait | PR #80 — ADR-022 |
| TK-43 | (optionnel) Feedback in-app loggé Supabase | Fait | PR #83, #84 |
| TK-44 | Polish install PWA | Fait | PR #86 |
| TK-51 | Flash retour au formulaire entre génération et affichage du planning | Fait | PR #88 |
| TK-54 | Drop policies RLS allow_all_mvp | Fait | PR #82 |
| TK-55 | Plafond de générations par séjour | Fait | PR #95 — ADR-023 |
| TK-58 | Corriger commentaire mensonger SejourSchema (HMAC vs UUID) | Fait | PR #102 |
| TK-59 | dbErrorToResponse : fuite messages Supabase bruts en 500 | Fait | PR #104 |
| TK-60a | Headers de sécurité statiques (next.config) | Fait | PR #109 |
| TK-65 | ADR-020 décrit un push direct impossible | Fait | PR #105 |
| TK-66 | Gate CI anti-interpolation internals dans jsonError | Fait | PR #106 — ADR-025 |
| TK-67 | DbError.entity : z.string() → z.enum | Fait | PR #107 |
| TK-71 | Exposer marquage resto/non cuisiné au formulaire de séjour | Fait | PR #114 |
| TK-63 | Même flash overlay/formulaire sur le flow de régénération | Fait | PR #116 |
| TK-69 | ADR-026 : statut source unique + archive append-only | Fait | PR #110 — ADR-026 |
| TK-70 | Gate CI check-backlog.ts (invariants ADR-026) | Fait | PR #111 |
