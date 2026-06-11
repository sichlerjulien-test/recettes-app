# Meal Planner — Backlog

> Backlog unifié après le 1er test terrain. Combine les dettes résiduelles de Sprint 1
> et les feedbacks des amis testeurs. Ordonné par priorité de delivery.
> Convention effort : S (<1h) / M (~demi-journée) / L (~1 journée) / XL (plusieurs jours).

---

## P0 — Bloquant avant un test élargi

### TK-01 — Moteur de planning cohérent  ·  XL  ·  ✅ Fait
**Origine :** feedbacks 4, 5, 8 · angle mort phase 1 jamais tranché.

Le moteur produit des plannings incohérents. C'est la priorité absolue : tant qu'il est cassé, tout le reste est du polish sur une fondation bancale.

Sous-tâches :
- Structure journalière stricte : exactement 1 petit-déj + 1 midi + 1 soir par jour, dans l'ordre chronologique. Jamais plusieurs midis le même jour.
- Contrainte de non-répétition : pas deux fois la même recette sur un séjour.
- Pas deux fois le même ingrédient principal en 24h.
- Expansion du catalogue de recettes pour nourrir la variété (le LLM se répète quand le pool filtré est trop maigre).

**Critères d'acceptation :** un séjour de N jours produit exactement N petits-déj, N midis, N soirs, ordonnés, sans recette dupliquée. Validé par le validateur déterministe post-LLM.

### TK-02 — Bug d'arrondi des unités d'achat  ·  ✅ Fait (effort réel : S, pas L)

Le "0.3 piece de chou-fleur" n'était PAS un problème de modèle de données.
Le schéma committé (`unite_base`/`unite_achat`/`conversion`) suffisait. Deux
bugs dans `build-list.ts` uniquement :
- arrondi cumulatif (`Math.ceil` par occurrence avant sommation → biais haut) ;
- pas de `Math.ceil` final sur les unités discrètes (piece/botte/sachet).

Fix : accumulation brute + `finalize()` qui arrondit une fois selon le type
d'unité. ~12 lignes, zéro champ nouveau, zéro migration DB.

> Leçon d'estimation : ticket coté L parce que mal cadré (faux "refactor de
> modèle"). Le vrai défaut était une régression de logique runtime. Quand un
> ticket gonfle, vérifier d'abord que le problème est bien là où on le croit.

Résidu éventuel (PAS le modèle de données) : afficher l'unité en français
("1 chou-fleur" plutôt que "1 piece"). À vérifier dans `src/lib/ui/labels.ts`
— c'est peut-être déjà géré. Si non, c'est un ticket UI S, distinct.

### TK-03 — Édition d'un séjour + flow de génération  ·  L  ·  ✅ Fait
**Origine :** feedbacks 3 et 2 (même zone de code · point A validé).

Aujourd'hui la page séjour est un cul-de-sac : impossible de revenir modifier les inputs, ajouter une personne, ajuster une contrainte. Et le clic "générer le planning" paraît inutile faute d'être expliqué.

Sous-tâches :
- À la validation du formulaire : génération directe du planning (supprime le clic perçu comme inutile) avec écran de chargement explicite.
- Rendre le séjour éditable après création : modifier participants, contraintes, paramètres.
- Une réédition propose de régénérer le planning (la génération coûte un appel LLM — pas de re-génération silencieuse à chaque micro-changement).

**Critères d'acceptation :** Sarah peut ajouter un participant oublié après création et régénérer, sans recréer le séjour de zéro.

### TK-04 — Bug inputs number iPhone Safari  ·  S  ·  ✅ Fait
**Origine :** feedback 1 · dette pré-pause confirmée terrain.

Le "zéro fantôme" persiste à l'affichage quand on modifie une quantité sur smartphone. Fix connu : passer les inputs `type="number"` en `type="text" inputMode="numeric"`, ajuster le schema Zod si besoin.

**Critères d'acceptation :** modifier une quantité sur iPhone Safari ne laisse pas de 0 fantôme.

> Victoire rapide. Bon candidat pour ouvrir une session avant d'attaquer TK-01.

---

## P1 — Important, juste après le P0

### TK-05 — Exclusions alimentaires (distinctes des allergènes)  ·  M  ·  ✅ Fait

**Origine :** feedback 6 · point B validé.

Un participant doit pouvoir exclure viande rouge, porc, etc. sans que ce soit traité comme un allergène EU14.

#### Phase 1 — Extraction `lib/dietary/`  ·  ✅ Mergée (PR #21, commit 1c7adf8)

La classification végétarien/végétalien a été extraite hors de `src/lib/allergens/` vers
`src/lib/dietary/`. La forteresse allergènes est désormais mono-responsabilité. C'était le
pré-requis archi nécessaire avant toute implémentation des exclusions.

#### Phase 2A — Plomberie + schéma  ·  ✅ Fait

La colonne DB `participants.regimes` a été renommée en `participants.exclusions`, avec
`CHECK` sur le vocabulaire `EXCLUSION_TAGS`. Les vieux blobs JSONB
`contraintes_utilisees.regimes` restent lus via normalisation legacy ; ils ne sont pas
migrés.

#### Session B — Qualification catalogue + garde build  ·  ✅ Fait

- `scripts/ingredient-exclusion-completeness.ts` : règle de complétude `poissons → sans-poisson`, `crustaces|mollusques → sans-fruits-de-mer`, erreur de build.
- Catalogue qualifié : 11 fichiers YAML — `sans-porc` (lardons, jambon, guanciale), `sans-viande-rouge` (bœuf, bouillon bœuf), `sans-alcool` (vins, bière).
- Tests catalogue réel : quiche-lorraine (lardons) ∉ `sans-porc` ; poke-bowl saumon ∉ `sans-poisson`.
- Trou résiduel documenté : porc/viande-rouge/alcool restent à qualification manuelle — ticket TK-20 ouvert.

#### Session C — UI  ·  ✅ Fait

- Picker exclusions dans `sejour-form.tsx` : presets (`Végétarien`, `Vegan`) en un tap + atomiques groupés (`sans-viande-rouge`, `sans-porc`, `sans-poisson`, `sans-fruits-de-mer`, `sans-alcool`) en pills secondaires. Palette neutre (gris) vs allergènes (primary bleu) — distinction visuelle garantie, jamais de rouge/cadenas.
- `pool_empty` : kind dédié dans l'API (`'pool_empty'`), message actionnable, redirection vers `/edit` pour corriger les exclusions.
- E2E Playwright (`e2e/exclusions.spec.ts`) : criterion vegetarien (un tap) + sans-viande-rouge prouvé ; défaut vide ; pool_empty ; distinction visuelle.

**Critères d'acceptation :** l'ami sujet à la goutte peut exclure la viande rouge ; le planning n'en contient aucune ; la forteresse allergènes reste inchangée. ✅

### TK-11 — Combinaisons allergènes manquantes en test intensif  ·  S/M  ·  ✅ Fait
**Origine :** allergen-guard (TK-03). Forteresse — P1.

Le binôme lait+œufs (et d'autres combinaisons courantes) n'est pas couvert par la suite
intensive 100 itérations. Une régression sur ces combos passerait inaperçue : trou direct
dans la promesse "zéro erreur".

Sous-tâches :
- Recenser les combinaisons critiques manquantes (lait+œufs en priorité).
- Les ajouter à la paramétrisation des tests intensifs allergens.
- 100 itérations sans erreur, assertions discriminantes.

**Critères :** lait+œufs et les combos courants couverts en intensif. Passe allergen-guard obligatoire.

---

## P2 — Dette interne (invisible utilisateur)

### TK-06 — CI workflows  ·  ✅ Fait

`.github/workflows/ci.yml` — trois required status checks distincts : `typecheck` (tsc --noEmit repo-wide + guard tests/ dans scope), `test` (Vitest), `validate` (données YAML). qa-engineer mis à jour : check #7 pointe sur le gate CI réel, Règle 4 nomme les trois checks.

### TK-07 — Scission instances Supabase dev/prod  ·  M  ·  ✅ Fait
Dev et prod partagent `ymxqahqrmzerlnyertjf`. Créer une 2e instance (free tier) pour le dev, garder l'actuelle en prod uniquement.


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

### TK-13 — Source unique pour enums SQL + Zod (Trou A)  ·  M
**Origine :** investigation TK-07 (Trou A), ADR-008.

`validate-data` (Zod) ne reflète pas les CHECK SQL. Les deux calques — contraintes
CHECK côté Postgres et enums côté Zod — sont maintenus à la main et dérivent
indépendamment. Une valeur peut passer la CI (Zod la tolère) et casser au seed (le
CHECK SQL la refuse). C'est exactement ce qui s'est produit sur TK-07 : Zod acceptait
`equipement: []`, le CHECK SQL le refusait, et la donnée a voyagé jusqu'au seed dev.
Tant que ce mécanisme existe, l'épisode 005 peut se rejouer à la prochaine divergence.

Sous-tâches :
- Trancher l'approche. Deux familles, qui ne couvrent PAS le même périmètre :
  - **Génération** : un script émet les `ARRAY` des CHECK SQL depuis les enums Zod au
    build. Ferme le trou à la racine pour les CHECK d'appartenance (ingredient_principal,
    type_cuisine). Aveugle aux CHECK d'une autre forme.
  - **Assertion runtime** : `validate-data` lit les CHECK de la migration et les confronte
    aux enums Zod. Crie plus tôt (CI au lieu du seed) sans rendre l'écart impossible, mais
    couvre TOUS les CHECK — y compris la cardinalité, c.-à-d. le cas `equipement` qui a
    déclenché l'épisode.
- Implémenter au minimum sur `ingredient_principal` et `type_cuisine` (les deux enums qui
  ont effectivement dérivé).
- Test discriminant : une divergence introduite volontairement entre un enum Zod et son
  CHECK SQL doit échouer en CI, pas au seed.

**Critères d'acceptation :** un écart enum Zod ↔ CHECK SQL est détecté en CI. Idéalement
structurellement impossible.

> Point de cadrage qui tranche le choix : la génération seule ne couvre que les CHECK
> d'appartenance. Le cas `equipement` était une contrainte de cardinalité — une génération
> d'enums ne l'aurait jamais attrapé. Si l'objectif est de fermer tout le Trou A (le cas
> vécu inclus), la génération seule est insuffisante ; il faut l'assertion runtime, ou les
> deux. À ouvrir en session dédiée, pas en cours de route.

### TK-15 — Baseline de schéma DB + source de vérité unique  ·  M
**Origine :** incident 500 /shopping-list. Cause racine : aucune migration ne reproduit le schéma courant from scratch.

Dev et prod ont dérivé librement parce que les changements de schéma ont été appliqués hors système de migration (dashboard, ALTER manuels). Prod avait une génération de retard ET des colonnes héritées que dev n'a plus. Le repo ne sait pas reconstruire le schéma actuel. Tant que ce socle manque, l'incident se rejoue à la prochaine divergence.

Sous-tâches :
- Générer une migration baseline capturant le schéma canonique actuel (dump du schéma dev).
- Mettre en place le suivi des migrations appliquées (si absent), pour que dev/prod/futures instances convergent depuis cette baseline.
- Règle dure : tout changement de schéma = une migration committée, appliquée à TOUS les environnements. Fin du SQL dashboard hors-migration.
- Rédiger l'ADR : le schéma DB a une source de vérité unique versionnée.

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

### TK-18 — Bug d'hydratation ShareLink (URL relative SSR vs absolue client)  ·  S
**Origine :** repéré pendant le debug de l'incident shopping-list.

`ShareLink.tsx:39` — `displayUrl` calculé via `window.location.origin`, indisponible au SSR. Le serveur rend le chemin relatif, le client l'URL absolue → mismatch d'hydratation. React régénère côté client, mais le warning est réel et l'URL de partage peut flasher en relatif. Or c'est LE mécanisme de partage du produit (CLAUDE_PROJECT.md §5), pas un détail.

Sous-tâches :
- Rendre l'origin déterministe des deux côtés via `NEXT_PUBLIC_SITE_URL` (SSR et client rendent la même URL absolue), plutôt qu'un calcul client-only avec flash.

**Critères :** pas de mismatch d'hydratation sur `/sejour` ; URL de partage absolue, identique SSR et client.

---

## V2 — Hors MVP (noté pour mémoire)

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
| TK-01 | Moteur de planning cohérent | P0 | XL | Fait |
| TK-02 | Refonte modèle d'unités d'achat | P0 | L (réel S) | Fait |
| TK-03 | Édition séjour + flow génération | P0 | L | Fait |
| TK-04 | Bug inputs number iPhone | P0 | S | Fait |
| TK-05 | Exclusions alimentaires | P1 | M | Fait |
| TK-06 | CI workflows | P2 | M | Fait |
| TK-07 | Scission Supabase dev/prod | P2 | M | Fait |
| TK-08 | Réutilisation ingrédients | V2 | — | À faire |
| TK-09 | Nettoyage DAL sejours | P2 | M | À faire |
| TK-10 | createSejour atomique via RPC | P2 | M | À faire |
| TK-11 | Combos allergènes en test intensif | P1 | S/M | Fait |
| TK-12 | Tests d'intégration TK-03 | P2 | M | À faire |
| TK-13 | Source unique enums SQL + Zod (Trou A) | P2 | M | À faire |
| TK-14 | Règles de cohérence sémantiques restantes | V2 | — | À faire |
| TK-15 | Baseline schéma DB + source de vérité | P2 | M | À faire |
| TK-16 | Gate déploiement : schéma DB ↔ code | P2 | M | À faire |
| TK-17 | Seed : purge des orphelins | P2 | S/M | À faire |
| TK-18 | Bug hydratation ShareLink | P2 | S | À faire |
| TK-20 | Raffiner taxonomie ingrédients (garde déterministe porc/viande-rouge/alcool) | P2 | M | À faire |

**Ordre conseillé :** dette data/DAL (TK-09, TK-10, TK-13, TK-12, TK-20) quand le fonctionnel est stable → V2 (TK-08, TK-14).
