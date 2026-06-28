# Meal Planner — Backlog

> Backlog unifié après le 1er test terrain. Combine les dettes résiduelles de Sprint 1
> et les feedbacks des amis testeurs. Ordonné par priorité de delivery.
> Convention effort : S (<1h) / M (~demi-journée) / L (~1 journée) / XL (plusieurs jours).

---

## P2 — Dette interne (invisible utilisateur)

### TK-09 — Nettoyage DAL sejours : double SELECT + Zod-first  ·  M
**Origine :** double SELECT (Claude Code, TK-03) + violation ADR-002 sur SejourDALInput (architect, TK-03).

Deux dettes DAL sur la même fonction, traitées en une passe.
- Double SELECT : le PATCH vérifie le token via getSejourById, puis updateSejour re-fetch.
- SejourDALInput défini à la main (sejours.ts:8-14), viole ADR-002 (Zod-first). Diverge déjà
  de CreateSejourBodySchema sur `nom`. TK-03 a ajouté un 2e consommateur sans corriger la source.

Sous-tâches :
- updateSejour ne re-fetch plus (passer le séjour, ou retirer le SELECT interne).
- SejourDALInputSchema = CreateSejourBodySchema.omit({participants:true}).extend({nom: z.string()})
  → z.infer. Supprimer le type manuel.
- Adapter signature + appelants (createSejour, updateSejour) + tests.

**Critères :** un PATCH = un seul SELECT. SejourDALInput inféré d'un schéma Zod. Tests verts.

> À faire avant tout 3e consommateur du DAL sejours.

### TK-10 — createSejour atomique via RPC  ·  M
**Origine :** architect (TK-03) + TODO inline sejours.ts:145-147 sorti du code.

createSejour fait une écriture multi-étapes non-atomique. updateSejour (TK-03) a établi le
pattern RPC transactionnel. Aligner createSejour pour tuer le risque de séjour partiellement créé.

Sous-tâches :
- Migration RPC create_sejour transactionnelle (sur le modèle de update_sejour).
- Refactor createSejour, supprimer le TODO inline.
- Tests succès + erreur.

**Critères :** une création échouée en cours de route ne laisse aucun enregistrement orphelin.

> Dépend de l'amendement d'ADR-006 (pattern RPC) fait en amont.



### TK-12 — Tests d'intégration TK-03  ·  M
**Origine :** allergen-guard + qa (TK-03), lacunes de couverture.

- pool_empty : aucun test ne lie {ok:false, kind:'pool_empty'} au HTTP 422 retourné au client.
- Flow TK-03 : PATCH séjour → re-génération → POST /planning sans E2E de bout en bout — le cœur
  de TK-03 n'a pas de test d'intégration.

Sous-tâches :
- Test route : pool_empty → 422.
- E2E Playwright : Sarah ajoute un participant, régénère, planning cohérent et sûr.

**Critères :** le flow de re-génération TK-03 couvert end-to-end ; mapping pool_empty→422 testé.

### TK-20 — Raffiner la taxonomie des ingrédients (garde déterministe porc/viande-rouge/alcool)  ·  M
**Origine :** ADR-011 §9 · trou résiduel documenté en Phase 2B.

La catégorie `viandes-poissons` est trop grossière pour distinguer porc, viande rouge, poisson
et fruits de mer. Résultat : les tags `sans-porc`, `sans-viande-rouge` et `sans-alcool` ne peuvent
pas être vérifiés automatiquement au build (contrairement à `sans-poisson`/`sans-fruits-de-mer`
qui s'appuient sur les allergènes EU14). La qualification actuelle est manuelle, gardée par
allergen-guard sur `data/ingredients/`.

Sous-tâches :
- Trancher le découpage : scinder `viandes-poissons` (ex. `viandes-rouges`, `viandes-blanches`,
  `charcuterie`, `poissons-fruits-de-mer`) et ajouter une catégorie `alcool`.
- Mettre à jour `IngredientCategorySchema` et la migration SQL (touche le CHECK initial).
- Étendre `ingredient-exclusion-completeness.ts` pour vérifier `sans-porc` et `sans-viande-rouge`
  depuis les nouvelles catégories.
- Test discriminant obligatoire : un lardon sans `sans-porc` DOIT faire échouer le build.

**Critères :** les tags `sans-porc`, `sans-viande-rouge`, `sans-alcool` sont enforced au build,
sans qualification manuelle nécessaire. Cousin de TK-13 (Trou A SQL/Zod).

> À séquencer après TK-05 Phase 2C (UI). Touche `IngredientCategorySchema` → passe architect.


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


### TK-21 — Violations séparées post-retry : allergènes ≠ exclusions  ·  S
**Origine :** revue TK-05 2C (architect/qa-engineer), ADR-011 §7.

`validation_failed_after_retries` agrège toutes les violations dans `lastViolations` au lieu de
distinguer `last_security_violations` (allergènes EU14, criticité P0) et `last_exclusion_violations`
(préférences alimentaires, criticité P1). La séparation garantie par ADR-011 §7 est cassée sur le
chemin rare post-retry : un log de debug indistinguable rend l'analyse d'incident difficile.

**Critères :** `validation_failed_after_retries` expose deux champs séparés ; tests discriminants.

> Chemin rare (post-retry), non-bloquant TK-05 2C. À traiter avant toute extension du validateur.

### TK-22 — Nettoyage zombies vocabulaire : DietaryRestrictionSchema / REGIME_LABELS / toggleRegime  ·  S
**Origine :** revue TK-05 2C (qa-engineer).

Résidus de l'ancien vocabulaire "régimes" non supprimés lors du renommage en "exclusions" :
`DietaryRestrictionSchema`, `REGIME_LABELS`, `toggleRegime` (et éventuellement des references
dans les tests). Ces symboles créent une confusion nomenclature et augmentent le risque de
régression silencieuse si une référence pointe vers l'ancien vocabulaire.

**Critères :** `grep -r "toggleRegime\|REGIME_LABELS\|DietaryRestrictionSchema"` retourne zéro hit.

> Purement cosmétique/dette nomenclature. Aucun risque de régression comportementale.

### TK-23 — Map non sérialisable en prop RSC→Client · S
`src/app/sejour/[id]/page.tsx` passe `recettes` en `Map<string,Recette>` à `SejourContent`
(Client). Non sérialisable au boundary RSC. Vérifier si c'est le cas aujourd'hui ; si oui,
passer en `Record<string,Recette>`. Latent mais réel.

### TK-24 — tool input_schema dérivé de Zod · S
`COMPOSE_PLANNING_TOOL` (`llm/client.ts`) duplique `LLMPlanningOutputSchema`. Générer l'`input_schema`
depuis le Zod (`zod-to-json-schema`). Cousin de TK-13.

### TK-25 — Sortir buildFilterConstraintsFromSejour des routes · S
Logique métier inline dans `planning/route.ts` → migrer dans `src/lib/allergens/filter.ts`.
Propreté archi, non urgent.

### TK-26 — État d'erreur UI explicite sur /sejour/[id] · S
Distinguer "pas encore généré" de "erreur de chargement" (`query_failed` / `row_validation_failed`
aujourd'hui silencieusement → null).

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
| TK-09 | Nettoyage DAL sejours | P2 | M | À faire |
| TK-10 | createSejour atomique via RPC | P2 | M | À faire |
| TK-12 | Tests d'intégration TK-03 | P2 | M | À faire |
| TK-13 | Source unique enums SQL + Zod (Trou A) | P2 | S | Fait |
| TK-14 | Règles de cohérence sémantiques restantes | V2 | — | À faire |
| TK-15 | Baseline schéma DB + source de vérité | P2 | M | Fait |
| TK-16 | Gate déploiement : schéma DB ↔ code | P2 | M | Fait |
| TK-17 | Seed : purge des orphelins | P2 | S/M | À faire |
| TK-18 | Bug hydratation ShareLink | P2 | S | Fait |
| TK-20 | Raffiner taxonomie ingrédients (garde déterministe porc/viande-rouge/alcool) | P2 | M | À faire |
| TK-21 | Violations séparées post-retry : allergènes ≠ exclusions | P2 | S | À faire |
| TK-22 | Nettoyage zombies vocabulaire DietaryRestrictionSchema / REGIME_LABELS | P2 | S | À faire |
| TK-23 | Map non sérialisable RSC→Client | P2 | S | À faire |
| TK-24 | tool input_schema dérivé de Zod | P2 | S | À faire |
| TK-25 | Sortir buildFilterConstraintsFromSejour des routes | P2 | S | À faire |
| TK-26 | État d'erreur UI explicite /sejour/[id] | P2 | S | À faire |
| TK-27 | Dark mode : trancher | P2 | S | À faire |
| TK-28 | Chargement ciblé du catalogue recettes | V2 | — | À faire |
| TK-30 | Cleanup CLAUDE_PROJECT.md (règles mécanisées) | P2 | S | À faire |
| TK-31 | Convention TK-XX commits (mini-ADR) | P2 | S | À faire |
| TK-32 | Garde read-contract.ts ↔ selects DAL réels | P2 | S | Fait |
| TK-33 | Gate CI DAL reads ⊆ READ_CONTRACT — AST + file:line | P2 | S | Fait |
| TK-34 | Unifier checkers DAL AST (TK-32/33) en un seul précis+large — ADR-016 | P2 | S | Fait |

**Ordre conseillé :** TK-31 d'abord (préalable gate backlog v2) → dette data/DAL (TK-09, TK-10, TK-12, TK-20) quand le fonctionnel est stable → nettoyage/archi S (TK-21, TK-22, TK-23, TK-24, TK-25, TK-26, TK-27, TK-30) → V2 (TK-08, TK-14, TK-28).
