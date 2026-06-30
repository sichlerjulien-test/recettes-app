# Meal Planner — Backlog

> Backlog unifié après le 1er test terrain. Combine les dettes résiduelles de Sprint 1
> et les feedbacks des amis testeurs. Ordonné par priorité de delivery.
> Convention effort : S (<1h) / M (~demi-journée) / L (~1 journée) / XL (plusieurs jours).

---

## P2 — Dette interne (invisible utilisateur)


### TK-12 — Tests d'intégration TK-03  ·  M  ✅ Livré

**Origine :** allergen-guard + qa (TK-03), lacunes de couverture.

- pool_empty : aucun test ne lie {ok:false, kind:'pool_empty'} au HTTP 422 retourné au client.
- Flow TK-03 : PATCH séjour → re-génération → POST /planning sans E2E de bout en bout — le cœur
  de TK-03 n'a pas de test d'intégration.

Sous-tâches :
- ~~Test route : pool_empty → 422.~~ (TK-12a — #47, #50)
- ~~E2E Playwright : Sarah ajoute un participant, régénère, planning cohérent et sûr.~~ (TK-12b — #49 + tk-12b-route ; ADR-017 : frontière LLM hors E2E → remplacé par RTL + test route)

**Critères :** le flow de re-génération TK-03 couvert end-to-end ; mapping pool_empty→422 testé.

### TK-20 — [DORMANT] Réouverture conditionnelle du garde catégorie porc/viande-rouge/alcool
**Origine :** ADR-011 §9 (amendé 2026-06-11). Requalifié de tâche en déclencheur de réouverture.

NE PART PAS EN EXÉCUTION en l'état. L'approche que ce ticket décrivait — scinder
`viandes-poissons` + garde déterministe grade-allergène sur `sans-porc`/`sans-viande-rouge`/
`sans-alcool` — a été explicitement REJETÉE par ADR-011 §9, pour deux raisons :
  1. Blast radius : scinder la catégorie touche le calcul végé/vegan qui lit la catégorie
     coarse (logique déjà extraite et testée).
  2. Sur-calibrage de sévérité : imposer une garantie grade-allergène à une exclusion dont
     l'erreur gâche un repas (pas l'hôpital) = la confusion de catégories qu'ADR-001 interdit,
     en sens inverse.

Déjà livré à la place (régime 2, « curation tracée », enforced en CI) : `TRIAGE_PORC` /
`TRIAGE_VIANDE_ROUGE` / `TRIAGE_ALCOOL` dans `scripts/ingredient-exclusion-completeness.ts`,
tests discriminants, invariant croisé tag→catégorie. Le « enforced au build » est donc déjà
acquis ; seul le « sans qualification manuelle » est délibérément non fait.

**Seuils de réouverture (un seul suffit) :**
  - le catalogue grossit au point que la curation manuelle n'est plus fiable, OU
  - une erreur d'exclusion non-allergène atteint un utilisateur en conditions réelles.

Tant qu'aucun seuil n'est franchi (état actuel : ~11 ingrédients triés, zéro signalement
terrain), la curation tracée tient et il n'y a rien à exécuter. Si un seuil tombe : rouvrir
ADR-011 §9 avec la donnée, ne pas pousser ce ticket tel quel.

**Résidu connexe, hors TK-20 :** limite volaille (un poulet mal catégorisé reste à tort
végétarien sans déclencher l'invariant croisé). Fix candidat documenté : champ
`nature: animal|vegetal`. Choix structurant → architect + amendement ADR avant tout cadrage.
Risque de cohérence végé (gâche un repas), pas de sûreté allergène. Faible priorité.


### TK-15 — Baseline de schéma DB + source de vérité unique  ·  M
**Origine :** incident 500 /shopping-list. Cause racine : aucune migration ne reproduit le schéma courant from scratch.

Dev et prod ont dérivé librement parce que les changements de schéma ont été appliqués hors système de migration (dashboard, ALTER manuels). Prod avait une génération de retard ET des colonnes héritées que dev n'a plus. Le repo ne sait pas reconstruire le schéma actuel. Tant que ce socle manque, l'incident se rejoue à la prochaine divergence.

Sous-tâches :
- Générer une migration baseline capturant le schéma canonique actuel (dump du schéma dev).
- Mettre en place le suivi des migrations appliquées (si absent), pour que dev/prod/futures instances convergent depuis cette baseline.
- Règle dure : tout changement de schéma = une migration committée, appliquée à TOUS les environnements. Fin du SQL dashboard hors-migration.
- Rédiger l'ADR : le schéma DB a une source de vérité unique versionnée.
- `001-initial-schema.sql` ne contient plus les FK `participants→sejours` et `plannings→sejours` (recréées en live via ALTER TABLE). Les régénérer dans le schéma de référence ou ajouter `002-restore-foreign-keys.sql`.

**Critères :** une instance vierge reconstruit le schéma actuel en appliquant les migrations du repo ; dev et prod sont prouvés identiques à la baseline.

> Le plus haut levier du P2 : c'est le seul ticket qui empêche un nouvel outage prod, pas du cleanup invisible. À séquencer avec TK-06 avant la dette DAL cosmétique (TK-09/10).

### TK-16 — Gate de déploiement : schéma DB cible ↔ attentes du code  ·  M
**Origine :** incident 500 /shopping-list. Une colonne requise par un schéma Zod n'existait pas en prod, et rien ne l'a signalé avant le 500.

Au déploiement (ou en CI), vérifier que le schéma de la DB cible correspond à ce que le code exige : toute colonne requise par un schéma Zod de lecture doit exister, avec type et nullabilité corrects.

Sous-tâches :
- Confronter les schémas Zod de lecture au schéma réel de la DB cible.
- Une colonne Zod-requise absente (ou de type/nullabilité divergente) = déploiement bloqué.
- Test discriminant : une divergence introduite volontairement doit faire échouer le gate, pas atterrir en 500 prod.

**Critères :** une divergence schéma DB ↔ attentes Zod est bloquée avant la prod. Cousin de TK-06 (gate CI) et TK-13 (sync Zod↔CHECK) — à traiter dans le même chantier.

### TK-17 — Seed upsert-only : purge des orphelins  ·  S/M
**Origine :** observé pendant l'incident (sans le causer — total restait à 166).

`build-data` upsert sur `onConflict: 'id'` et ne supprime jamais. Si un id quitte le YAML, l'ancienne ligne reste orpheline en base indéfiniment. Trou structurel, pas un bug actif aujourd'hui.

Sous-tâches :
- Option A : seed "YAML = vérité", supprime en base ce qui n'y est plus (attention FK `recette_ingredients`).
- Option B : job de détection des orphelins (alerte, pas suppression auto).

**Critères :** aucun ingrédient/recette hors-YAML ne subsiste après seed, ou détection explicite. Priorité basse, candidat V2.


### TK-21 — Violations séparées post-retry : allergènes ≠ exclusions  ·  S  ✅ Livré
**Origine :** revue TK-05 2C (architect/qa-engineer), ADR-011 §7.

`validation_failed_after_retries` agrège toutes les violations dans `lastViolations` au lieu de
distinguer `last_security_violations` (allergènes EU14, criticité P0) et `last_exclusion_violations`
(préférences alimentaires, criticité P1). La séparation garantie par ADR-011 §7 est cassée sur le
chemin rare post-retry : un log de debug indistinguable rend l'analyse d'incident difficile.

**Critères :** `validation_failed_after_retries` expose deux champs séparés ; tests discriminants.

### TK-27 — Dark mode : trancher · S
Soit tokens dark propres, soit documenter light-only. Dette consciente Sprint 1, faible pri.

### TK-30 — Cleanup CLAUDE_PROJECT.md : supprimer les règles mécanisées par end-session · S
**Origine :** clôture session post-TK-29 (gate end-session).

Les règles de discipline couvertes mécaniquement par `npm run end-session` restent documentées en double dans CLAUDE_PROJECT.md. Double comptabilité → risque de divergence si l'une évolue sans l'autre.

**Critères :** les règles couvertes par end-session sont retirées de CLAUDE_PROJECT.md ; la source de vérité est le script, pas le doc.

> Pas de risque comportemental. Tâche côté Project (édition du doc).

### TK-32 — Garde read-contract.ts ↔ selects DAL réels · S
Vérifier que chaque colonne déclarée dans `read-contract.ts` est effectivement lue par une
requête du DAL, et que chaque colonne lue par le DAL figure dans `read-contract.ts`. Contrat
statique seul (TK-16 Modèle A) : si une colonne disparaît du DAL sans être retirée du contrat,
aucun gate ne le détecte.

**Critères :** un écart `read-contract.ts` ↔ selects DAL réels est détecté en CI.

> Complément naturel de TK-16 Modèle A. Requiert AST ou grep structuré sur les requêtes DAL.

> **Note (2026-06-27) :** Le parser de `check-read-contract.ts` cible `schema/canonical.sql`
> (DDL, blocs `CREATE TABLE`) — pas la section `COL` produite par `introspect-schema.sql`
> (introspection live). Si `canonical.sql` présente des variantes de formatage non couvertes
> par le regex (colonnes en `"guillemets"`, `CONSTRAINT` imbriqué, indentation non standard),
> le parser peut manquer des colonnes silencieusement. TK-33 couvre le durcissement du parser ;
> TK-32 peut ensuite s'appuyer dessus pour la garde DAL ↔ contrat.

### TK-33 — Durcir + tester le parser canonical.sql de check-read-contract.ts · S
**Origine :** note de fin de session TK-16 / TK-32.

Le parser de `check-read-contract.ts` extrait les colonnes des blocs `CREATE TABLE` de
`schema/canonical.sql` via regex. Guillemets (`"colonne"`) et `CONSTRAINT` inline sont déjà
gérés. Les cas restants non couverts :
- indentation non standard (tabulations, espaces multiples)
- `CONSTRAINT` sur ligne séparée (multi-ligne)

Un parser qui rate ces cas manque des colonnes **silencieusement** — aucune erreur, faux-positif
de conformité.

**Critères :**
- Au moins un test unitaire par cas manquant (indentation non standard, `CONSTRAINT` multi-ligne)
- Le parser passe tous les cas sans régression sur les cas existants
- CI verte (`typecheck` + `test` + `validate`)

> Prérequis de TK-32 : la garde DAL ↔ contrat ne peut être fiable que si le parser
> en amont est couvert. À faire avant ou en même temps que TK-32.

### TK-31 — Convention TK-XX dans les commits : mini-ADR · S
**Origine :** clôture session post-TK-29 · préalable au gate backlog v2.

Aucune règle formelle ne définit si/comment le numéro de ticket doit apparaître dans les commits. Le gate backlog v2 ne peut pas vérifier la couverture si la convention est floue.

**Critères :** un mini-ADR tranche la convention (obligatoire/optionnel, format, scope) ; le gate backlog v2 s'y réfère.

> **Préalable au gate backlog v2.** À trancher en session dédiée, avant tout ticket d'exécution qui ajouterait une règle dépendante.

### TK-36 — Fixture tajine-agneau-soir : nom incohérent avec ingredient_principal  ·  S/trivial
**Origine :** fausse violation cohérence dans Test A (TK-21).

Trois informations contradictoires sur le même fixture : nom « agneau », `ingredient_principal`
`'boeuf'`, et ingrédients sans viande. Un sweep des usages est requis avant le fix : plusieurs
tests (profils coeliaque / allergies-multiples) s'appuient sur `'boeuf' ≠ 'legumes'` pour ce
fixture — aligner naïvement le nom sans adapter les assertions les casserait.

**Critères :** `nom`, `ingredient_principal`, et ingrédients du fixture sont cohérents entre eux ;
CI verte après sweep des tests dépendants.

---

### TK-35 — [DORMANT] canonical.sql : génération pg_dump déterministe cross-machine
**Origine :** clôture TK-10. schema-replay rouge sur PR #54, cause non traitée.

`schema/canonical.sql` est un `pg_dump` brut (ADR-013 §3). Sa forme dépend de la version de
pg_dump qui le génère : Homebrew/Mac trie les fonctions par OID de création + 2 lignes vides
avant `ALTER FUNCTION` (CREATE OR REPLACE sans DROP) ; Ubuntu/pgdg (la CI) trie
alphabétiquement + 1 ligne vide. Le replay CI diff contre canonical → rouge purement
cosmétique, sans rapport avec le schéma. En TK-10, régénéré à la main pour matcher la CI.
La cause demeure : le prochain dump depuis un Mac reproduit l'écart.

Décision active : on absorbe à la main (solo, mono-machine — douleur latente, pas active).
Choix explicite, PAS un oubli.

NE PART PAS EN EXÉCUTION en l'état — porte un fork structurant à trancher avant cadrage :
  - Normaliser le dump (tri + whitespace avant diff) redéfinit ce que canonical.sql EST :
    il cesse d'être un pg_dump brut → amendement ADR-013 §3 (on touche l'oracle de diff).
  - Figer la version pg_dump (conteneur de génération) ne touche pas l'oracle, contraint sa
    production (tout contributeur génère via le conteneur) → conséquence opérationnelle.
Les deux voies divergent sur ce qu'on sanctuarise → architect + ADR (vraisemblablement
amendement ADR-013), pas un choix d'exécutant. Penchant courant : conteneur > normalisation
(ne pas glisser une couche de traitement entre la réalité et l'oracle qui a fermé l'incident
500).

Réouverture (un seul suffit) : 2e contributeur sur OS différent · changement de ta machine
ou de version pg_dump locale · prochaine divergence replay non liée au schéma réel.

---

## V2 — Hors MVP (noté pour mémoire)

### TK-28 — Chargement ciblé du catalogue recettes · V2
Page séjour charge le catalogue complet. Jointure SQL / fetch par `recette_id`. Sans objet
<100 recettes, structurant à 500.

### TK-08 — Optimisation réutilisation des ingrédients entre recettes
**Origine :** feedback 9 · point C validé (report assumé).

Orienter le choix des recettes pour que les ingrédients entamés soient réutilisés (le chou-fleur acheté entier mais à moitié utilisé sert ailleurs). Problème d'optimisation combinatoire — terrain à hallucinations LLM, à ne pas mélanger avec la réparation du moteur (TK-01). La part récupérable (affichage du surplus) est déjà adressée gratuitement par TK-02.

### TK-14 — Règles de cohérence sémantiques restantes
**Origine :** hors-scope assumé d'ADR-009 · report V2 décidé après le merge de l'extraction.

Structure journalière, non-répétition de recette et unicité de l'ingrédient principal/jour
sont faites (TK-01) et désormais isolées dans `src/lib/coherence/`. Reste la variété des
types de cuisine sur le séjour — listée comme règle dure en §4 de CLAUDE_PROJECT.md mais
jamais implémentée. Reportée V2 : son absence dégrade le confort (séjour monotone), pas la
sûreté ni la cohérence structurelle.

Hors de ce ticket : le respect de l'équipement est déjà garanti par le filtre pré-LLM
(pas de four sans four). Le "backstop équipement" post-LLM évoqué en hors-scope d'ADR-009
n'est qu'une redondance ceinture+bretelles, pas une règle manquante — ne pas le confondre
avec un trou.

---

## Hors backlog — va dans les instructions du Project

**Feedback 10** (philosophie "bonne bouffe entre copains") : critère de curation des recettes, intégré à CLAUDE_PROJECT.md. Pas un ticket.

---

## Vue d'ensemble

| Ticket | Titre | Priorité | Effort | Statut |
|--------|-------|----------|--------|--------|
| TK-08 | Réutilisation ingrédients | V2 | — | À faire |
| TK-12 | Tests d'intégration TK-03 | P2 | M | Fait |
| TK-13 | Source unique enums SQL + Zod (Trou A) | P2 | S | Fait |
| TK-14 | Règles de cohérence sémantiques restantes | V2 | — | À faire |
| TK-15 | Baseline schéma DB + source de vérité | P2 | M | Fait |
| TK-16 | Gate déploiement : schéma DB ↔ code | P2 | M | Fait |
| TK-17 | Seed : purge des orphelins | P2 | S/M | À faire |
| TK-18 | Bug hydratation ShareLink | P2 | S | Fait |
| TK-20 | [DORMANT] Réouverture conditionnelle garde porc/viande-rouge/alcool | P2 | — | Dormant |
| TK-21 | Violations séparées post-retry : allergènes ≠ exclusions | P2 | S | Fait |
| TK-24 | tool input_schema dérivé de Zod | P2 | S | Fait |
| TK-25 | Sortir buildPlanningConstraints des routes | P2 | S | Fait |
| TK-27 | Dark mode : trancher | P2 | S | À faire |
| TK-28 | Chargement ciblé du catalogue recettes | V2 | — | À faire |
| TK-30 | Cleanup CLAUDE_PROJECT.md (règles mécanisées) | P2 | S | À faire |
| TK-31 | Convention TK-XX commits (mini-ADR) | P2 | S | À faire |
| TK-32 | Garde read-contract.ts ↔ selects DAL réels | P2 | S | Fait |
| TK-33 | Gate CI DAL reads ⊆ READ_CONTRACT — AST + file:line | P2 | S | Fait |
| TK-34 | Unifier checkers DAL AST (TK-32/33) en un seul précis+large — ADR-016 | P2 | S | Fait |
| TK-35 | [DORMANT] canonical.sql génération pg_dump déterministe | P2 | — | Dormant |
| TK-36 | Fixture tajine-agneau-soir : nom incohérent avec ingredient_principal | P2 | S/trivial | À faire |

**Ordre conseillé :** TK-31 d'abord (préalable gate backlog v2) → nettoyage/archi S (TK-25, TK-27, TK-30, TK-36) → V2 (TK-08, TK-14, TK-28). TK-20 est DORMANT (seuil de réouverture non atteint).

> **Convention (acté 2026-07-01) :** Le tableau récap est un index d'état — les lignes "Fait" sont conservées.
