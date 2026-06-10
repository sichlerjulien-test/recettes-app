# ADR-011 — Exclusions alimentaires (module `lib/dietary/`)

**Statut** : Accepté
**Date** : 2026-06-09
**Auteur** : Équipe Meal Planner
**Décideurs** : Tous les membres du projet

## Contexte

### Besoin fonctionnel (TK-05)

Un participant doit pouvoir exclure des aliments pour des raisons morales,
religieuses ou médicales non couvertes par les allergènes EU14 : viande rouge,
porc, poisson, fruits de mer, alcool, etc. Ce n'est pas un allergène — il n'y
a pas de risque médical immédiat en cas d'erreur — mais c'est une contrainte
réelle que le planning doit respecter.

### Contamination conceptuelle dans la forteresse (prédiagnostic TK-07 / allergen-guard)

La classification végétarien/vegan est actuellement implémentée dans
`src/lib/allergens/compute.ts` (calcul de `est_vegetarien`, `est_vegan`) et
dans `src/lib/allergens/validator.ts` (violation `regime`). DIETARY_RESTRICTIONS
et DietaryRestriction sont définis dans `data/seed-allergenes.ts`.

ADR-001 pose que `lib/allergens/` est une forteresse mono-responsabilité : EU14
et rien d'autre. Cette contamination viole la doctrine. Implémenter TK-05 en
l'état — étendre DIETARY_RESTRICTIONS, ajouter des cas `regime` dans le
validateur — empiolerait une 2e responsabilité d'exclusion sur le module le plus
sacré du projet.

### Pré-requis : extraire d'abord, implémenter ensuite

Le séquençage est gravé dans cet ADR (§ Décision 8) : la forteresse est touchée
**une seule fois** pour extraire la classification végé, sous protocole
allergen-guard. L'implémentation des exclusions intervient après, hors forteresse.

---

## Décisions

### 1 — Nouveau module `src/lib/dietary/`

Un module dédié `src/lib/dietary/` héberge toute la logique d'exclusion
alimentaire. Périmètre :

- `exclusion.ts` — définitions des tags, groupes, presets, schémas Zod
- `compute.ts` — calcul de `exclusions_compatibles` sur les recettes au build
  (reçoit aussi la logique végé extraite de `lib/allergens/compute.ts`)
- `filter.ts` — filtrage pré-LLM du catalogue par exclusions
- `validator.ts` — backstop post-LLM, bloquant + retry

`lib/allergens/` ne connaît plus que l'EU14 après l'extraction (Phase 1).
`lib/dietary/` peut importer depuis `lib/types/`, jamais depuis `lib/allergens/`.
La dépendance est unidirectionnelle : `generatePlanning` (lib/llm/) appelle les
deux modules séparément.

### 2 — Primitive unique : ExclusionTag (presets = macros de blocklist)

Il n'y a pas de mécanisme séparé "régime" vs "exclusion". Un seul concept :
**ExclusionTag**. `vegetarien` et `vegan` sont des presets nommés dont la
sémantique est encodée dans le calcul de `exclusions_compatibles` — ce ne sont
pas des branches de code spéciales, juste des tags comme les autres du point de
vue du filtre.

```ts
// src/lib/dietary/exclusion.ts

export const EXCLUSION_TAGS = [
  // Atomiques
  'sans-viande-rouge',   // bœuf, agneau (viandes rouges au sens culinaire)
  'sans-porc',           // porc y compris traces (lardons, jambon) — voir § 6
  'sans-poisson',
  'sans-fruits-de-mer',
  'sans-alcool',
  // Presets nommés (macros de blocklist)
  'vegetarien',          // ⊃ sans-viande-rouge + sans-porc + sans-poisson + sans-fruits-de-mer
  'vegan',               // ⊃ vegetarien + sans produits animaux non-EU14
] as const;

export const ExclusionTagSchema = z.enum(EXCLUSION_TAGS);
export type ExclusionTag = z.infer<typeof ExclusionTagSchema>;

// Groupes d'affichage UI — non utilisés dans la logique de filtrage
export const EXCLUSION_GROUPS = {
  proteines: ['sans-viande-rouge', 'sans-porc', 'sans-poisson', 'sans-fruits-de-mer'],
  substances: ['sans-alcool'],
  presets: ['vegetarien', 'vegan'],
} as const satisfies Record<string, readonly ExclusionTag[]>;
```

**Relation presets → atomiques :** le calcul de `exclusions_compatibles` sur une
recette traite végétarien et vegan selon leur sémantique propre (recalculée depuis
les ingrédients). Il n'y a pas de "dépliage" de presets en tags atomiques côté
participant — un participant déclare `vegetarien` et le filtre vérifie le tag
`vegetarien` directement.

### 3 — Liste figée, zéro saisie libre

L'ensemble des ExclusionTag est une constante compilée. Aucune saisie libre n'est
autorisée — ni dans les YAML, ni dans l'UI.

Motif : le filtre pré-LLM est déterministe par construction (ADR-001). Une
exclusion saisie librement nécessiterait un matching NLP probabiliste pour
savoir quels ingrédients exclure — incompatible avec la garantie déterministe.
Si un nouveau besoin d'exclusion émerge, il fait l'objet d'une PR ajoutant la
valeur à EXCLUSION_TAGS et requalifiant les ingrédients concernés.

### 4 — Booléens précalculés au build sur les recettes (`exclusions_compatibles`)

Le schéma Recette reçoit un champ `exclusions_compatibles: ExclusionTag[]`
**calculé au build** (dans `lib/dietary/compute.ts`), pas déclaré dans les YAML
recettes. Ce champ liste tous les tags d'exclusion compatibles avec la recette.

```ts
// Ajout à RecetteInputSchema / RecetteSchema (src/lib/types/schemas.ts)
exclusions_compatibles: z.array(ExclusionTagSchema),
// Phase 2 : remplace est_vegetarien et est_vegan (voir § 8)
```

**Motif du calcul automatique :** exiger une déclaration manuelle dans chaque YAML
recette introduit un trou de maintenance — une recette mal taguée serait
silencieusement servie à quelqu'un qui l'a exclue. Le calcul depuis les ingrédients
(qui eux portent `exclusion_tags`) est déterministe et auditable.

**Filtre :** une recette passe le filtre exclusions si et seulement si tous les tags
d'exclusion demandés par le groupe sont présents dans `exclusions_compatibles` :

```ts
// lib/dietary/filter.ts
export function filterByExclusions(
  recipes: readonly Recette[],
  exclusions_groupe: readonly ExclusionTag[],
): Recette[] {
  if (exclusions_groupe.length === 0) return recipes as Recette[];
  const required = new Set(exclusions_groupe);
  return recipes.filter(r =>
    r.exclusions_compatibles.every(tag => required.has(tag) || true) &&
    [...required].every(tag => r.exclusions_compatibles.includes(tag)),
  );
}
```

### 5 — Blocklist pure : l'allowlist non-exhaustive n'existe pas

Le système modélise uniquement ce qu'on **exclut**. "Je veux seulement du poulet
ou de la dinde" n'est pas modélisable directement — ce n'est pas une liste
d'exclusions finie dans l'espace des recettes possibles.

**Résolution :** un utilisateur très restrictif coche les exclusions pertinentes.
Si la combinaison d'exclusions vide le pool de recettes, le système retourne
`pool_empty` — exactement le même traitement que pour des allergènes très
restrictifs (ADR-001, Étage 1). Le message UI propose de relâcher des exclusions
ou de contacter le gestionnaire du catalogue.

Il n'y aura jamais de champ "inclure uniquement" ni de logique allowlist. Ce
périmètre est **fermé**.

### 6 — Porc : exclusion trace, pas exclusion de protéine dominante

`ingredient_principal: 'porc'` n'est **pas** le signal d'exclusion. Le signal est
`exclusion_tags: ['sans-porc']` sur **chaque ingrédient** portant du porc — y
compris les ingrédients secondaires (lardons dans une quiche aux œufs, jambon
dans une pizza).

Ce choix résout le cas religieux : une quiche aux œufs avec lardons est exclue
pour quelqu'un qui évite le porc, même si son `ingredient_principal` est `oeufs`.

```ts
// Ajout à IngredientSchema (src/lib/types/schemas.ts)
exclusion_tags: z.array(ExclusionTagSchema).default([]),
```

Exemples de qualification dans les YAML ingrédients :
```yaml
# lardons.yaml
exclusion_tags: ['sans-porc', 'sans-viande-rouge']

# saucisse-merguez.yaml
exclusion_tags: ['sans-viande-rouge']

# vin-blanc.yaml
exclusion_tags: ['sans-alcool']
```

`exclusions_compatibles` sur la recette est calculé ainsi :
- Pour les tags atomiques : union de tous les `exclusion_tags` des ingrédients
  non-optionnels de la recette. La recette est compatible avec le tag X si aucun
  ingrédient non-optionnel ne porte X.
- Pour `vegetarien` : recalculé depuis la logique extraite de
  `lib/allergens/compute.ts` (migration Phase 1) — aucun `ingredient_principal`
  non-végétarien, aucun ingrédient non-optionnel en catégorie
  `viandes-poissons`.
- Pour `vegan` : végétarien + aucun ingrédient non-optionnel en catégorie
  `cremerie-oeufs` ni `ingredient_principal` non-vegan.

### 7 — Schémas Zod complets

**Sur les participants (Phase 2, remplace `regimes`) :**

```ts
// ParticipantSchema (src/lib/types/schemas.ts)
// Avant Phase 2 : regimes: z.array(DietaryRestrictionSchema).default([])
// Après Phase 2 :
exclusions: z.array(ExclusionTagSchema).default([]),
```

Le champ `regimes` et `DietaryRestrictionSchema` sont supprimés de
`src/lib/types/schemas.ts` et de `data/seed-allergenes.ts` en Phase 2 (voir § 8).

**Violation dietary (lib/dietary/) :**

```ts
// src/lib/dietary/validator.ts
export const ExclusionViolationSchema = z.object({
  kind: z.literal('exclusion'),
  recette_id: z.string(),
  recette_nom: z.string(),
  exclusion_tag: ExclusionTagSchema,
  participant_id: z.union([z.string(), z.undefined()]),
  participant_nom: z.union([z.string(), z.undefined()]),
});

export type ExclusionViolation = z.infer<typeof ExclusionViolationSchema>;

export interface ExclusionValidationResult {
  valid: boolean;
  violations: ExclusionViolation[];
}
```

Ce type est **propre à `lib/dietary/`** — il n'est pas ajouté à
`ValidationViolationSchema` (lib/allergens/). Les deux résultats sont propagés
séparément à l'appelant (generatePlanning).

**Contrat de retour de `generatePlanning` (amendement ADR-004) :**

```ts
// Branche ok: false
| { ok: false; kind: 'validation_failed_after_retries';
    last_security_violations: ValidationViolation[];
    last_exclusion_violations: ExclusionViolation[] }
```

La branche `ok: true` est inchangée (les exclusions sont garanties respectées
par construction si la réponse est un succès).

### 8 — Séquençage Phase 1 / Phase 2 : jamais mélangées

**Phase 1 — Extraction hors forteresse (pré-requis TK-05)**

Objectif : `lib/allergens/` ne connaît plus que l'EU14.

Périmètre exact de la modification en forteresse (une seule PR, sous
allergen-guard obligatoire) :
1. Déplacer la logique végétarien/vegan de `lib/allergens/compute.ts` vers
   `lib/dietary/compute.ts` (nouvelle fonction `computeDietaryMetadata`).
2. Retirer les cases `regime` de `lib/allergens/validator.ts`. La vérification
   végétarien/vegan est temporairement assurée par `lib/dietary/validator.ts`
   (qui reprend les checks `est_vegetarien`/`est_vegan` existants).
3. Migrer `DIETARY_RESTRICTIONS`, `DietaryRestriction` de `data/seed-allergenes.ts`
   vers `lib/dietary/exclusion.ts`. `data/seed-allergenes.ts` n'exporte plus que
   EU14_ALLERGENS et ses dérivés.
4. `est_vegetarien` et `est_vegan` restent sur RecetteSchema **en Phase 1** —
   leur suppression intervient en Phase 2 (changement cassant, nécessite une
   migration des données et des tests).

Critère d'acceptation Phase 1 : les tests allergen-guard passent sans
modification de leur logique interne ; `grep -r 'vegetar\|vegan\|regime'
src/lib/allergens/` remonte zéro résultat.

**Phase 2 — Exclusions alimentaires (TK-05)**

Aucune modification dans `lib/allergens/`. Périmètre :
1. `exclusion_tags` sur IngredientSchema + qualification des YAML ingrédients.
2. `exclusions_compatibles` sur RecetteInputSchema/RecetteSchema (calculé au
   build dans `lib/dietary/compute.ts`).
3. Suppression de `est_vegetarien` et `est_vegan` de RecetteSchema.
4. `exclusions` sur ParticipantSchema (remplace `regimes`).
5. `lib/dietary/filter.ts` : `filterByExclusions`.
6. `lib/dietary/validator.ts` : `validateExclusions`.
7. `generatePlanning` amendé : deux filtres en séquence, trois validateurs.
8. UI : composant de sélection des exclusions par participant.

### 9 — Validation CI de complétude des `exclusion_tags` et garde allergen-guard sur les YAML ingrédients

**Règle de complétude au build :** le validateur YAML existant embarque une règle de
complétude sur `exclusion_tags` :

> Tout ingrédient dont la catégorie appartient à `CATEGORIES_PORC` (constante dans le
> script de validation, ex : `'charcuterie'`, `'viandes-porcines'`, `'porcin'`) **doit**
> porter `sans-porc` dans ses `exclusion_tags`.

La violation est une **erreur de build**, pas un warning — même traitement qu'un
allergène manquant dans seed-allergenes. Elle ferme la fenêtre d'un ingrédient porcin
silencieusement non-tagué, sans reposer sur l'œil du relecteur.

Le gate est déclaratif : si `CATEGORIES_PORC` est étendue, la règle couvre
automatiquement les nouveaux ingrédients sans PR de suivi.

**Garde allergen-guard sur le YAML ingrédients :** allergen-guard est déclenché sur
toute PR qui modifie `data/ingredients/` **et** touche un tag à coût social élevé
(`sans-porc`, ou tout tag dont l'impact sur une pratique religieuse ou morale est
documenté dans EXCLUSION_TAGS). La frontière de sanctuaire (ADR-001) reste sur le
code (`lib/allergens/`). L'exigence de soin suit la criticité de la donnée
indépendamment : un tag manqué dans un YAML ingrédient a le même potentiel de dommage
qu'un bug dans le code du filtre.

La configuration allergen-guard (hooks CI ou CODEOWNERS) liste explicitement
`data/ingredients/*.yaml` comme périmètre déclencheur pour les tags à coût social
élevé.

### 10 — Validateur `validateExclusions` : bloquant + retry, hors forteresse

```ts
// lib/dietary/validator.ts
export function validateExclusions(
  planning: Planning,
  recettesMap: Map<string, Recette>,
  participants: readonly Participant[],
): ExclusionValidationResult
```

**Comportement :** même mécanique que `validatePlanning` (ADR-001, Étage 3) —
backstop post-LLM, retry déclenché sur toute violation. Le retry se déclenche
sur **(violation sécurité allergen) OU (violation exclusion)**.

**Motif du bloquant :** si le filtre pré-LLM a correctement exclu les recettes
incompatibles du pool, le LLM ne peut pas en choisir une — une violation post-LLM
signale un bug de données (recette mal calculée) ou un bug de filtre, pas une
hallucination. Le retry force une deuxième passe ; si la violation persiste après
MAX_ATTEMPTS, le caller reçoit `validation_failed_after_retries` avec le détail
des violations exclusion et sécurité.

**Ordre d'appel dans `generatePlanning` :**

```
filterRecipes (lib/allergens/)        — allergènes + vegan/végétarien (Phase 1)
  ↓
filterByExclusions (lib/dietary/)     — exclusions atomiques
  ↓
LLM (pool double-filtré)
  ↓
validatePlanning (lib/allergens/)     — backstop sécurité allergen [bloquant]
  ↓
validateExclusions (lib/dietary/)     — backstop exclusions [bloquant]
  ↓
validateCoherence (lib/coherence/)    — cohérence structurelle [bloquant|qualité]
```

### 11 — Sévérité : préférence, pas sécurité médicale

Une violation d'exclusion n'a pas le même poids moral et légal qu'une violation
allergène EU14. Un participant cœliaque mis en danger par du gluten est une faute
grave. Un végétarien servi avec du poulet est un manquement sérieux au contrat
produit — pas une urgence médicale.

Cette distinction est documentée explicitement mais **ne change pas le comportement
technique** : les deux violations sont bloquantes et déclenchent un retry.
Le motif : si la garantie est "le planning respecte les exclusions déclarées", elle
doit être absolue pour avoir de la valeur. Une exclusion "best effort" perdrait la
confiance des utilisateurs tout autant qu'un allergène raté.

Ce qui change entre allergen et exclusion :
- **Audit** : les violations exclusion n'ont pas la même gravité dans les logs
  (niveau `warn` vs `error`) — mais elles sont toujours loguées.
- **Message UI** : "Nous n'avons pas pu générer un planning respectant toutes vos
  exclusions" ≠ "Nous n'avons pas pu garantir la sécurité allergènes".
- **Responsabilité** : une violation exclusion n'expose pas à une responsabilité
  légale EU14 — mais c'est un bug produit à corriger.

---

## Conséquences

### Positives

- **Forteresse nettoyée.** `lib/allergens/` ne contient plus que l'EU14 après
  Phase 1 — sa surface de modification se réduit à sa mission déclarée.
- **Extensibilité figée.** Ajouter une exclusion = PR sur EXCLUSION_TAGS +
  requalification des ingrédients. Aucune branche de code à ouvrir.
- **Cohérence conceptuelle.** Un seul concept (ExclusionTag) au lieu de deux
  mécanismes parallèles (régimes + exclusions futures).
- **Garantie déterministe préservée.** Le filtre dietary est aussi déterministe
  que le filtre allergen — même architecture, même audit trail.

### Négatives

- **Qualification manuelle des YAML ingrédients.** Chaque ingrédient portant du
  porc, de l'alcool, etc. doit être qualifié avec `exclusion_tags`. Dette de
  curation one-shot sur le catalogue actuel (~50 recettes, ~300 ingrédients).
- **Suppression de `est_vegetarien`/`est_vegan` breaking.** Tout code qui lit ces
  champs directement doit migrer vers `exclusions_compatibles.includes(...)`.
  Le gate TypeScript (ADR-010) attrapera les oublis à la compilation.
- **Suppression de `regimes` sur Participant breaking.** Migré vers `exclusions`
  par TK-19.
  **Attention : le gate `tsc --noEmit` ne couvre pas `contraintes_utilisees.regimes`
  en base.** La route `createPlanning` persiste `contraintes_utilisees` comme blob
  JSON ; `tsc` ne voit pas la forme des rows Supabase (frontière `any`). Si un schéma
  Zod valide `contraintes_utilisees` en lecture et qu'il attend `regimes`, ça pète à
  l'exécution sur les plannings existants, pas à la compilation.
  **Décision appliquée :** la colonne participant est renommée en `exclusions` ; le
  seul accès legacy restant cible les vieux blobs JSONB `contraintes_utilisees`, qui
  sont normalisés à la lecture et ne sont pas migrés.

### Neutres

- Pas de changement de comportement observable sur les plannings existants si la
  qualification des ingrédients est correcte (même règles, nouvelle plomberie).
- `ValidationViolationSchema` dans `lib/allergens/` perd `RegimeViolationSchema`
  en Phase 2 — changement de surface d'API, non-breaking pour les clients qui ne
  produisent pas de violations `regime`.

---

## Non-objectifs

Hors scope de cet ADR :

- **Saisie libre d'exclusions.** Fermé définitivement (§ 3).
- **Exclusions par recette** (l'utilisateur note une recette inacceptable à la main).
  Différent du mécanisme d'exclusion par tag — chantier UX distinct si besoin.
- **Hiérarchie de sévérité entre exclusions.** Toutes les exclusions ont le même
  comportement bloquant (§ 10). Une gradation fine (bloquant vs avertissement)
  pourrait être envisagée V2 si un retour terrain le justifie.
- **Compatibilité positive** ("contient du poulet"). Non modélisé — le système
  ne promet que les exclusions déclarées, pas les préférences positives.

---

## Alternatives écartées

### Alternative A — Booléens N× sur le schéma Recette

Ajouter un champ booléen par exclusion sur RecetteSchema :
`est_sans_porc: boolean`, `est_sans_viande_rouge: boolean`, etc.

Rejetée : pattern `est_vegetarien`/`est_vegan` qui a montré ses limites — 2 champs
pour 2 régimes, mais N champs pour N exclusions futures n'est pas maintenable. Un
champ `exclusions_compatibles: ExclusionTag[]` offre la même propriété
d'accessibilité O(1) (via Set) sans explosion du schéma. Le gate TypeScript garantit
que tout tag ajouté à l'enum est traité dans le calcul.

### Alternative B — Groupes `porc`, `rouge`, etc. dans l'enum `ingredient_principal`

Ajouter des valeurs d'ingredient_principal pour les sous-catégories de viandes
(`boeuf-agneau` = viandes rouges, `porc-charcuterie` = porc élargi).

Rejetée : `ingredient_principal` encode la protéine dominante de la recette, pas
la liste de ses ingrédients. Une quiche aux œufs avec lardons a `ingredient_principal:
oeufs` — surcharger cet enum ne résout pas le cas trace. Cela casserait aussi les
règles de cohérence structurelle qui lisent `ingredient_principal` (ADR-009 § 3).

### Alternative C — Porc en niveau `ingredient_principal` uniquement

Exclure les recettes dont `ingredient_principal === 'porc'` et ignorer les traces.

Rejetée : cas religieux explicitement documenté en contexte (lardons dans une quiche
aux œufs). Un croyant qui n'accepte aucune trace de porc aurait une violation
silencieuse. La promesse produit exige la même exhaustivité que pour les allergènes —
le filtre doit porter sur tous les ingrédients non-optionnels.

### Alternative D — `exclusion_tags` déclaré dans les YAML recettes (mapping déclaratif)

Laisser chaque auteur de recette déclarer `exclusions_compatibles` à la main.

Rejetée : même problème que les données YAML ingrédients mal qualifiées — une
recette mal déclarée passe le filtre silencieusement. En calculant automatiquement
`exclusions_compatibles` depuis les `exclusion_tags` des ingrédients (source unique
de vérité), une erreur de qualification sur un ingrédient affecte toutes les recettes
qui l'utilisent — détectable en test unitaire sur le catalogue.

### Alternative E — Étendre la liste EU14 avec "porc", "alcool", etc.

Traiter les exclusions comme des allergènes EU14 étendus.

Rejetée : violerait ADR-001 et le règlement INCO. EU14 est une liste légale
fermée — l'étendre avec des préférences alimentaires mélange des catégories de
responsabilité radicalement différentes et complexifie les audits de conformité.
La forteresse perdrait sa valeur si sa frontière est perméable aux préférences.

---

## Critères de revue

Cette décision sera réévaluée si :

- Un nouveau type d'exclusion ne peut pas être capturé par `exclusion_tags` sur
  les ingrédients (ex : exclusion basée sur un mode de préparation plutôt que sur
  un ingrédient). À ce stade, envisager une 2e dimension de qualification.
- Le catalogue grossit à un point où la curation manuelle des `exclusion_tags`
  devient un goulot d'étranglement — envisager une classification semi-automatique
  assistée par l'outillage de seed.
- Un retour terrain montre qu'une exclusion doit être `'qualite'` (avertissement)
  plutôt que bloquante — rouvrir § 10 avec des données concrètes.

---

## Références

- ADR-001 — Architecture 4 étages ; forteresse allergens ; pool_empty comme retour
  légitime
- ADR-002 — Zod comme source unique de vérité ; ExclusionTagSchema y est sujet
- ADR-004 — Module LLM amendé (§ 9 : deux filtres, trois validateurs)
- ADR-009 — Playbook d'extraction hors forteresse (Phase 1 suit ce playbook) ;
  non-objectifs incluaient "ADR dédié aux exclusions alimentaires"
- BACKLOG.md TK-05 — Critères d'acceptation : pool_empty si pool vide, forteresse
  inchangée après Phase 2

## Historique d'implémentation

- Phase 1 mergée le 2026-06-09 via PR #21.
- Phase 2A mergée le 2026-06-10 via PR #22.
- Décision Étape 0 gravée : les colonnes DB `regimes`, `est_vegetarien` et
  `est_vegan` sont conservées ; le mapping app<->DB se fait au DAL ; la lecture
  de `contraintes_utilisees` est normalisée (`regimes` -> `exclusions`) ; zéro
  migration SQL en 2A. Motif : éviter une dérive de schéma classe TK-15/16.
- Correction post-PR #22 : le read-path des vieux blobs JSONB
  `contraintes_utilisees.regimes` est normalisé en `exclusions`, avec tests
  discriminants. Cette compatibilité reste nécessaire tant que les archives ne sont
  pas migrées.
- TK-19 validé sur dev le 2026-06-10 : nouvelle migration
  `007-rename-regimes-to-exclusions.sql`, renommage
  `participants.regimes` -> `participants.exclusions`, ajout du CHECK
  `participants_exclusions_valid`, suppression du mapping DAL app<->DB.
  Prod reste une application humaine séparée conformément à ADR-008.
